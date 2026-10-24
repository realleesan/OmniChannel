/**
 * OMNICHANNEL DEDICATED ZALO GATEWAY (SERVER.JS)
 * Gateway độc lập dành riêng cho kênh Zalo Cá Nhân qua thư viện zca-js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;
const GATEWAY_KEY = process.env.ZALO_GATEWAY_KEY || 'omnichannel_zalo_secret_2026';

// Middleware cơ bản
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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
    res.status(200).send(`
        <div style="font-family:sans-serif;text-align:center;padding:50px;">
            <h1 style="color:#0068FF;">🚀 OmniChannel Zalo Gateway is Running</h1>
            <p>Dedicated personal Zalo gateway powered by <strong>zca-js</strong>.</p>
            <p style="color:#10B981;font-weight:bold;">● Status: ONLINE | Port: ${PORT}</p>
            <p style="color:#64748B;font-size:12px;">Keep-alive URL: <code>/health</code></p>
        </div>
    `);
});

// Khởi chạy server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Zalo Gateway] Máy chủ Zalo Gateway đang chạy trên cổng ${PORT}`);
    console.log(`[Zalo Gateway] Endpoint kiểm tra sức khỏe (Health Check): http://localhost:${PORT}/health`);
});
