/**
 * OMNICHANNEL WEBHOOK GATEWAY - SERVER.JS
 * Triển khai trên Render.com (Node.js)
 * Tích hợp 3 kênh: Webchat, Zalo cá nhân (zca-js), Facebook cá nhân (ws3-fca)
 */

try { require('dotenv').config(); } catch (e) {}
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'omnichannel_fb_token_ba2026';
const GATEWAY_KEY = process.env.GATEWAY_KEY || 'omnichannel_secret_ba_2026';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Hàng đợi lưu trữ tin nhắn tạm thời (In-memory Buffer)
let pendingMessages = [];

// Trạng thái các kênh cá nhân
const ChannelStatus = {
    zalo: { status: 'READY_TO_LOGIN', user: null, qr: null },
    facebook: { status: 'READY_FOR_APPSTATE', user: null }
};

// ========================================================
// 1. HEALTH CHECK & DASHBOARD
// ========================================================
app.get('/', (req, res) => {
    res.json({
        status: 'ONLINE',
        service: 'Omnichannel Webhook Gateway',
        channels: {
            webchat: 'CONNECTED',
            zalo_personal: ChannelStatus.zalo.status,
            facebook_personal: ChannelStatus.facebook.status
        },
        pending_messages: pendingMessages.length,
        timestamp: new Date().toISOString()
    });
});

// ========================================================
// 2. FACEBOOK PERSONAL UNOFFICIAL (ws3-fca / AppState)
// ========================================================
let fcaApi = null;

// Nạp AppState (Cookie Facebook cá nhân)
app.post('/api/facebook/appstate', (req, res) => {
    const { appstate } = req.body;
    if (!appstate) {
        return res.status(400).json({ success: false, message: 'Thiếu dữ liệu appstate JSON' });
    }

    try {
        let parsedState = (typeof appstate === 'string') ? JSON.parse(appstate) : appstate;

        // Thử nạp ws3-fca động nếu đã cài đặt
        let login = null;
        try {
            login = require('ws3-fca');
        } catch (e) {
            try {
                login = require('fca-unofficial');
            } catch (err) {}
        }

        if (!login) {
            ChannelStatus.facebook.status = 'APPSTATE_SAVED_PENDING_MODULE';
            return res.json({
                success: true,
                message: 'Đã lưu AppState thành công (Thư viện ws3-fca đang được chuẩn bị trong môi trường chạy)',
                status: ChannelStatus.facebook.status
            });
        }

        login({ appState: parsedState }, (err, api) => {
            if (err) {
                console.error('Lỗi đăng nhập Facebook cá nhân qua AppState:', err);
                ChannelStatus.facebook.status = 'ERROR_LOGIN';
                return res.status(500).json({ success: false, message: 'Lỗi đăng nhập: ' + err.message });
            }

            fcaApi = api;
            ChannelStatus.facebook.status = 'ONLINE';
            console.log('[Facebook] Facebook cá nhân (ws3-fca) đã kết nối thành công!');

            // Lắng nghe tin nhắn qua MQTT
            api.listenMqtt((err, message) => {
                if (err) return console.error('Lỗi lắng nghe FB:', err);
                if (message.type === 'message' || message.type === 'message_reply') {
                    const normalizedMsg = {
                        channel: 'FACEBOOK',
                        external_sender_id: 'fb_' + message.senderID,
                        sender_name: 'Facebook User (' + message.senderID.substring(0, 5) + ')',
                        content: message.body || '[Tệp tin đính kèm]',
                        attachment_url: message.attachments?.[0]?.url || null,
                        received_at: new Date().toISOString()
                    };
                    console.log('[Facebook] Tin nhắn FB cá nhân:', normalizedMsg);
                    pendingMessages.push(normalizedMsg);
                }
            });

            return res.json({ success: true, message: 'Facebook cá nhân đã kết nối trực tuyến!' });
        });

    } catch (e) {
        return res.status(400).json({ success: false, message: 'Định dạng AppState không hợp lệ: ' + e.message });
    }
});

// Gửi tin nhắn Facebook cá nhân
app.post('/api/facebook/send', (req, res) => {
    const { recipient_id, content } = req.body;
    const targetThreadId = recipient_id.replace(/^fb_/, '');

    if (fcaApi) {
        fcaApi.sendMessage(content, targetThreadId, (err, info) => {
            if (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
            return res.json({ success: true, data: info });
        });
    } else {
        console.log(`[FB Mock Send] Gửi tới ${targetThreadId}: ${content}`);
        return res.json({ success: true, simulated: true, message: 'Đã chuyển tin nhắn vào hàng đợi FB' });
    }
});

// ========================================================
// 3. ZALO PERSONAL UNOFFICIAL (zca-js)
// ========================================================
let zcaApi = null;

// Lấy mã QR đăng nhập Zalo
app.get('/api/zalo/qr', (req, res) => {
    try {
        let zca = null;
        try {
            zca = require('zca-js');
        } catch (e) {}

        if (!zca) {
            return res.json({
                success: true,
                status: ChannelStatus.zalo.status,
                message: 'ZCA-JS module sẵn sàng cấu hình qua cookie hoặc QR terminal'
            });
        }

        return res.json({ success: true, qr: ChannelStatus.zalo.qr });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Tiếp nhận tin nhắn Zalo Webhook / ZCA Event
app.post('/webhook/zalo', (req, res) => {
    const body = req.body;
    console.log('[Zalo] Nhận payload từ Zalo:', body);

    const senderId = body.sender?.id || body.user_id || ('zl_' + Date.now());
    const senderName = body.sender?.name || body.name || 'Khách Zalo';
    const messageText = body.message?.text || body.content || '';

    const normalizedMsg = {
        channel: 'ZALO',
        external_sender_id: 'zl_' + senderId,
        sender_name: senderName,
        content: messageText || '[Hình ảnh]',
        attachment_url: body.attachment_url || null,
        received_at: new Date().toISOString()
    };

    pendingMessages.push(normalizedMsg);
    return res.status(200).json({ success: true, message: 'Zalo message queued' });
});

// ========================================================
// 4. UNIFIED POLLING VÀ GỬI TIN NHẮN TẬP TRUNG
// ========================================================

// Endpoint để OmniChannel CRM kéo tin nhắn từ Render về
app.get('/api/messages/poll', (req, res) => {
    const messagesToReturn = [...pendingMessages];
    pendingMessages = []; // Xóa tin đã đọc

    res.json({
        success: true,
        count: messagesToReturn.length,
        messages: messagesToReturn
    });
});

// Endpoint để nhân viên từ CRM gửi tin ra ngoài (Facebook / Zalo)
app.post('/api/messages/send', (req, res) => {
    const { channel, recipient_id, content } = req.body;

    if (channel === 'FACEBOOK') {
        if (fcaApi) {
            const threadId = recipient_id.replace(/^fb_/, '');
            fcaApi.sendMessage(content, threadId, (err) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                return res.json({ success: true });
            });
            return;
        }
    }

    console.log(`[Unified Send] ${channel} -> ${recipient_id}: ${content}`);
    res.json({ success: true, message: 'Tin nhắn đã tiếp nhận để chuyển phát' });
});

// ========================================================
// 5. WEBCHAT WIDGET HOSTING & API ENDPOINTS
// ========================================================
const webchatSessions = {};

// Phục vụ file webchat.js tĩnh từ nguồn duy nhất với Header CORS và No-Cache đầy đủ
app.get(['/public/widget/webchat.js', '/widget/webchat.js', '/webchat.js'], (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Phục vụ trực tiếp từ tệp gốc duy nhất của dự án: public/widget/webchat.js
    const rootPath = path.resolve(__dirname, '../public/widget/webchat.js');
    if (fs.existsSync(rootPath)) {
        return res.sendFile(rootPath);
    }
    res.status(404).send('// webchat.js not found');
});

const widgetStaticPath = path.join(__dirname, '../public/widget');
if (fs.existsSync(widgetStaticPath)) {
    app.use('/public/widget', express.static(widgetStaticPath));
    app.use('/widget', express.static(widgetStaticPath));
}

// Khởi tạo phiên Webchat
app.all('/api/webchat/init', (req, res) => {
    const customerId = req.body?.customer_id || req.query?.customer_id || ('web_' + Math.random().toString(36).substring(2, 10));
    const customerName = req.body?.customer_name || req.query?.customer_name || ('Khách Web ' + customerId.substring(customerId.length - 4));
    const customerPhone = req.body?.customer_phone || req.query?.customer_phone || '';

    if (!webchatSessions[customerId]) {
        webchatSessions[customerId] = {
            customerId,
            customerName,
            customerPhone,
            messages: []
        };
    } else {
        if (req.body?.customer_name || req.query?.customer_name) {
            webchatSessions[customerId].customerName = customerName;
        }
        if (customerPhone) {
            webchatSessions[customerId].customerPhone = customerPhone;
        }
    }

    // Nếu khách đã điền tên thật (không phải Khách Web xxx), đồng bộ ngay sang CRM
    if (customerName && !customerName.startsWith('Khách Web ')) {
        pendingMessages.push({
            channel: 'WEBCHAT',
            external_sender_id: customerId,
            sender_name: customerName,
            customer_phone: customerPhone,
            content: '',
            attachment_url: null,
            received_at: new Date().toISOString()
        });
    }

    // Lấy thông tin nhân viên từ tin nhắn trả lời gần nhất nếu có
    const staffMsg = (webchatSessions[customerId]?.messages || []).slice().reverse().find(m => m.sender_type === 'STAFF');

    res.json({
        success: true,
        customer_id: customerId,
        customer_name: webchatSessions[customerId].customerName,
        customer_phone: webchatSessions[customerId].customerPhone || '',
        conversation_id: customerId,
        staff_name: staffMsg ? staffMsg.staff_name : null,
        staff_avatar: staffMsg ? staffMsg.staff_avatar : null,
        messages: webchatSessions[customerId].messages
    });
});

// Thư mục lưu ảnh upload từ Webchat Widget
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Proxy ảnh an toàn qua Render Node.js (dùng module https có sẵn của Node.js, không cần thư viện ngoài, hỗ trợ follow redirect)
const https = require('https');
const http = require('http');

function fetchRemoteImageStream(targetUrl, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Quá nhiều redirect'));
        const client = targetUrl.startsWith('https') ? https : http;
        
        client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            // Xử lý chuyển hướng 301, 302, 307
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchRemoteImageStream(res.headers.location, maxRedirects - 1));
            }
            if (res.statusCode !== 200) {
                return reject(new Error('Upstream error: ' + res.statusCode));
            }
            resolve(res);
        }).on('error', reject);
    });
}

app.get('/api/proxy-image', async (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).send('Missing url');

    try {
        const targetUrl = decodeURIComponent(rawUrl);
        const remoteStream = await fetchRemoteImageStream(targetUrl);

        const contentType = remoteStream.headers['content-type'] || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        remoteStream.pipe(res);
    } catch (err) {
        console.error('Lỗi proxy ảnh:', err.message);
        res.status(500).send('Proxy error: ' + err.message);
    }
});

// Endpoint upload ảnh trực tiếp từ Webchat Widget (dạng Base64)
app.post('/api/webchat/upload', (req, res) => {
    try {
        const { data } = req.body || {};
        if (!data) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu ảnh' });
        }
        const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ success: false, message: 'Định dạng Base64 không hợp lệ' });
        }
        const mime = matches[1];
        let ext = mime.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const safeName = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.' + ext;
        const filePath = path.join(uploadsDir, safeName);
        fs.writeFileSync(filePath, buffer);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const fileUrl = `${protocol}://${host}/uploads/${safeName}`;

        res.json({ success: true, url: fileUrl });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Lỗi lưu ảnh: ' + e.message });
    }
});

// Khách gửi tin nhắn từ Webchat Widget (Hỗ trợ cả text và ảnh)
app.post('/api/webchat/send', (req, res) => {
    const customerId = req.body?.customer_id || ('web_' + Math.random().toString(36).substring(2, 10));
    const customerName = req.body?.customer_name || webchatSessions[customerId]?.customerName || ('Khách Web ' + customerId.substring(customerId.length - 4));
    const customerPhone = req.body?.customer_phone || webchatSessions[customerId]?.customerPhone || '';
    const content = req.body?.content || '';
    const attachmentUrl = req.body?.attachment_url || null;

    if (!content.trim() && !attachmentUrl) {
        return res.status(400).json({ success: false, message: 'Nội dung trống' });
    }

    if (!webchatSessions[customerId]) {
        webchatSessions[customerId] = { customerId, customerName, customerPhone, messages: [] };
    } else {
        webchatSessions[customerId].customerName = customerName;
        if (customerPhone) webchatSessions[customerId].customerPhone = customerPhone;
    }

    const msgId = Date.now();
    const newMsg = {
        id: msgId,
        sender_type: 'CUSTOMER',
        content,
        attachment_url: attachmentUrl,
        created_at: new Date().toISOString(),
        time_formatted: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
    };
    webchatSessions[customerId].messages.push(newMsg);

    // Đẩy vào hàng đợi pendingMessages để OmniChannel CRM kéo về
    pendingMessages.push({
        channel: 'WEBCHAT',
        external_sender_id: customerId,
        sender_name: customerName,
        customer_phone: customerPhone,
        content: content,
        attachment_url: attachmentUrl,
        received_at: new Date().toISOString()
    });

    res.json({
        success: true,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        conversation_id: customerId,
        message_id: msgId,
        content: content,
        attachment_url: attachmentUrl,
        sender_type: 'CUSTOMER',
        time: newMsg.time_formatted
    });
});

// Nhân viên phản hồi lại khách từ CRM (kèm attachment_url và staff_avatar)
app.post('/api/webchat/reply', (req, res) => {
    const { customer_id, content, staff_name, staff_avatar, attachment_url } = req.body || {};
    if (!customer_id || (!content && !attachment_url)) {
        return res.status(400).json({ success: false, message: 'Thiếu dữ liệu' });
    }

    if (!webchatSessions[customer_id]) {
        webchatSessions[customer_id] = { customerId: customer_id, customerName: 'Khách Web', messages: [] };
    }

    // Chống trùng lặp tin nhắn nếu cả PHP backend và Browser frontend cùng đẩy trong 6 giây
    const isDuplicate = webchatSessions[customer_id].messages.some(m => 
        m.sender_type === 'STAFF' && 
        m.content === content && 
        m.attachment_url === (attachment_url || null) &&
        (Date.now() - (m.id || 0)) < 6000
    );
    if (isDuplicate) {
        return res.json({ success: true, message: 'Đã tiếp nhận (bỏ qua trùng lặp)' });
    }

    const msgId = Date.now();
    const replyMsg = {
        id: msgId,
        sender_type: 'STAFF',
        staff_name: staff_name || 'Nhân viên tư vấn',
        staff_avatar: staff_avatar || '',
        content: content || '',
        attachment_url: attachment_url || null,
        created_at: new Date().toISOString(),
        time_formatted: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
    };
    webchatSessions[customer_id].messages.push(replyMsg);

    res.json({ success: true, message: 'Đã gửi phản hồi tới widget', message_id: msgId });
});

// Widget polling lấy tin nhắn mới từ nhân viên
app.get('/api/webchat/poll', (req, res) => {
    const customerId = req.query?.customer_id;
    const lastMsgId = parseInt(req.query?.last_msg_id || '0', 10);

    if (!customerId || !webchatSessions[customerId]) {
        return res.json({ success: true, messages: [] });
    }

    const newMsgs = webchatSessions[customerId].messages.filter(m => m.id > lastMsgId);
    res.json({
        success: true,
        messages: newMsgs
    });
});

// Khách hàng bấm xem/mở box chat để đánh dấu đã đọc
app.post('/api/webchat/read', (req, res) => {
    const customerId = req.body?.customer_id;
    if (customerId && webchatSessions[customerId]) {
        webchatSessions[customerId].customerLastSeenAt = new Date().toISOString();
        pendingMessages.push({
            channel: 'WEBCHAT',
            event: 'READ_RECEIPT',
            external_sender_id: customerId,
            read_at: new Date().toISOString()
        });
    }
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`[Gateway] OmniChat Webhook Gateway đang chạy trên cổng ${PORT}`);
});

