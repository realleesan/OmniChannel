/**
 * OMNICHANNEL DEDICATED ZALO GATEWAY (SERVER.JS)
 * Gateway độc lập dành riêng cho kênh Zalo Cá Nhân qua thư viện zca-js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const zaloManager = require('./zaloManager');

const app = express();
const PORT = process.env.PORT || 10000;
const rawKey = process.env.ZALO_GATEWAY_KEY || 'omnichannel_zalo_secret_2026';
const GATEWAY_KEY = rawKey.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

// Middleware cơ bản
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Middleware kiểm tra bảo mật API Key
function verifyGatewayKey(req, res, next) {
    const providedKey = (req.headers['x-gateway-key'] || req.body?.gateway_key || req.query?.key || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!providedKey || providedKey !== GATEWAY_KEY) {
        return res.status(401).json({
            success: false,
            message: 'Không có quyền truy cập. Sai hoặc thiếu X-Gateway-Key.'
        });
    }
    next();
}

// 1. Health-check endpoint dành cho UptimeRobot (Keep-Alive 24/7)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'OmniChannel Zalo Gateway',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// 2. Trang chủ Gateway
app.get('/', (req, res) => {
    const accounts = zaloManager.getAccounts();
    res.status(200).send(`
        <div style="font-family:sans-serif;text-align:center;padding:50px;">
            <h1 style="color:#0068FF;">🚀 OmniChannel Zalo Gateway is Running</h1>
            <p>Dedicated personal Zalo gateway powered by <strong>zca-js</strong>.</p>
            <p style="color:#10B981;font-weight:bold;">● Status: ONLINE | Port: ${PORT}</p>
            <p>Active Connected Accounts: <strong>${accounts.length}</strong></p>
            <p style="color:#64748B;font-size:12px;">Keep-alive URL: <code>/health</code></p>
        </div>
    `);
});

// 3. API: Khởi tạo phiên quét mã QR mới
app.get('/api/zalo/qr/generate', async (req, res) => {
    try {
        const result = await zaloManager.generateQRSession();
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// 4. API: Polling kiểm tra trạng thái quét mã QR
app.get('/api/zalo/qr/status', (req, res) => {
    const sessionId = req.query.session_id || req.query.sessionId;
    if (!sessionId) {
        return res.status(400).json({
            success: false,
            message: 'Thiếu session_id'
        });
    }

    const sessionData = zaloManager.getQRSession(sessionId);
    res.status(200).json(sessionData);
});

// 5. API: Lấy danh sách tài khoản Zalo đang hoạt động
app.get('/api/zalo/accounts', (req, res) => {
    const accounts = zaloManager.getAccounts();
    res.status(200).json({
        success: true,
        accounts
    });
});

// 6. API: Polling kéo sự kiện & tin nhắn Zalo về CRM (Miễn nhiễm Anti-Bot của hosting)
app.get('/api/zalo/poll', (req, res) => {
    const events = zaloManager.getPendingEvents();
    res.status(200).json({
        success: true,
        events
    });
});

// 6. API: Gửi tin nhắn từ CRM sang Zalo khách hàng
app.post('/api/zalo/send', verifyGatewayKey, async (req, res) => {
    try {
        const { account_id, thread_id, customer_zalo_id, content, attachments } = req.body;
        const targetId = thread_id || customer_zalo_id;

        if (!targetId) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu customer_zalo_id hoặc thread_id của khách hàng'
            });
        }

        const result = await zaloManager.sendMessage(account_id, targetId, content, attachments);
        res.status(200).json(result);
    } catch (err) {
        console.error('[API Send Error]:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Lỗi gửi tin nhắn qua Zalo Gateway'
        });
    }
});

// 7. API: Ngắt kết nối một tài khoản Zalo
app.post('/api/zalo/disconnect', verifyGatewayKey, (req, res) => {
    const { account_id } = req.body;
    if (!account_id) {
        return res.status(400).json({
            success: false,
            message: 'Thiếu account_id'
        });
    }

    const success = zaloManager.disconnectAccount(account_id);
    res.status(200).json({
        success,
        message: success ? `Đã ngắt kết nối tài khoản ${account_id}` : 'Không tìm thấy tài khoản cần ngắt'
    });
});

// Khởi chạy server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Zalo Gateway] Máy chủ Zalo Gateway đang chạy trên cổng ${PORT}`);
    console.log(`[Zalo Gateway] Endpoint kiểm tra sức khỏe (Health Check): http://localhost:${PORT}/health`);
});
