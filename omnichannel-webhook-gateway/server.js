/**
 * OMNICHANNEL WEBHOOK GATEWAY - SERVER.JS
 * Chạy trên Render.com (Node.js) để tiếp nhận Webhook từ Facebook, Zalo mà không bị rào cản firewall
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'omnichannel_fb_token_ba2026';
const GATEWAY_KEY = process.env.GATEWAY_KEY || 'omnichannel_secret_ba_2026';

// Bật CORS cho phép trình duyệt truy cập
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Hàng đợi lưu trữ tin nhắn tạm thời (In-memory Queue Buffer)
let pendingMessages = [];

// 1. Health check & Trang chủ Gateway
app.get('/', (req, res) => {
    res.json({
        status: 'ONLINE',
        service: 'Omnichannel Webhook Gateway',
        platform: 'Render.com',
        timestamp: new Date().toISOString(),
        pending_messages_count: pendingMessages.length
    });
});

// 2. FACEBOOK META WEBHOOK: Xác thực Webhook (GET)
// Meta sẽ gọi endpoint này khi bạn bấm "Verify and Save" trên Meta for Developers
app.get('/webhook/facebook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Facebook Webhook đã xác thực thành công!');
        return res.status(200).send(challenge);
    }
    console.warn('❌ Xác thực Facebook Webhook thất bại: Token không khớp');
    return res.sendStatus(403);
});

// 3. FACEBOOK META WEBHOOK: Tiếp nhận tin nhắn mới từ khách (POST)
app.post('/webhook/facebook', (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging ? entry.messaging[0] : null;
            if (webhookEvent && webhookEvent.message) {
                const senderPsid = webhookEvent.sender.id;
                const messageText = webhookEvent.message.text || '';
                let attachmentUrl = null;

                if (webhookEvent.message.attachments && webhookEvent.message.attachments.length > 0) {
                    attachmentUrl = webhookEvent.message.attachments[0].payload.url;
                }

                const normalizedMsg = {
                    channel: 'FACEBOOK',
                    external_sender_id: 'fb_' + senderPsid,
                    sender_name: 'Khách Facebook (' + senderPsid.substring(0, 5) + ')',
                    content: messageText || '[Tệp tin đính kèm]',
                    attachment_url: attachmentUrl,
                    received_at: new Date().toISOString()
                };

                console.log('📥 Nhận tin nhắn mới từ Facebook:', normalizedMsg);
                pendingMessages.push(normalizedMsg);
            }
        });

        // Phải trả về 200 OK ngay trong vòng 20 giây để Facebook không gửi lại
        return res.status(200).send('EVENT_RECEIVED');
    }

    return res.sendStatus(404);
});

// 4. ZALO WEBHOOK: Tiếp nhận tin nhắn từ Zalo OA hoặc Script ZCA
app.post('/webhook/zalo', (req, res) => {
    const body = req.body;
    console.log('📥 Nhận payload từ Zalo:', body);

    const senderId = body.sender?.id || body.user_id || 'zl_' + Date.now();
    const senderName = body.sender?.name || body.name || 'Khách Zalo';
    const messageText = body.message?.text || body.content || '';

    const normalizedMsg = {
        channel: 'ZALO',
        external_sender_id: 'zl_' + senderId,
        sender_name: senderName,
        content: messageText,
        attachment_url: body.attachment_url || null,
        received_at: new Date().toISOString()
    };

    pendingMessages.push(normalizedMsg);
    return res.status(200).json({ success: true, message: 'Zalo message queued' });
});

// 5. API RÚT TIN NHẮN (Dành cho InfinityFree hoặc Trình duyệt CRM kéo về)
app.get('/api/messages/poll', (req, res) => {
    const messagesToReturn = [...pendingMessages];
    // Xóa các tin đã lấy để tránh trùng lặp
    pendingMessages = [];

    res.json({
        success: true,
        count: messagesToReturn.length,
        messages: messagesToReturn
    });
});

// Khởi chạy server
app.listen(PORT, () => {
    console.log(`🚀 Omnichannel Webhook Gateway đang chạy trên cổng ${PORT}`);
    console.log(`🔗 Verify Token cấu hình: ${VERIFY_TOKEN}`);
});
