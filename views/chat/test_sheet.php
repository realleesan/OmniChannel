<?php
/**
 * TRANG TEST & CHẨN ĐOÁN LỖI 403 KẾT NỐI GOOGLE SHEET
 * Đường dẫn: https://omnichannel.gt.tc/views/chat/test_sheet.php
 */
require_once __DIR__ . '/../../config/database.php';

$userId = $_SESSION['user_id'] ?? null;
$username = $_SESSION['username'] ?? '';

// Xử lý lưu trực tiếp qua form HTML chuẩn (Full-page POST - Miễn nhiễm 100% với lỗi AJAX 403)
$directResult = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['direct_save'])) {
    try {
        $db = Database::getConnection();
        $scUrl = trim($_POST['script_url'] ?? '');
        $shUrl = trim($_POST['sheet_url'] ?? '');
        $shName = trim($_POST['sheet_name'] ?? 'Kho Sản Phẩm');

        // Tạo bảng nếu chưa có
        $db->exec("CREATE TABLE IF NOT EXISTS google_sheet_configs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sheet_url TEXT NULL,
            script_url TEXT NOT NULL,
            sheet_name VARCHAR(100) DEFAULT 'Sheet1',
            columns_json TEXT NOT NULL,
            sheets_json LONGTEXT NULL,
            checksum VARCHAR(64) DEFAULT NULL,
            last_synced_at DATETIME DEFAULT NULL,
            synced_by_user_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        $stmt = $db->query("SELECT id FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
        $cfg = $stmt->fetch();
        if ($cfg) {
            $u = $db->prepare("UPDATE google_sheet_configs SET script_url = :sc, sheet_url = :sh, sheet_name = :nm, updated_at = NOW() WHERE id = :id");
            $u->execute([':sc' => $scUrl, ':sh' => $shUrl, ':nm' => $shName, ':id' => $cfg['id']]);
        } else {
            $i = $db->prepare("INSERT INTO google_sheet_configs (script_url, sheet_url, sheet_name, columns_json, sheets_json, created_at, updated_at) VALUES (:sc, :sh, :nm, '[]', '[]', NOW(), NOW())");
            $i->execute([':sc' => $scUrl, ':sh' => $shUrl, ':nm' => $shName]);
        }
        $directResult = ['success' => true, 'message' => 'LƯU TRỰC TIẾP QUA FORM THÀNH CÔNG!'];
    } catch (Exception $e) {
        $directResult = ['success' => false, 'message' => 'Lỗi DB: ' . $e->getMessage()];
    }
}

// Lấy config hiện tại
$currentConfig = null;
try {
    $db = Database::getConnection();
    $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
    $currentConfig = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Exception $e) {}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Chẩn đoán kết nối Google Sheet</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }
        .card { background: #1e293b; border-radius: 10px; padding: 20px; max-width: 800px; margin: 0 auto 20px; border: 1px solid #334155; }
        h1, h2 { margin-top: 0; color: #38bdf8; }
        input[type="text"], input[type="url"] { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; margin-bottom: 12px; box-sizing: border-box; }
        button { background: #0284c7; color: white; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-right: 8px; margin-bottom: 8px; }
        button:hover { background: #0369a1; }
        .btn-green { background: #059669; }
        .btn-green:hover { background: #047857; }
        .btn-orange { background: #d97706; }
        .btn-orange:hover { background: #b45309; }
        pre { background: #020617; padding: 12px; border-radius: 6px; overflow-x: auto; color: #a5f3fc; border: 1px solid #1e293b; font-size: 13px; max-height: 250px; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-ok { background: #065f46; color: #6ee7b7; }
        .badge-err { background: #7f1d1d; color: #fca5a5; }
    </style>
</head>
<body>

<div class="card">
    <h1>🔬 Công cụ Chẩn đoán & Lưu Cấu hình Google Sheet</h1>
    <p>Trạng thái đăng nhập: 
        <?php if ($userId): ?>
            <span class="badge badge-ok">Đã đăng nhập (User ID: <?= $userId ?>, Username: <?= htmlspecialchars($username) ?>)</span>
        <?php else: ?>
            <span class="badge badge-err">Chưa đăng nhập! Vui lòng <a href="../auth/login.php" style="color:#38bdf8;">Đăng nhập</a> trước</span>
        <?php endif; ?>
    </p>

    <?php if ($directResult): ?>
        <div style="padding:12px; border-radius:6px; margin-bottom:15px; background: <?= $directResult['success'] ? '#065f46' : '#7f1d1d' ?>;">
            <strong><?= htmlspecialchars($directResult['message']) ?></strong>
        </div>
    <?php endif; ?>

    <h3>Cấu hình hiện tại trong CSDL:</h3>
    <pre><?= htmlspecialchars(json_encode($currentConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) ?></pre>
</div>

<div class="card">
    <h2>Cách 1: Lưu cấu hình bằng Form HTML thuần (Không bị WAF chặn)</h2>
    <p style="color:#94a3b8;font-size:13px;">Cách này gửi POST chuẩn của trình duyệt (không qua fetch/AJAX), giúp bạn lưu cấu hình ngay lập tức:</p>
    <form method="POST">
        <input type="hidden" name="direct_save" value="1">
        <label>URL Google Apps Script:</label>
        <input type="url" name="script_url" value="<?= htmlspecialchars($currentConfig['script_url'] ?? 'https://script.google.com/macros/s/AKfycby6L1lChJ4OJAHd63FnOqibaTDUXTfDa8t_IUXFMEDXSWHj2N--aMWdU3nA57DQ7k7s6Q/exec') ?>" required>
        
        <label>URL Google Sheet (nếu có):</label>
        <input type="url" name="sheet_url" value="<?= htmlspecialchars($currentConfig['sheet_url'] ?? '') ?>">

        <label>Tên Sheet / Ghi chú:</label>
        <input type="text" name="sheet_name" value="<?= htmlspecialchars($currentConfig['sheet_name'] ?? 'Kho Sản Phẩm') ?>">

        <button type="submit" class="btn-green">💾 Bấm vào đây để Lưu Cấu Hình Ngay Lập Tức</button>
    </form>
</div>

<div class="card">
    <h2>Cách 2: Chẩn đoán lỗi 403 từng Endpoint</h2>
    <p style="color:#94a3b8;font-size:13px;">Bấm từng nút bên dưới để xem chính xác hosting phản hồi mã gì và nội dung gì:</p>
    
    <div>
        <button type="button" onclick="testBrowserFetchGAS()">1. Test Trình duyệt đọc Google Apps Script</button>
        <button type="button" onclick="testEndpoint('google_sheet_action.php')">2. Test POST vào google_sheet_action.php</button>
        <button type="button" onclick="testEndpoint('sync_polling.php')">3. Test POST vào sync_polling.php</button>
        <button type="button" class="btn-orange" onclick="testSyncRelay()">4. Test Đồng bộ dữ liệu qua Client Relay</button>
    </div>

    <h3>Kết quả kiểm tra chi tiết:</h3>
    <pre id="testOutput">Chưa chạy kiểm tra. Hãy bấm một trong các nút ở trên...</pre>
</div>

<script>
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6L1lChJ4OJAHd63FnOqibaTDUXTfDa8t_IUXFMEDXSWHj2N--aMWdU3nA57DQ7k7s6Q/exec";

function log(msg) {
    const el = document.getElementById('testOutput');
    el.innerText = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg;
}

// 1. Test trình duyệt fetch Google Apps Script
async function testBrowserFetchGAS() {
    log('Đang gọi Google Apps Script từ trình duyệt: ' + SCRIPT_URL + ' ...');
    try {
        const t0 = performance.now();
        const res = await fetch(SCRIPT_URL, { method: 'GET', mode: 'cors' });
        const time = Math.round(performance.now() - t0);
        const data = await res.json();
        log({
            status: res.status,
            statusText: res.statusText,
            time_ms: time,
            headers: {
                contentType: res.headers.get('content-type')
            },
            data_sample: {
                success: data.success,
                total_sheets: data.sheets ? data.sheets.length : (data.headers ? 1 : 0),
                sheet_names: data.sheets ? data.sheets.map(s => s.sheet_name) : [data.sheet_name || 'Sheet1']
            }
        });
    } catch (e) {
        log('LỖI FETCH GOOGLE APPS SCRIPT: ' + e.message);
    }
}

// 2 & 3. Test gửi POST vào file API
async function testEndpoint(endpointName) {
    log('Đang gửi POST kiểm tra tới ../../api/' + endpointName + ' ...');
    try {
        const formData = new FormData();
        formData.append('action', 'save_settings');
        formData.append('test_ping', '1');

        const res = await fetch('../../api/' + endpointName, {
            method: 'POST',
            body: formData
        });

        const status = res.status;
        const text = await res.text();
        log({
            endpoint: endpointName,
            http_status: status,
            status_text: res.statusText,
            body_length: text.length,
            body_preview: text.substring(0, 300)
        });
    } catch (e) {
        log('LỖI GỬI REQUEST: ' + e.message);
    }
}

// 4. Test đồng bộ dữ liệu
async function testSyncRelay() {
    log('Bước 1: Đang lấy dữ liệu từ Google Apps Script...');
    try {
        const gasRes = await fetch(SCRIPT_URL, { method: 'GET', mode: 'cors' });
        const gasData = await gasRes.json();
        log('Đã nhận dữ liệu từ Google! Đang đẩy vào API để lưu CSDL...');

        const formData = new FormData();
        formData.append('action', 'sync_data');
        formData.append('script_url', SCRIPT_URL);
        formData.append('client_data', JSON.stringify(gasData));

        const res = await fetch('../../api/google_sheet_action.php', {
            method: 'POST',
            body: formData
        });

        const status = res.status;
        const text = await res.text();
        log({
            http_status: status,
            response_preview: text.substring(0, 500)
        });
    } catch (e) {
        log('LỖI: ' + e.message);
    }
}
</script>

</body>
</html>
