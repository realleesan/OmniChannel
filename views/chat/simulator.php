<?php
/**
 * VIEW: chat/simulator.php
 * Bảng điều khiển Giả lập Kênh Đa nguồn (Channel Simulator / Webhook Mock Dashboard)
 * Phục vụ buổi thuyết trình an toàn 100%, giả lập bắn tin Facebook, Zalo, Shopee với JSON chuẩn
 */

require_once __DIR__ . '/../../config/constants.php';
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Channel Simulator - Giả Lập Kênh Đa Nguồn</title>
    <link rel="stylesheet" href="../../public/css/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            background: #0F172A;
            color: #F8FAFC;
            overflow-y: auto;
            padding: 24px;
            height: auto;
            min-height: 100vh;
        }
        .sim-container {
            max-width: 900px;
            margin: 0 auto;
        }
        .sim-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid #334155;
        }
        .sim-title {
            font-size: 22px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .sim-preset-card {
            background: #1E293B;
            border: 1px solid #334155;
            border-radius: var(--radius-lg);
            padding: 20px;
            margin-bottom: 24px;
        }
        .sim-preset-title {
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #94A3B8;
            margin-bottom: 14px;
        }
        .preset-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 14px;
        }
        .preset-btn {
            background: #0F172A;
            border: 1px solid #334155;
            border-radius: var(--radius-md);
            padding: 14px;
            text-align: left;
            cursor: pointer;
            transition: all 0.2s;
            color: #F8FAFC;
        }
        .preset-btn:hover {
            border-color: #6366F1;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }
        .preset-channel {
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 10px;
            display: inline-block;
            margin-bottom: 6px;
        }
        .preset-fb { background: #1E40AF; color: #DBEAFE; }
        .preset-zl { background: #0369A1; color: #E0F2FE; }
        .preset-sp { background: #C2410C; color: #FFEDD5; }
        
        .preset-name {
            font-size: 13.5px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .preset-msg {
            font-size: 12px;
            color: #94A3B8;
            line-height: 1.4;
        }

        .sim-custom-form {
            background: #1E293B;
            border: 1px solid #334155;
            border-radius: var(--radius-lg);
            padding: 24px;
        }
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        }
        .sim-input, .sim-select, .sim-textarea {
            width: 100%;
            background: #0F172A;
            border: 1px solid #334155;
            color: #F8FAFC;
            padding: 10px 14px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            outline: none;
        }
        .sim-input:focus, .sim-select:focus, .sim-textarea:focus {
            border-color: #6366F1;
        }
        .btn-fire-webhook {
            width: 100%;
            padding: 13px;
            background: linear-gradient(135deg, #4F46E5, #6366F1);
            color: white;
            border: none;
            border-radius: var(--radius-sm);
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 10px;
        }
        .btn-fire-webhook:hover {
            box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
            transform: translateY(-1px);
        }
        .log-box {
            background: #0F172A;
            border: 1px solid #334155;
            border-radius: var(--radius-md);
            padding: 14px;
            font-family: monospace;
            font-size: 12px;
            color: #38BDF8;
            margin-top: 20px;
            max-height: 160px;
            overflow-y: auto;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>

<div class="sim-container">
    <div class="sim-header">
        <div class="sim-title">
            <span style="font-size:28px;">📡</span>
            <div>
                <div>Màn Hình Giả Lập Kênh & Webhook (Channel Simulator)</div>
                <div style="font-size:12px;color:#94a3b8;font-weight:400;">Mô phỏng tin nhắn từ Facebook Messenger, Zalo OA, Shopee bắn vào API hệ thống</div>
            </div>
        </div>
        <a href="workspace.php" class="header-link-btn" style="background:#4F46E5;border:none;">
            <i class="fa-solid fa-arrow-left"></i> Quay lại Workspace
        </a>
    </div>

    <!-- KỊCH BẢN THUYẾT TRÌNH CÓ SẴN (1-CLICK DEMO) -->
    <div class="sim-preset-card">
        <div class="sim-preset-title">⚡ Kịch bản Demo Nhanh (1-Click Khách Gửi Tin):</div>
        <div class="preset-grid">
            <!-- Preset 1: Khách Facebook Thu Hà -->
            <button type="button" class="preset-btn" onclick="firePreset('FACEBOOK', 'fb_thuha_01', 'Nguyễn Thị Thu Hà', 'Shop ơi mẫu Váy Dạ Tweed SP01 còn size M không?')">
                <span class="preset-channel preset-fb">📘 FACEBOOK</span>
                <div class="preset-name">Nguyễn Thị Thu Hà</div>
                <div class="preset-msg">"Shop ơi mẫu Váy Dạ Tweed SP01 còn size M không?"</div>
            </button>

            <!-- Preset 2: Khách Zalo Hoàng Nam -->
            <button type="button" class="preset-btn" onclick="firePreset('ZALO', 'zl_hoangnam_99', 'Hoàng Nam', 'Chào shop, mình muốn hỏi đơn này có ship hỏa tốc sang Long Biên chiều nay được không?')">
                <span class="preset-channel preset-zl">🔵 ZALO CHAT</span>
                <div class="preset-name">Hoàng Nam</div>
                <div class="preset-msg">"Ship hỏa tốc sang Long Biên trong chiều nay được không?"</div>
            </button>

            <!-- Preset 3: Khách Shopee Phương Linh -->
            <button type="button" class="preset-btn" onclick="firePreset('SHOPEE', 'sp_phuonglinh', 'Phương Linh', 'Dạ shop ơi mẫu áo blazer có kèm đai thắt lưng không ạ?')">
                <span class="preset-channel preset-sp">🟠 SHOPEE</span>
                <div class="preset-name">Phương Linh</div>
                <div class="preset-msg">"Mẫu áo blazer có kèm đai thắt lưng không ạ?"</div>
            </button>
        </div>
    </div>

    <!-- TÙY BIẾN GỬI TIN NHẮN BẤT KỲ -->
    <div class="sim-custom-form">
        <div class="sim-preset-title">🛠️ Tùy biến dữ liệu gửi (Custom Webhook Payload):</div>

        <div class="form-row">
            <div class="form-group">
                <label style="font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:6px;display:block;">Kênh bán hàng:</label>
                <select id="simChannel" class="sim-select">
                    <option value="FACEBOOK">Facebook Messenger</option>
                    <option value="ZALO">Zalo OA / Chat</option>
                    <option value="SHOPEE">Shopee Chat</option>
                    <option value="TIKTOK">TikTok Shop</option>
                    <option value="WEBCHAT">Webchat Khách</option>
                </select>
            </div>

            <div class="form-group">
                <label style="font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:6px;display:block;">Tên khách hàng:</label>
                <input type="text" id="simSenderName" class="sim-input" value="Lê Bảo Châu" placeholder="Nhập tên khách">
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label style="font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:6px;display:block;">Mã định danh khách (Sender ID):</label>
                <input type="text" id="simSenderId" class="sim-input" value="cust_sim_001" placeholder="Ví dụ: fb_102030">
            </div>

            <div class="form-group">
                <label style="font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:6px;display:block;">Ảnh đính kèm (URL - tùy chọn):</label>
                <input type="text" id="simAttachmentUrl" class="sim-input" placeholder="https://example.com/image.jpg">
            </div>
        </div>

        <div class="form-group" style="margin-bottom:14px;">
            <label style="font-size:12px;color:#94a3b8;font-weight:600;margin-bottom:6px;display:block;">Nội dung tin nhắn:</label>
            <textarea id="simContent" class="sim-textarea" rows="3" placeholder="Nhập câu hỏi của khách hàng..."></textarea>
        </div>

        <button type="button" class="btn-fire-webhook" onclick="submitCustomSimulation()">
            <i class="fa-solid fa-paper-plane"></i> BẮN TIN NHẮN GIẢ LẬP VÀO HỆ THỐNG
        </button>

        <div class="log-box" id="simLogBox">// Trạng thái phản hồi từ API sẽ hiển thị ở đây...</div>
    </div>
</div>

<script>
async function firePreset(channel, senderId, senderName, content) {
    document.getElementById('simChannel').value = channel;
    document.getElementById('simSenderId').value = senderId;
    document.getElementById('simSenderName').value = senderName;
    document.getElementById('simContent').value = content;
    await submitCustomSimulation();
}

async function submitCustomSimulation() {
    const channel = document.getElementById('simChannel').value;
    const externalSenderId = document.getElementById('simSenderId').value.trim();
    const senderName = document.getElementById('simSenderName').value.trim();
    const content = document.getElementById('simContent').value.trim();
    const attachmentUrl = document.getElementById('simAttachmentUrl').value.trim();
    const logBox = document.getElementById('simLogBox');

    if (!content) {
        alert('Vui lòng nhập nội dung tin nhắn');
        return;
    }

    logBox.innerText = `[${new Date().toLocaleTimeString()}] Đang gửi POST tới /api/simulator_endpoint.php...\n` +
        JSON.stringify({ channel, external_sender_id: externalSenderId, sender_name: senderName, content }, null, 2);

    try {
        const formData = new FormData();
        formData.append('channel', channel);
        formData.append('external_sender_id', externalSenderId);
        formData.append('sender_name', senderName);
        formData.append('content', content);
        if (attachmentUrl) {
            formData.append('attachment_url', attachmentUrl);
        }

        const res = await fetch('../../api/simulator_endpoint.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        logBox.innerText += `\n\n[PHẢN HỒI THÀNH CÔNG]:\n` + JSON.stringify(data, null, 2);
    } catch (err) {
        logBox.innerText += `\n\n[LỖI]: ` + err.toString();
    }
}
</script>

</body>
</html>
