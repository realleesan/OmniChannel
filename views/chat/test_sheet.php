<?php
/**
 * TRANG TEST & ĐỒNG BỘ GOOGLE SHEET TRỰC TIẾP (MIỄN NHIỄM 100% VỚI OPENRESTY 403)
 * Đường dẫn: https://omnichannel.gt.tc/views/chat/test_sheet.php
 */
require_once __DIR__ . '/../../config/database.php';

$userId = $_SESSION['user_id'] ?? null;
$username = $_SESSION['username'] ?? '';

// Hàm chuẩn hóa và lưu dữ liệu vào CSDL
function saveSheetsToDb($db, $config, $gasData, $userId) {
    $normalizedSheets = [];
    if (!empty($gasData['sheets']) && is_array($gasData['sheets'])) {
        foreach ($gasData['sheets'] as $s) {
            $sHeaders = $s['headers'] ?? [];
            if (!empty($sHeaders)) {
                $normalizedSheets[] = [
                    'sheet_name' => $s['sheet_name'] ?? 'Sheet1',
                    'headers'    => $sHeaders,
                    'data'       => $s['data'] ?? [],
                    'checksum'   => $s['checksum'] ?? ''
                ];
            }
        }
    } else {
        $sHeaders = $gasData['headers'] ?? [];
        if (!empty($sHeaders)) {
            $normalizedSheets[] = [
                'sheet_name' => $gasData['sheet_name'] ?? ($config['sheet_name'] ?? 'Sheet1'),
                'headers'    => $sHeaders,
                'data'       => $gasData['data'] ?? [],
                'checksum'   => $gasData['checksum'] ?? ''
            ];
        }
    }

    if (empty($normalizedSheets)) {
        throw new Exception("Không tìm thấy dữ liệu trang tính hợp lệ trong kết quả trả về");
    }

    $primarySheet = $normalizedSheets[0];
    $overallChecksum = $gasData['checksum'] ?? md5(json_encode($normalizedSheets));

    $sheetsSummary = [];
    $totalRows = 0;
    foreach ($normalizedSheets as $s) {
        $cnt = count($s['data']);
        $totalRows += $cnt;
        $sheetsSummary[] = [
            'name'    => $s['sheet_name'],
            'columns' => $s['headers'],
            'count'   => $cnt
        ];
    }

    $db->beginTransaction();

    $configId = $config['id'];
    $upd = $db->prepare("UPDATE google_sheet_configs SET columns_json = :cols, sheets_json = :s_json, checksum = :csum, last_synced_at = NOW(), synced_by_user_id = :uid, updated_at = NOW() WHERE id = :id");
    $upd->execute([
        ':cols'   => json_encode($primarySheet['headers'], JSON_UNESCAPED_UNICODE),
        ':s_json' => json_encode($sheetsSummary, JSON_UNESCAPED_UNICODE),
        ':csum'   => $overallChecksum,
        ':uid'    => $userId,
        ':id'     => $configId
    ]);

    // Xóa dòng cũ và nạp toàn bộ dòng mới theo từng sheet
    $del = $db->prepare("DELETE FROM google_sheet_rows WHERE config_id = :cid");
    $del->execute([':cid' => $configId]);

    $insRow = $db->prepare("INSERT INTO google_sheet_rows (config_id, sheet_name, row_index, row_data_json, created_at) VALUES (:cid, :sname, :idx, :data, NOW())");

    foreach ($normalizedSheets as $s) {
        $sName = $s['sheet_name'];
        $idx = 1;
        foreach ($s['data'] as $r) {
            $insRow->execute([
                ':cid'   => $configId,
                ':sname' => $sName,
                ':idx'   => $idx++,
                ':data'  => json_encode($r, JSON_UNESCAPED_UNICODE)
            ]);
        }
    }

    $db->commit();
    $details = array_map(function($x) { return "{$x['name']} ({$x['count']} dòng)"; }, $sheetsSummary);
    return "Đã nạp thành công {$totalRows} dòng từ " . count($normalizedSheets) . " trang tính: " . implode(', ', $details);
}

$directResult = null;

// 1. Lưu cấu hình qua form HTML chuẩn
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['direct_save'])) {
    try {
        $db = Database::getConnection();
        $scUrl = trim($_POST['script_url'] ?? '');
        $shUrl = trim($_POST['sheet_url'] ?? '');
        $shName = trim($_POST['sheet_name'] ?? 'Kho Sản Phẩm');

        $stmt = $db->query("SELECT id FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
        $cfg = $stmt->fetch();
        if ($cfg) {
            $u = $db->prepare("UPDATE google_sheet_configs SET script_url = :sc, sheet_url = :sh, sheet_name = :nm, updated_at = NOW() WHERE id = :id");
            $u->execute([':sc' => $scUrl, ':sh' => $shUrl, ':nm' => $shName, ':id' => $cfg['id']]);
        } else {
            $i = $db->prepare("INSERT INTO google_sheet_configs (script_url, sheet_url, sheet_name, columns_json, sheets_json, created_at, updated_at) VALUES (:sc, :sh, :nm, '[]', '[]', NOW(), NOW())");
            $i->execute([':sc' => $scUrl, ':sh' => $shUrl, ':nm' => $shName]);
        }
        $directResult = ['success' => true, 'message' => 'LƯU CẤU HÌNH THÀNH CÔNG!'];
    } catch (Exception $e) {
        $directResult = ['success' => false, 'message' => 'Lỗi DB: ' . $e->getMessage()];
    }
}

// 2. Đồng bộ qua Trình duyệt Relay gửi form HTML chuẩn (100% không bị OpenResty chặn)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['direct_sync_client'])) {
    try {
        $db = Database::getConnection();
        $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
        $cfg = $stmt->fetch();
        if (!$cfg) throw new Exception("Chưa có cấu hình Google Sheet");

        $rawJson = $_POST['client_json'] ?? '';
        $gasData = json_decode($rawJson, true);
        if (!$gasData || !isset($gasData['success']) || !$gasData['success']) {
            throw new Exception("Dữ liệu từ Google Apps Script không hợp lệ hoặc rỗng");
        }

        $summary = saveSheetsToDb($db, $cfg, $gasData, $userId);
        $directResult = ['success' => true, 'message' => '🎉 ' . $summary];
    } catch (Exception $e) {
        $directResult = ['success' => false, 'message' => 'Lỗi đồng bộ: ' . $e->getMessage()];
    }
}

// 3. Lấy config hiện tại và số dòng đã nạp
$currentConfig = null;
$loadedSheets = [];
$totalRowsInDb = 0;
try {
    $db = Database::getConnection();
    $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
    $currentConfig = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($currentConfig) {
        $cntStmt = $db->prepare("SELECT sheet_name, COUNT(*) as cnt FROM google_sheet_rows WHERE config_id = :cid GROUP BY sheet_name");
        $cntStmt->execute([':cid' => $currentConfig['id']]);
        $loadedSheets = $cntStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($loadedSheets as $ls) {
            $totalRowsInDb += (int)$ls['cnt'];
        }
    }
} catch (Exception $e) {}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Đồng bộ Google Sheet</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }
        .card { background: #1e293b; border-radius: 10px; padding: 20px; max-width: 800px; margin: 0 auto 20px; border: 1px solid #334155; }
        h1, h2 { margin-top: 0; color: #38bdf8; }
        input[type="text"], input[type="url"] { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; margin-bottom: 12px; box-sizing: border-box; }
        button { background: #0284c7; color: white; border: none; padding: 12px 20px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 15px; margin-right: 8px; margin-bottom: 8px; }
        button:hover { background: #0369a1; }
        .btn-green { background: #059669; }
        .btn-green:hover { background: #047857; }
        .btn-orange { background: #d97706; }
        .btn-orange:hover { background: #b45309; }
        pre { background: #020617; padding: 12px; border-radius: 6px; overflow-x: auto; color: #a5f3fc; border: 1px solid #1e293b; font-size: 13px; max-height: 250px; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-ok { background: #065f46; color: #6ee7b7; }
        .badge-err { background: #7f1d1d; color: #fca5a5; }
        .stat-item { background: #0f172a; padding: 10px 14px; border-radius: 6px; border: 1px solid #334155; display: inline-block; margin-right: 10px; margin-bottom: 10px; }
    </style>
</head>
<body>

<div class="card">
    <h1>🚀 Đồng Bộ Dữ Liệu Google Sheet</h1>
    <p>Trạng thái đăng nhập: 
        <?php if ($userId): ?>
            <span class="badge badge-ok">Đã đăng nhập (<?= htmlspecialchars($username) ?>)</span>
        <?php else: ?>
            <span class="badge badge-err">Chưa đăng nhập!</span>
        <?php endif; ?>
    </p>

    <?php if ($directResult): ?>
        <div style="padding:14px; border-radius:8px; margin-bottom:15px; background: <?= $directResult['success'] ? '#065f46' : '#7f1d1d' ?>; border: 1px solid <?= $directResult['success'] ? '#10b981' : '#ef4444' ?>;">
            <strong style="font-size:15px;"><?= htmlspecialchars($directResult['message']) ?></strong>
        </div>
    <?php endif; ?>

    <div>
        <h3>Trạng thái CSDL hiện tại:</h3>
        <div class="stat-item">Lần đồng bộ cuối: <strong><?= $currentConfig['last_synced_at'] ?: 'Chưa đồng bộ' ?></strong></div>
        <div class="stat-item">Tổng số dòng trong CSDL: <strong><?= $totalRowsInDb ?></strong></div>
        <?php if (!empty($loadedSheets)): ?>
            <div style="margin-top:10px;">
                <strong>Các trang tính đã nạp:</strong>
                <?php foreach ($loadedSheets as $ls): ?>
                    <span class="badge badge-ok" style="margin-right:6px;"><?= htmlspecialchars($ls['sheet_name']) ?>: <?= $ls['cnt'] ?> dòng</span>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
</div>

<div class="card" style="border: 2px solid #f59e0b;">
    <h2 style="color:#fbbf24;">⚡ BƯỚC QUAN TRỌNG: Bấm để nạp 6 trang tính vào CSDL</h2>
    <p style="color:#cbd5e1;font-size:14px;">
        Trình duyệt của bạn sẽ tải trực tiếp 6 trang tính (<em>SanPham, TonKho, BangSizeAo,...</em>) từ Google Apps Script và nạp thẳng vào CSDL qua Form chuẩn của trình duyệt (<strong>miễn nhiễm 100% với lỗi OpenResty 403</strong>):
    </p>

    <form id="relayForm" method="POST">
        <input type="hidden" name="direct_sync_client" value="1">
        <input type="hidden" name="client_json" id="clientJsonInput">
        <button type="button" class="btn-orange" id="btnRunSync" onclick="runRelaySync()">
            ⚡ BẤM VÀO ĐÂY ĐỂ ĐỒNG BỘ TOÀN BỘ 6 SHEET VÀO CSDL
        </button>
    </form>
    <div id="syncProgress" style="margin-top:10px;color:#38bdf8;font-weight:600;display:none;"></div>
</div>

<div class="card">
    <h2>Lưu / Cập nhật URL Web App</h2>
    <form method="POST">
        <input type="hidden" name="direct_save" value="1">
        <label>URL Google Apps Script:</label>
        <input type="url" name="script_url" id="scriptUrlField" value="<?= htmlspecialchars($currentConfig['script_url'] ?? 'https://script.google.com/macros/s/AKfycby6L1lChJ4OJAHd63FnOqibaTDUXTfDa8t_IUXFMEDXSWHj2N--aMWdU3nA57DQ7k7s6Q/exec') ?>" required>
        
        <label>URL Google Sheet:</label>
        <input type="url" name="sheet_url" value="<?= htmlspecialchars($currentConfig['sheet_url'] ?? 'https://docs.google.com/spreadsheets/d/1NWjkrNJwMA-UaKUHDnOJvNJjsRltu8L0d5p_IykXRuA/edit') ?>">

        <label>Tên Sheet / Ghi chú:</label>
        <input type="text" name="sheet_name" value="<?= htmlspecialchars($currentConfig['sheet_name'] ?? 'Kho Sản Phẩm') ?>">

        <button type="submit" class="btn-green">💾 Lưu cấu hình</button>
        <a href="workspace.php" style="color:#38bdf8;margin-left:15px;text-decoration:none;font-weight:bold;">&larr; Quay lại trang Workspace</a>
    </form>
</div>

<script>
async function runRelaySync() {
    const btn = document.getElementById('btnRunSync');
    const prog = document.getElementById('syncProgress');
    const url = document.getElementById('scriptUrlField').value.trim();

    if (!url) {
        alert("Vui lòng nhập URL Google Apps Script!");
        return;
    }

    btn.disabled = true;
    prog.style.display = 'block';
    prog.innerText = "⏳ Đang kết nối tải 6 trang tính từ Google Apps Script (khoảng 3-5 giây)...";

    try {
        const res = await fetch(url, { method: 'GET', mode: 'cors' });
        if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
        
        const data = await res.json();
        if (!data || !data.success) {
            throw new Error(data.message || "Google Apps Script phản hồi thất bại");
        }

        const countSheets = data.sheets ? data.sheets.length : 1;
        prog.innerText = `✅ Đã tải xong ${countSheets} trang tính từ Google! Đang nạp vào CSDL MySQL...`;

        document.getElementById('clientJsonInput').value = JSON.stringify(data);
        document.getElementById('relayForm').submit();

    } catch (e) {
        prog.innerText = "❌ Lỗi: " + e.message;
        btn.disabled = false;
        alert("Không thể tải dữ liệu từ Google Apps Script: " + e.message);
    }
}
</script>

</body>
</html>
