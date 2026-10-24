/**
 * ZALOMANAGER.JS
 * Quản lý đa tài khoản Zalo cá nhân độc lập dựa trên thư viện zca-js
 * Đảm bảo:
 * 1. Độc lập hoàn toàn, không phụ thuộc UI CRM
 * 2. Lọc chỉ nhận tin nhắn MỚI từ thời điểm cấu hình trở đi (msgTime >= configuredAt)
 * 3. Hỗ trợ đa tài khoản (Map<accountId, AccountSession>)
 * 4. Chuyển tiếp tin nhắn đến CRM qua Webhook an toàn
 */

const fs = require('fs');
const path = require('path');
const { Zalo, ThreadType, LoginQRCallbackEventType } = require('zca-js');

class ZaloManager {
    constructor() {
        // Danh sách tài khoản Zalo đang hoạt động: Map<accountId, AccountData>
        this.activeAccounts = new Map();
        
        // Danh sách các phiên đăng nhập QR đang chờ xử lý: Map<sessionId, SessionData>
        this.pendingSessions = new Map();

        this.crmWebhookUrl = process.env.CRM_WEBHOOK_URL || 'https://omnichannel.gt.tc/api/zalo_action.php';
        this.gatewayKey = (process.env.ZALO_GATEWAY_KEY || 'omnichannel_zalo_secret_2026').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

        // Hàng đợi lưu trữ sự kiện tạm thời (In-memory buffer) để CRM trình duyệt kéo về (miễn nhiễm Anti-Bot)
        this.pendingEvents = [];

        // Tự động dọn dẹp các session QR hết hạn (> 10 phút)
        setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
    }

    addPendingEvent(event) {
        if (this.pendingEvents.length > 200) {
            this.pendingEvents.shift();
        }
        this.pendingEvents.push({
            ...event,
            queued_at: Date.now()
        });
    }

    getPendingEvents() {
        return this.pendingEvents.splice(0, 50);
    }

    /**
     * Dọn dẹp phiên QR cũ
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.pendingSessions.entries()) {
            if (now - session.createdAt > 10 * 60 * 1000) {
                // Xóa file QR tạm nếu có
                if (session.tempQrPath && fs.existsSync(session.tempQrPath)) {
                    try { fs.unlinkSync(session.tempQrPath); } catch (e) {}
                }
                this.pendingSessions.delete(sessionId);
            }
        }
    }

    /**
     * Khởi tạo phiên quét mã QR mới
     */
    async generateQRSession() {
        const sessionId = 'zqr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const tempQrPath = path.join(__dirname, `temp_qr_${sessionId}.png`);

        const session = {
            sessionId,
            status: 'INITIALIZING',
            qrCode: null, // Chuỗi base64 data URL
            accountId: null,
            accountName: null,
            error: null,
            tempQrPath,
            createdAt: Date.now()
        };

        this.pendingSessions.set(sessionId, session);

        // Khởi chạy tiến trình đăng nhập QR nền (không chặn response trả về sessionId)
        this.startLoginQRProcess(sessionId, tempQrPath);

        return {
            success: true,
            session_id: sessionId
        };
    }

    /**
     * Tiến trình thực hiện loginQR bằng zca-js
     */
    async startLoginQRProcess(sessionId, tempQrPath) {
        const session = this.pendingSessions.get(sessionId);
        if (!session) return;

        try {
            console.log(`[ZaloManager] Bắt đầu khởi tạo loginQR cho session: ${sessionId}`);

            const zalo = new Zalo({
                selfListen: false,   // Không lắng nghe tin do chính mình gửi đi từ máy điện thoại
                checkUpdate: false,  // Bỏ qua kiểm tra cập nhật để tăng tốc
                logging: true        // Bật log để tiện theo dõi
            });

            const api = await zalo.loginQR(
                {
                    qrPath: tempQrPath
                },
                async (eventOrPath) => {
                    const currentSession = this.pendingSessions.get(sessionId);
                    if (!currentSession) return;

                    console.log(`[ZaloManager][${sessionId}] Callback received:`, typeof eventOrPath);

                    // TH1: Callback nhận trực tiếp đường dẫn file ảnh qrPath (string)
                    if (typeof eventOrPath === 'string') {
                        currentSession.status = 'WAITING_SCAN';
                        const filePath = eventOrPath || tempQrPath;
                        if (fs.existsSync(filePath)) {
                            try {
                                const buffer = fs.readFileSync(filePath);
                                currentSession.qrCode = `data:image/png;base64,${buffer.toString('base64')}`;
                                console.log(`[ZaloManager][${sessionId}] Đã nạp ảnh QR từ đường dẫn file: ${filePath}`);
                            } catch (e) {}
                        }
                        return;
                    }

                    // TH2: Callback nhận vào một object event (LoginQRCallbackEventType)
                    const event = eventOrPath || {};
                    const eventType = event.type;

                    const isGenerated = (eventType === LoginQRCallbackEventType?.QRCodeGenerated || eventType === 0 || eventType === 'QRCodeGenerated');
                    const isScanned   = (eventType === LoginQRCallbackEventType?.QRCodeScanned || eventType === 1 || eventType === 'QRCodeScanned');
                    const isConfirmed = (eventType === LoginQRCallbackEventType?.GotLoginInfo || eventType === 3 || eventType === 'GotLoginInfo');
                    const isDeclined  = (eventType === LoginQRCallbackEventType?.QRCodeDeclined || eventType === 2 || eventType === 'QRCodeDeclined');
                    const isExpired   = (eventType === LoginQRCallbackEventType?.QRCodeExpired || eventType === 4 || eventType === 'QRCodeExpired');

                    if (isGenerated) {
                        currentSession.status = 'WAITING_SCAN';
                        let qrBase64 = null;
                        if (event.data && event.data.image) {
                            qrBase64 = event.data.image;
                            if (!qrBase64.startsWith('data:image')) {
                                qrBase64 = `data:image/png;base64,${qrBase64}`;
                            }
                        }

                        if (event.actions && typeof event.actions.saveToFile === 'function') {
                            try {
                                await event.actions.saveToFile(tempQrPath);
                            } catch (e) {}
                        }

                        if (!qrBase64 && fs.existsSync(tempQrPath)) {
                            try {
                                const buffer = fs.readFileSync(tempQrPath);
                                qrBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
                            } catch (e) {}
                        }

                        currentSession.qrCode = qrBase64;
                        console.log(`[ZaloManager][${sessionId}] Đã tạo mã QR thành công.`);
                    } else if (isScanned) {
                        currentSession.status = 'SCANNED';
                        console.log(`[ZaloManager][${sessionId}] Người dùng đã quét mã trên điện thoại, chờ xác nhận...`);
                    } else if (isConfirmed) {
                        currentSession.status = 'CONFIRMED';
                        console.log(`[ZaloManager][${sessionId}] Đã xác nhận đăng nhập thành công.`);
                    } else if (isDeclined) {
                        currentSession.status = 'DECLINED';
                        currentSession.error = 'Đăng nhập bị từ chối trên thiết bị Zalo di động.';
                        console.warn(`[ZaloManager][${sessionId}] Người dùng từ chối đăng nhập.`);
                    } else if (isExpired) {
                        currentSession.status = 'EXPIRED';
                        currentSession.error = 'Mã QR đã hết hạn, vui lòng làm mới.';
                        console.warn(`[ZaloManager][${sessionId}] Mã QR hết hạn.`);
                        if (event.actions && typeof event.actions.retry === 'function') {
                            try { event.actions.retry(); } catch (e) {}
                        }
                    }
                }
            );

            // Đăng nhập thành công, api đã sẵn sàng
            const accountId = String(api.getOwnId());
            const configuredAt = Date.now(); // Mốc thời gian cấu hình tài khoản

            // Lấy thông tin tài khoản hiển thị
            let accountName = `Zalo ${accountId.slice(-4)}`;
            let accountAvatar = '';

            try {
                const info = await api.fetchAccountInfo();
                if (info) {
                    accountName = info.name || info.displayName || info.data?.name || accountName;
                    accountAvatar = info.avatar || info.data?.avatar || '';
                }
            } catch (err) {
                console.warn(`[ZaloManager] fetchAccountInfo error for ${accountId}:`, err.message);
            }

            // Xóa file QR tạm
            if (fs.existsSync(tempQrPath)) {
                try { fs.unlinkSync(tempQrPath); } catch (e) {}
            }

            console.log(`[ZaloManager] Thiết lập thành công tài khoản Zalo: ${accountName} (ID: ${accountId})`);

            // Đăng ký Listener tin nhắn
            this.setupAccountListener(api, accountId, accountName, configuredAt);

            // Lưu vào danh sách tài khoản active
            this.activeAccounts.set(accountId, {
                id: accountId,
                name: accountName,
                avatar: accountAvatar,
                api,
                zalo,
                configuredAt,
                status: 'CONNECTED',
                connectedAt: new Date().toISOString()
            });

            // Cập nhật session thành công
            session.status = 'SUCCESS';
            session.accountId = accountId;
            session.accountName = accountName;

            // Báo sang CRM biết tài khoản đã kết nối
            this.notifyCRM({
                action: 'account_connected',
                account_id: accountId,
                account_name: accountName,
                account_avatar: accountAvatar,
                configured_at: configuredAt
            });

        } catch (error) {
            console.error(`[ZaloManager][${sessionId}] Lỗi trong tiến trình loginQR:`, error);
            session.status = 'ERROR';
            session.error = error.message || 'Lỗi không xác định khi đăng nhập Zalo';
            if (fs.existsSync(tempQrPath)) {
                try { fs.unlinkSync(tempQrPath); } catch (e) {}
            }
        }
    }

    /**
     * Đăng ký Event Listener cho tài khoản Zalo
     */
    setupAccountListener(api, accountId, accountName, configuredAt) {
        // 1. Lắng nghe tin nhắn mới
        api.listener.on('message', async (message) => {
            try {
                // RULE 1: Chỉ nhận tin nhắn cá nhân 1-1, bỏ qua chat nhóm
                if (message.type !== ThreadType.User) {
                    return;
                }

                // RULE 2: Bỏ qua tin nhắn do chính mình gửi đi từ điện thoại
                if (message.isSelf) {
                    return;
                }

                // RULE 3 (CỐT LÕI): Chỉ nhận tin nhắn MỚI từ thời điểm cấu hình tài khoản trở đi
                // Giúp bảo vệ quyền riêng tư và tránh cào lịch sử chat của người thân/bạn bè cũ
                const msgTime = message.data?.msgTime ? Number(message.data.msgTime) : Date.now();
                if (msgTime < configuredAt) {
                    console.log(`[ZaloManager][${accountId}] Bỏ qua tin nhắn cũ trước mốc cấu hình (Thời gian tin: ${msgTime} < Mốc: ${configuredAt})`);
                    return;
                }

                // Lấy nội dung tin nhắn
                let contentText = '';
                if (typeof message.data.content === 'string') {
                    contentText = message.data.content;
                } else if (message.data.content && typeof message.data.content === 'object') {
                    contentText = message.data.content.title || message.data.content.description || '[Tin nhắn tệp/hình ảnh]';
                } else {
                    contentText = '[Tin nhắn Zalo]';
                }

                const senderZaloId = String(message.threadId || message.data.uidFrom || '');
                if (!senderZaloId) return;

                // Lấy tên khách hàng
                let customerName = message.data.dName || 'Khách Zalo';
                let customerAvatar = '';

                try {
                    const userInfo = await api.getUserInfo(senderZaloId);
                    if (userInfo) {
                        customerName = userInfo.displayName || userInfo.name || userInfo.data?.name || customerName;
                        customerAvatar = userInfo.avatar || userInfo.data?.avatar || '';
                    }
                } catch (e) {}

                console.log(`[ZaloManager][${accountId}] Tin nhắn mới từ: ${customerName} (${senderZaloId}): "${contentText}"`);

                // Gửi Webhook sang CRM
                await this.notifyCRM({
                    action: 'inbound_message',
                    channel: 'ZALO',
                    account_id: accountId,
                    account_name: accountName,
                    customer_zalo_id: senderZaloId,
                    customer_name: customerName,
                    customer_avatar: customerAvatar,
                    message_id: String(message.data.msgId || Date.now()),
                    message_text: contentText,
                    timestamp: msgTime
                });

            } catch (err) {
                console.error(`[ZaloManager][${accountId}] Lỗi xử lý tin nhắn đến:`, err);
            }
        });

        // 2. Theo dõi trạng thái đóng listener
        api.listener.on('closed', (reason) => {
            console.warn(`[ZaloManager][${accountId}] Listener bị đóng. Lý do:`, reason);
            const acc = this.activeAccounts.get(accountId);
            if (acc) {
                acc.status = 'DISCONNECTED';
                this.notifyCRM({
                    action: 'account_disconnected',
                    account_id: accountId,
                    reason: String(reason)
                });
            }
        });

        api.listener.on('disconnected', (reason) => {
            console.warn(`[ZaloManager][${accountId}] Listener mất kết nối. Lý do:`, reason);
            const acc = this.activeAccounts.get(accountId);
            if (acc) {
                acc.status = 'DISCONNECTED';
            }
        });

        // Khởi động lắng nghe
        api.listener.start();
        console.log(`[ZaloManager][${accountId}] Đã kích hoạt api.listener.start() thành công!`);
    }

    /**
     * Gửi tin nhắn phản hồi từ nhân viên CRM sang Zalo khách hàng
     */
    async sendMessage(accountId, threadId, content, attachments = null) {
        if (!threadId) {
            throw new Error('Thiếu ID người nhận (threadId)');
        }

        let targetAccount = null;

        // Nếu chỉ định accountId, tìm account đó
        if (accountId && this.activeAccounts.has(String(accountId))) {
            targetAccount = this.activeAccounts.get(String(accountId));
        } else {
            // Mặc định lấy tài khoản đầu tiên đang active
            const accounts = Array.from(this.activeAccounts.values()).filter(a => a.status === 'CONNECTED');
            if (accounts.length > 0) {
                targetAccount = accounts[0];
            }
        }

        if (!targetAccount || !targetAccount.api) {
            throw new Error('Không có tài khoản Zalo nào đang hoạt động trên Gateway.');
        }

        console.log(`[ZaloManager] Đang gửi tin nhắn qua tài khoản [${targetAccount.name}] tới Zalo ID [${threadId}]: "${content}"`);

        let payload = content;
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            payload = {
                msg: content || '',
                attachments: attachments
            };
        }

        const result = await targetAccount.api.sendMessage(payload, String(threadId), ThreadType.User);

        return {
            success: true,
            account_id: targetAccount.id,
            result
        };
    }

    /**
     * Ngắt kết nối một tài khoản Zalo
     */
    disconnectAccount(accountId) {
        const id = String(accountId);
        if (this.activeAccounts.has(id)) {
            const acc = this.activeAccounts.get(id);
            acc.status = 'DISCONNECTED';
            this.activeAccounts.delete(id);
            console.log(`[ZaloManager] Đã ngắt kết nối tài khoản: ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Lấy danh sách các tài khoản đang kết nối
     */
    getAccounts() {
        return Array.from(this.activeAccounts.values()).map(acc => ({
            id: acc.id,
            name: acc.name,
            avatar: acc.avatar,
            status: acc.status,
            configured_at: acc.configuredAt,
            connected_at: acc.connectedAt
        }));
    }

    /**
     * Kiểm tra trạng thái của một phiên quét QR
     */
    getQRSession(sessionId) {
        const session = this.pendingSessions.get(sessionId);
        if (!session) {
            return { success: false, message: 'Phiên quét QR không tồn tại hoặc đã hết hạn.' };
        }

        return {
            success: true,
            session_id: session.sessionId,
            status: session.status,
            qr_code: session.qrCode,
            account_id: session.accountId,
            account_name: session.accountName,
            error: session.error
        };
    }

    /**
     * Bắn webhook sang CRM PHP
     */
    async notifyCRM(payload) {
        // Luôn lưu vào buffer để browser CRM có thể kéo về qua polling (Bypass Anti-Bot)
        this.addPendingEvent(payload);

        if (!this.crmWebhookUrl) return;

        const body = {
            ...payload,
            gateway_key: this.gatewayKey
        };

        try {
            const fetchFn = globalThis.fetch;
            if (!fetchFn) {
                console.warn('[ZaloManager] Global fetch không tồn tại, bỏ qua notifyCRM');
                return;
            }

            const response = await fetchFn(this.crmWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Gateway-Key': this.gatewayKey
                },
                body: JSON.stringify(body)
            });

            const data = await response.text();
            console.log(`[ZaloManager] Webhook CRM response (${response.status}):`, data.substring(0, 200));
        } catch (err) {
            console.error(`[ZaloManager] Lỗi gọi webhook CRM (${this.crmWebhookUrl}):`, err.message);
        }
    }
}

module.exports = new ZaloManager();
