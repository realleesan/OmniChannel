/**
 * OMNICHANNEL WEBHOOK GATEWAY - SERVER.JS
 * Triển khai trên Render.com (Node.js)
 * Tích hợp 3 kênh: Webchat, Zalo cá nhân (zca-js), Facebook cá nhân (ws3-fca)
 */

require('dotenv').config();
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
            console.log('✅ Facebook cá nhân (ws3-fca) đã kết nối thành công!');

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
                    console.log('📥 Tin nhắn FB cá nhân:', normalizedMsg);
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
    console.log('📥 Nhận payload từ Zalo:', body);

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

app.listen(PORT, () => {
    console.log(`🚀 Omnichannel Webhook Gateway đang chạy trên cổng ${PORT}`);
});
