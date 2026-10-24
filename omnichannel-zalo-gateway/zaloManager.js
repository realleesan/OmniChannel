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

/**
 * Trích xuất width, height, size từ file ảnh cục bộ (JPEG, PNG, GIF, WEBP)
 * Sử dụng Buffer nguyên bản của Node.js, không phụ thuộc vào gói sharp
 * Đáp ứng yêu cầu bắt buộc của zca-js v2.0+ khi gửi tin nhắn kèm attachments
 */
async function extractImageMetadata(filePath) {
    try {
        const data = await fs.promises.readFile(filePath);
        const size = data.length;
        let width = 1080;
        let height = 1080;

        // 1. Kiểm tra PNG (Header: 89 50 4E 47 0D 0A 1A 0A)
        if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
            width = data.readUInt32BE(16);
            height = data.readUInt32BE(20);
            return { width, height, size };
        }

        // 2. Kiểm tra GIF (Header: 'GIF87a' hoặc 'GIF89a')
        if (data.length > 10 && data.toString('ascii', 0, 3) === 'GIF') {
            width = data.readUInt16LE(6);
            height = data.readUInt16LE(8);
            return { width, height, size };
        }

        // 3. Kiểm tra WEBP (Header: 'RIFF'....'WEBP')
        if (data.length > 30 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
            const vp8 = data.toString('ascii', 12, 16);
            if (vp8 === 'VP8 ') {
                width = data.readUInt16LE(26) & 0x3fff;
                height = data.readUInt16LE(28) & 0x3fff;
                return { width, height, size };
            } else if (vp8 === 'VP8L') {
                const b0 = data[21], b1 = data[22], b2 = data[23], b3 = data[24];
                width = 1 + (((b1 & 0x3f) << 8) | b0);
                height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
                return { width, height, size };
            } else if (vp8 === 'VP8X') {
                width = 1 + data.readUIntLE(24, 3);
                height = 1 + data.readUIntLE(27, 3);
                return { width, height, size };
            }
        }

        // 4. Kiểm tra JPEG (Header: FF D8 FF)
        if (data.length > 4 && data[0] === 0xFF && data[1] === 0xD8) {
            let offset = 2;
            while (offset < data.length - 8) {
                if (data[offset] !== 0xFF) {
                    offset++;
                    continue;
                }
                const marker = data[offset + 1];
                if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
                    height = data.readUInt16BE(offset + 5);
                    width = data.readUInt16BE(offset + 7);
                    return { width, height, size };
                }
                const len = data.readUInt16BE(offset + 2);
                offset += 2 + len;
            }
        }

        return { width, height, size };
    } catch (e) {
        console.warn('[ZaloManager] Lỗi trích xuất metadata ảnh:', e.message);
        try {
            const stat = fs.statSync(filePath);
            return { width: 1080, height: 1080, size: stat.size };
        } catch (err) {
            return { width: 1080, height: 1080, size: 102400 };
        }
    }
}

/**
 * Trích xuất toàn diện URL hình ảnh từ payload tin nhắn Zalo đến
 */
function extractMediaFromMessage(data) {
    if (!data) return { urls: [], caption: '' };
    const urls = [];
    let caption = '';

    function scan(obj, depth = 0) {
        if (!obj || depth > 6) return;

        if (typeof obj === 'string') {
            const str = obj.trim();
            // Nếu là chuỗi JSON, giải mã để quét tiếp
            if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
                try {
                    const parsed = JSON.parse(str);
                    scan(parsed, depth + 1);
                    return;
                } catch (e) {}
            }
            // Nếu là URL ảnh
            if (str.startsWith('http://') || str.startsWith('https://')) {
                const isImage = /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(str) ||
                                /zadn\.vn|zdn\.vn|zalo/i.test(str) ||
                                /photo|image|thumb|picture/i.test(str);
                if (isImage && !urls.includes(str)) {
                    urls.push(str);
                }
            } else if (!caption && str.length > 0 && str.length < 500 && !str.includes('{') && !str.includes('"')) {
                // Có thể là caption đính kèm ảnh
                if (str !== '[Tin nhắn tệp/hình ảnh]' && str !== '[Hình ảnh]' && str !== '[Tin nhắn Zalo]') {
                    caption = str;
                }
            }
            return;
        }

        if (Array.isArray(obj)) {
            for (const item of obj) {
                scan(item, depth + 1);
            }
            return;
        }

        if (typeof obj === 'object') {
            // Ưu tiên các trường chứa ảnh chất lượng cao của Zalo
            const priorityKeys = ['originalUrl', 'hdUrl', 'href', 'normalUrl', 'url', 'thumb', 'photoUrl'];
            for (const k of priorityKeys) {
                if (obj[k]) {
                    scan(obj[k], depth + 1);
                }
            }
            // Quét caption hoặc title/desc
            if (!caption && (obj.title || obj.description || obj.caption)) {
                const c = obj.caption || obj.title || obj.description;
                if (typeof c === 'string' && c.trim() && !c.includes('{')) {
                    caption = c.trim();
                }
            }
            for (const [k, v] of Object.entries(obj)) {
                if (!priorityKeys.includes(k) && k !== 'title' && k !== 'description' && k !== 'caption') {
                    scan(v, depth + 1);
                }
            }
        }
    }

    scan(data);
    return { urls, caption };
}

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
                logging: true,       // Bật log để tiện theo dõi
                imageMetadataGetter: extractImageMetadata // Bắt buộc cho zca-js v2.0+ khi gửi ảnh
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

                // Trích xuất toàn diện ảnh đính kèm và caption từ payload Zalo
                const mediaRes = extractMediaFromMessage(message.data);
                const attachmentUrl = mediaRes.urls.length > 0 ? mediaRes.urls.join(',') : '';

                let contentText = '';
                if (typeof message.data?.content === 'string' && !attachmentUrl && !message.data.content.trim().startsWith('{')) {
                    contentText = message.data.content.trim();
                } else if (mediaRes.caption) {
                    contentText = mediaRes.caption;
                } else if (attachmentUrl) {
                    contentText = '[Hình ảnh]';
                } else {
                    contentText = '[Tin nhắn Zalo]';
                }

                const senderZaloId = String(message.threadId || message.data?.uidFrom || '');
                if (!senderZaloId) return;

                // Lấy tên gốc (zaloName) và avatar khách hàng chuẩn xác từ API getUserInfo của zca-js
                // Ưu tiên tên gốc do chính khách tự đặt trên Zalo, không lấy biệt danh lưu trong danh bạ
                let customerName = message.data?.zName || message.data?.dName || 'Khách Zalo';
                let customerAvatar = message.data?.avatar || message.data?.avt || message.data?.uAvatar || '';

                try {
                    const userInfo = await api.getUserInfo(senderZaloId);
                    if (userInfo) {
                        const profile = userInfo.changed_profiles?.[senderZaloId] || userInfo[senderZaloId] || userInfo;
                        // ƯU TIÊN 1: zaloName (tên gốc chính chủ Zalo)
                        // Fallback: name, data.zaloName, rồi mới tới displayName (biệt danh) nếu không có tên gốc
                        customerName = profile.zaloName || profile.data?.zaloName || message.data?.zName || profile.name || profile.displayName || message.data?.dName || customerName;
                        if (profile.avatar) {
                            customerAvatar = profile.avatar;
                        } else if (profile.data?.avatar) {
                            customerAvatar = profile.data.avatar;
                        }
                    }
                } catch (e) {
                    console.warn(`[ZaloManager] Lỗi getUserInfo cho ${senderZaloId}:`, e.message);
                }

                console.log(`[ZaloManager][${accountId}] Tin nhắn mới từ: ${customerName} (${senderZaloId}) [Avatar: ${customerAvatar ? 'Có' : 'Không'} | Ảnh: ${attachmentUrl ? 'Có' : 'Không'}]: "${contentText}"`);

                // Gửi Webhook sang CRM
                await this.notifyCRM({
                    action: 'inbound_message',
                    channel: 'ZALO',
                    account_id: accountId,
                    account_name: accountName,
                    customer_zalo_id: senderZaloId,
                    customer_name: customerName,
                    customer_avatar: customerAvatar,
                    attachment_url: attachmentUrl,
                    message_id: String(message.data?.msgId || Date.now()),
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
     * Chuẩn bị file đính kèm cục bộ từ URL hoặc Base64 để truyền vào zca-js api.sendMessage
     */
    async prepareLocalAttachments(attachments) {
        if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
            return [];
        }

        const tempDir = path.join(__dirname, 'temp_media');
        if (!fs.existsSync(tempDir)) {
            try { fs.mkdirSync(tempDir, { recursive: true }); } catch (e) {}
        }

        const preparedFiles = [];

        for (const item of attachments) {
            try {
                // 1. Nếu là dạng Base64 { filename, base64 }
                if (item && typeof item === 'object' && item.base64) {
                    const ext = path.extname(item.filename || '') || '.jpg';
                    const tempFile = path.join(tempDir, `send_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
                    const buffer = Buffer.from(item.base64, 'base64');
                    fs.writeFileSync(tempFile, buffer);
                    preparedFiles.push(tempFile);
                    continue;
                }

                // 2. Nếu là chuỗi URL hoặc object có trường url
                const targetUrl = typeof item === 'string' ? item : (item && item.url ? item.url : '');
                if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
                    console.log(`[ZaloManager] Đang tải file ảnh đính kèm từ URL: ${targetUrl}`);
                    const res = await fetch(targetUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });
                    if (res.ok) {
                        const arrayBuffer = await res.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        let ext = path.extname(new URL(targetUrl).pathname) || '.jpg';
                        if (!ext || ext.length > 5) ext = '.jpg';
                        const tempFile = path.join(tempDir, `send_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
                        fs.writeFileSync(tempFile, buffer);
                        preparedFiles.push(tempFile);
                        continue;
                    } else {
                        console.warn(`[ZaloManager] Không thể tải ảnh từ URL (HTTP ${res.status}): ${targetUrl}`);
                    }
                }

                // 3. Nếu là file local có sẵn
                if (typeof item === 'string' && fs.existsSync(item)) {
                    preparedFiles.push(item);
                }
            } catch (err) {
                console.error('[ZaloManager] Lỗi xử lý file đính kèm:', err.message);
            }
        }

        return preparedFiles;
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

        console.log(`[ZaloManager] Đang gửi tin nhắn qua tài khoản [${targetAccount.name}] tới Zalo ID [${threadId}]: "${content || ''}" (Attachments: ${attachments ? attachments.length : 0})`);

        const tempFiles = await this.prepareLocalAttachments(attachments);

        try {
            let payload = content;
            if (tempFiles.length > 0) {
                payload = {
                    msg: content || '',
                    attachments: tempFiles
                };
            }

            const result = await targetAccount.api.sendMessage(payload, String(threadId), ThreadType.User);

            return {
                success: true,
                account_id: targetAccount.id,
                result
            };
        } finally {
            // Dọn dẹp các file ảnh tạm sau khi gửi xong
            for (const f of tempFiles) {
                if (f.includes('temp_media') && fs.existsSync(f)) {
                    try { fs.unlinkSync(f); } catch (e) {}
                }
            }
        }
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
