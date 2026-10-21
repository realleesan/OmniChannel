<?php
/**
 * API: google_sheet_action.php
 * Xử lý cấu hình, đồng bộ dữ liệu và tra cứu bảng tính Google Sheets (Hỗ trợ Đa Trang Tính)
 */

ob_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    while (ob_get_level() > 0) { @ob_end_clean(); }
    echo json_encode(['success' => false, 'message' => 'Vui lòng đăng nhập lại'], JSON_UNESCAPED_UNICODE);
    exit;
}

$currentUser = [
    'id'       => $userId,
    'username' => $_SESSION['username'] ?? '',
    'fullname' => $_SESSION['fullname'] ?? ''
];

$isAdmin = (strtolower($currentUser['username']) === 'admin');
$action = $_POST['action'] ?? $_GET['action'] ?? 'get_status';

try {
    $db = Database::getConnection();

    // Tự động kiểm tra và khởi tạo cấu trúc bảng nếu chưa tồn tại (Self-healing schema)
    @$db->exec("
        CREATE TABLE IF NOT EXISTS google_sheet_configs (
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_synced_by (synced_by_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    @$db->exec("
        CREATE TABLE IF NOT EXISTS google_sheet_rows (
            id INT AUTO_INCREMENT PRIMARY KEY,
            config_id INT NOT NULL,
            sheet_name VARCHAR(100) DEFAULT 'Sheet1',
            row_index INT NOT NULL,
            row_data_json LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_config_sheet (config_id, sheet_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // Tự động thêm cột bổ trợ nếu đang chạy trên bảng cũ
    try {
        @$db->exec("ALTER TABLE google_sheet_configs ADD COLUMN sheets_json LONGTEXT NULL AFTER columns_json");
    } catch (Exception $e) {}
    try {
        @$db->exec("ALTER TABLE google_sheet_rows ADD COLUMN sheet_name VARCHAR(100) DEFAULT 'Sheet1' AFTER config_id");
    } catch (Exception $e) {}
    try {
        @$db->exec("ALTER TABLE templates ADD COLUMN sheet_name VARCHAR(100) NULL DEFAULT NULL AFTER variables_json");
    } catch (Exception $e) {}

    switch ($action) {
        // --------------------------------------------------------
        // 1. LẤY TRẠNG THÁI CẤU HÌNH & KIỂM TRA THAY ĐỔI
        // --------------------------------------------------------
        case 'get_status':
            $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
            $config = $stmt->fetch();

            $totalRows = 0;
            $columns = [];
            $sheetsList = [];
            if ($config) {
                $columns = json_decode($config['columns_json'] ?? '[]', true) ?: [];
                $sheetsList = json_decode($config['sheets_json'] ?? '[]', true) ?: [];
                $cntStmt = $db->prepare("SELECT COUNT(*) FROM google_sheet_rows WHERE config_id = :cid");
                $cntStmt->execute([':cid' => $config['id']]);
                $totalRows = (int)$cntStmt->fetchColumn();
            }

            // Kiểm tra nhẹ xem Google Sheet có thay đổi hay không (nếu có script_url)
            $hasChanges = false;
            $checkUrl = $config['script_url'] ?? '';
            $checkParam = $_GET['check_remote'] ?? '0';

            if ($checkParam === '1' && !empty($checkUrl) && filter_var($checkUrl, FILTER_VALIDATE_URL)) {
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $checkUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 6);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                $remoteRes = curl_exec($ch);
                curl_close($ch);

                if ($remoteRes) {
                    $remoteData = json_decode($remoteRes, true);
                    if ($remoteData && isset($remoteData['checksum'])) {
                        if (!empty($config['checksum']) && $remoteData['checksum'] !== $config['checksum']) {
                            $hasChanges = true;
                        }
                    }
                }
            }

            echo json_encode([
                'success'      => true,
                'is_admin'     => $isAdmin,
                'config'       => $config ? [
                    'id'             => $config['id'],
                    'sheet_url'      => $config['sheet_url'],
                    'script_url'     => $config['script_url'],
                    'sheet_name'     => $config['sheet_name'],
                    'columns'        => $columns,
                    'sheets'         => $sheetsList,
                    'checksum'       => $config['checksum'],
                    'last_synced_at' => $config['last_synced_at']
                ] : null,
                'total_rows'   => $totalRows,
                'has_changes'  => $hasChanges
            ], JSON_UNESCAPED_UNICODE);
            break;

        // --------------------------------------------------------
        // 2. LẤY DỮ LIỆU BẢNG TÍNH (VIEW-ONLY CHO CẢ ADMIN VÀ NHÂN VIÊN)
        // --------------------------------------------------------
        case 'get_data':
            $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
            $config = $stmt->fetch();

            if (!$config) {
                echo json_encode([
                    'success' => true,
                    'sheets'  => [],
                    'columns' => [],
                    'rows'    => [],
                    'total'   => 0,
                    'message' => 'Chưa cấu hình liên kết Google Sheet'
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $sheetsList = json_decode($config['sheets_json'] ?? '[]', true) ?: [];
            $targetSheet = trim($_GET['sheet_name'] ?? '');

            // Nếu không truyền sheet_name, mặc định lấy sheet đầu tiên trong danh sách
            if (empty($targetSheet) && !empty($sheetsList)) {
                $targetSheet = $sheetsList[0]['name'] ?? ($config['sheet_name'] ?? 'Sheet1');
            }
            if (empty($targetSheet)) {
                $targetSheet = $config['sheet_name'] ?? 'Sheet1';
            }

            // Tìm danh sách cột của sheet được chọn
            $columns = [];
            foreach ($sheetsList as $s) {
                if (strcasecmp($s['name'] ?? '', $targetSheet) === 0) {
                    $columns = $s['columns'] ?? [];
                    break;
                }
            }
            if (empty($columns)) {
                $columns = json_decode($config['columns_json'] ?? '[]', true) ?: [];
            }

            $keyword = trim($_GET['search'] ?? '');

            // Lấy dòng dữ liệu của đúng trang tính đó
            $rowsStmt = $db->prepare("
                SELECT row_index, sheet_name, row_data_json 
                FROM google_sheet_rows 
                WHERE config_id = :cid AND (sheet_name = :sname OR sheet_name IS NULL OR sheet_name = '') 
                ORDER BY row_index ASC
            ");
            $rowsStmt->execute([
                ':cid'   => $config['id'],
                ':sname' => $targetSheet
            ]);
            $rawRows = $rowsStmt->fetchAll();

            // Fallback: Nếu không có dòng nào theo sheet_name và chưa có sheets_json (dữ liệu cũ), lấy toàn bộ
            if (empty($rawRows) && empty($sheetsList)) {
                $fallbackStmt = $db->prepare("SELECT row_index, row_data_json FROM google_sheet_rows WHERE config_id = :cid ORDER BY row_index ASC");
                $fallbackStmt->execute([':cid' => $config['id']]);
                $rawRows = $fallbackStmt->fetchAll();
            }

            $parsedRows = [];
            foreach ($rawRows as $r) {
                $rowObj = json_decode($r['row_data_json'], true) ?: [];
                if (!empty($keyword)) {
                    $rowStr = json_encode($rowObj, JSON_UNESCAPED_UNICODE);
                    if (mb_stripos($rowStr, $keyword) === false) {
                        continue;
                    }
                }
                $parsedRows[] = $rowObj;
            }

            echo json_encode([
                'success'        => true,
                'sheets'         => $sheetsList,
                'active_sheet'   => $targetSheet,
                'columns'        => $columns,
                'rows'           => $parsedRows,
                'total'          => count($parsedRows),
                'total_all'      => count($rawRows),
                'last_synced_at' => $config['last_synced_at']
            ], JSON_UNESCAPED_UNICODE);
            break;

        // --------------------------------------------------------
        // 3. LƯU CẤU HÌNH LIÊN KẾT GOOGLE SHEET (ADMIN ONLY)
        // --------------------------------------------------------
        case 'save_config':
            if (!$isAdmin) {
                while (ob_get_level() > 0) { @ob_end_clean(); }
                echo json_encode(['success' => false, 'message' => 'Chỉ Admin mới có quyền thay đổi cấu hình'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $sheetUrl = trim($_POST['sheet_url'] ?? '');
            if (empty($sheetUrl) && !empty($_POST['sh_url_payload'])) {
                $sheetUrl = trim(base64_decode($_POST['sh_url_payload']));
            }
            if (empty($sheetUrl) && !empty($_POST['sheet_url_b64'])) {
                $sheetUrl = trim(base64_decode($_POST['sheet_url_b64']));
            }

            $scriptUrl = trim($_POST['script_url'] ?? '');
            if (empty($scriptUrl) && !empty($_POST['s_url_payload'])) {
                $scriptUrl = trim(base64_decode($_POST['s_url_payload']));
            }
            if (empty($scriptUrl) && !empty($_POST['script_url_b64'])) {
                $scriptUrl = trim(base64_decode($_POST['script_url_b64']));
            }

            $sheetName = trim($_POST['sheet_name'] ?? 'Sheet1');

            if (empty($scriptUrl)) {
                while (ob_get_level() > 0) { @ob_end_clean(); }
                echo json_encode(['success' => false, 'message' => 'Vui lòng nhập URL Google Apps Script Web App'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            if (!filter_var($scriptUrl, FILTER_VALIDATE_URL)) {
                while (ob_get_level() > 0) { @ob_end_clean(); }
                echo json_encode(['success' => false, 'message' => 'URL Google Apps Script không đúng định dạng'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
            $config = $stmt->fetch();

            if ($config) {
                $updStmt = $db->prepare("
                    UPDATE google_sheet_configs 
                    SET sheet_url = :s_url, script_url = :sc_url, sheet_name = :s_name, updated_at = NOW()
                    WHERE id = :id
                ");
                $updStmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $sheetName,
                    ':id'     => $config['id']
                ]);
            } else {
                $insStmt = $db->prepare("
                    INSERT INTO google_sheet_configs 
                    (sheet_url, script_url, sheet_name, columns_json, sheets_json, created_at, updated_at)
                    VALUES (:s_url, :sc_url, :s_name, '[]', '[]', NOW(), NOW())
                ");
                $insStmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $sheetName
                ]);
            }

            while (ob_get_level() > 0) { @ob_end_clean(); }
            echo json_encode(['success' => true, 'message' => 'Lưu cấu hình Google Sheet thành công'], JSON_UNESCAPED_UNICODE);
            break;

        // --------------------------------------------------------
        // 4. ĐỒNG BỘ DỮ LIỆU TỪ GOOGLE SHEET VỀ CSDL (HỖ TRỢ ĐA TRANG TÍNH)
        // --------------------------------------------------------
        case 'sync':
            $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
            $config = $stmt->fetch();

            $scriptUrl = trim($_POST['script_url'] ?? '');
            if (empty($scriptUrl) && !empty($_POST['s_url_payload'])) {
                $scriptUrl = trim(base64_decode($_POST['s_url_payload']));
            }
            if (empty($scriptUrl) && !empty($_POST['script_url_b64'])) {
                $scriptUrl = trim(base64_decode($_POST['script_url_b64']));
            }
            if (empty($scriptUrl) && !empty($config['script_url'])) {
                $scriptUrl = $config['script_url'];
            }

            $sheetUrl = trim($_POST['sheet_url'] ?? '');
            if (empty($sheetUrl) && !empty($_POST['sh_url_payload'])) {
                $sheetUrl = trim(base64_decode($_POST['sh_url_payload']));
            }
            if (empty($sheetUrl) && !empty($_POST['sheet_url_b64'])) {
                $sheetUrl = trim(base64_decode($_POST['sheet_url_b64']));
            }
            if (empty($sheetUrl) && !empty($config['sheet_url'])) {
                $sheetUrl = $config['sheet_url'];
            }

            if (empty($scriptUrl)) {
                while (ob_get_level() > 0) { @ob_end_clean(); }
                echo json_encode(['success' => false, 'message' => 'Chưa có URL Google Apps Script để đồng bộ'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // Gọi sang Google Apps Script với Follow Location (302 redirect)
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $scriptUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_USERAGENT, 'OmniChannel-Sync-Agent/2.0');
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($curlError) {
                echo json_encode(['success' => false, 'message' => 'Lỗi kết nối tới Google Apps Script: ' . $curlError], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $gasData = json_decode($response, true);
            if (!$gasData || !isset($gasData['success']) || !$gasData['success']) {
                $msg = $gasData['message'] ?? 'Phản hồi từ Google Apps Script không hợp lệ';
                echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // Chuẩn hóa mảng các trang tính (Hỗ trợ cấu trúc Đa trang tính lẫn Đơn trang tính)
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

            if (empty($normalizedSheets) || empty($normalizedSheets[0]['headers'])) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy cột dữ liệu hợp lệ trong các trang tính'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $primarySheet = $normalizedSheets[0];
            $overallChecksum = $gasData['checksum'] ?? md5(json_encode($normalizedSheets));

            // Tạo sheets metadata JSON
            $sheetsSummary = [];
            $totalAllRows = 0;
            foreach ($normalizedSheets as $s) {
                $cnt = count($s['data']);
                $totalAllRows += $cnt;
                $sheetsSummary[] = [
                    'name'    => $s['sheet_name'],
                    'columns' => $s['headers'],
                    'count'   => $cnt
                ];
            }

            // Bắt đầu giao dịch lưu trữ CSDL
            $db->beginTransaction();

            if ($config) {
                $updStmt = $db->prepare("
                    UPDATE google_sheet_configs 
                    SET sheet_url = :s_url, script_url = :sc_url, sheet_name = :s_name,
                        columns_json = :cols, sheets_json = :s_json, checksum = :csum, last_synced_at = NOW(),
                        synced_by_user_id = :uid, updated_at = NOW()
                    WHERE id = :id
                ");
                $updStmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $primarySheet['sheet_name'],
                    ':cols'   => json_encode($primarySheet['headers'], JSON_UNESCAPED_UNICODE),
                    ':s_json' => json_encode($sheetsSummary, JSON_UNESCAPED_UNICODE),
                    ':csum'   => $overallChecksum,
                    ':uid'    => $userId,
                    ':id'     => $config['id']
                ]);
                $configId = $config['id'];
            } else {
                $insStmt = $db->prepare("
                    INSERT INTO google_sheet_configs 
                    (sheet_url, script_url, sheet_name, columns_json, sheets_json, checksum, last_synced_at, synced_by_user_id, created_at, updated_at)
                    VALUES (:s_url, :sc_url, :s_name, :cols, :s_json, :csum, NOW(), :uid, NOW(), NOW())
                ");
                $insStmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $primarySheet['sheet_name'],
                    ':cols'   => json_encode($primarySheet['headers'], JSON_UNESCAPED_UNICODE),
                    ':s_json' => json_encode($sheetsSummary, JSON_UNESCAPED_UNICODE),
                    ':csum'   => $overallChecksum,
                    ':uid'    => $userId
                ]);
                $configId = $db->lastInsertId();
            }

            // Xóa dữ liệu cũ của config này và nạp toàn bộ dòng mới theo từng sheet
            $delStmt = $db->prepare("DELETE FROM google_sheet_rows WHERE config_id = :cid");
            $delStmt->execute([':cid' => $configId]);

            $insertRowStmt = $db->prepare("
                INSERT INTO google_sheet_rows (config_id, sheet_name, row_index, row_data_json, created_at)
                VALUES (:cid, :sname, :idx, :data, NOW())
            ");

            foreach ($normalizedSheets as $s) {
                $sName = $s['sheet_name'];
                $rowIndex = 1;
                foreach ($s['data'] as $row) {
                    $insertRowStmt->execute([
                        ':cid'   => $configId,
                        ':sname' => $sName,
                        ':idx'   => $rowIndex++,
                        ':data'  => json_encode($row, JSON_UNESCAPED_UNICODE)
                    ]);
                }
            }

            $db->commit();

            echo json_encode([
                'success'        => true,
                'message'        => "Đồng bộ thành công {$totalAllRows} dòng từ " . count($normalizedSheets) . " trang tính",
                'total_sheets'   => count($normalizedSheets),
                'sheets'         => $sheetsSummary,
                'sheet_name'     => $primarySheet['sheet_name'],
                'total_rows'     => $totalAllRows,
                'columns'        => $primarySheet['headers'],
                'checksum'       => $overallChecksum,
                'last_synced_at' => date('Y-m-d H:i:s')
            ], JSON_UNESCAPED_UNICODE);
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Hành động không hợp lệ'], JSON_UNESCAPED_UNICODE);
            break;
    }

} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    echo json_encode([
        'success' => false,
        'message' => 'Lỗi xử lý máy chủ: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
