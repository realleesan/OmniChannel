<?php
/**
 * API: google_sheet_action.php
 * Xử lý cấu hình, đồng bộ dữ liệu và tra cứu bảng tính Google Sheets
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
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

    switch ($action) {
        // --------------------------------------------------------
        // 1. LẤY TRẠNG THÁI CẤU HÌNH & KIỂM TRA THAY ĐỔI
        // --------------------------------------------------------
        case 'get_status':
            $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
            $config = $stmt->fetch();

            $totalRows = 0;
            $columns = [];
            if ($config) {
                $columns = json_decode($config['columns_json'] ?? '[]', true) ?: [];
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
                    'columns' => [],
                    'rows'    => [],
                    'total'   => 0,
                    'message' => 'Chưa cấu hình liên kết Google Sheet'
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $columns = json_decode($config['columns_json'] ?? '[]', true) ?: [];
            $keyword = trim($_GET['search'] ?? '');

            $rowsStmt = $db->prepare("SELECT row_index, row_data_json FROM google_sheet_rows WHERE config_id = :cid ORDER BY row_index ASC");
            $rowsStmt->execute([':cid' => $config['id']]);
            $rawRows = $rowsStmt->fetchAll();

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
                'columns'        => $columns,
                'rows'           => $parsedRows,
                'total'          => count($parsedRows),
                'total_all'      => count($rawRows),
                'last_synced_at' => $config['last_synced_at'],
                'sheet_name'     => $config['sheet_name']
            ], JSON_UNESCAPED_UNICODE);
            break;

        // --------------------------------------------------------
        // 3. LƯU CẤU HÌNH LIÊN KẾT GOOGLE SHEET (ADMIN ONLY)
        // --------------------------------------------------------
        case 'save_config':
            if (!$isAdmin) {
                echo json_encode(['success' => false, 'message' => 'Chỉ Admin mới có quyền thay đổi cấu hình'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $sheetUrl = trim($_POST['sheet_url'] ?? '');
            $scriptUrl = trim($_POST['script_url'] ?? '');
            $sheetName = trim($_POST['sheet_name'] ?? 'Kho Dữ Liệu');

            if (empty($scriptUrl)) {
                echo json_encode(['success' => false, 'message' => 'Vui lòng nhập URL Google Apps Script Web App'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            if (!filter_var($scriptUrl, FILTER_VALIDATE_URL)) {
                echo json_encode(['success' => false, 'message' => 'URL Apps Script không đúng định dạng'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $checkConfig = $db->query("SELECT id FROM google_sheet_configs ORDER BY id DESC LIMIT 1")->fetch();
            if ($checkConfig) {
                $stmt = $db->prepare("
                    UPDATE google_sheet_configs 
                    SET sheet_url = :s_url, script_url = :sc_url, sheet_name = :s_name, updated_at = NOW() 
                    WHERE id = :id
                ");
                $stmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $sheetName,
                    ':id'     => $checkConfig['id']
                ]);
                $configId = $checkConfig['id'];
            } else {
                $stmt = $db->prepare("
                    INSERT INTO google_sheet_configs (sheet_url, script_url, sheet_name, columns_json, created_at, updated_at)
                    VALUES (:s_url, :sc_url, :s_name, '[]', NOW(), NOW())
                ");
                $stmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $sheetName
                ]);
                $configId = $db->lastInsertId();
            }

            echo json_encode([
                'success'   => true,
                'message'   => 'Lưu cấu hình Google Sheet thành công',
                'config_id' => $configId
            ], JSON_UNESCAPED_UNICODE);
            break;

        // --------------------------------------------------------
        // 4. ĐỒNG BỘ THỦ CÔNG TỪ GOOGLE APPS SCRIPT (ADMIN ONLY)
        // --------------------------------------------------------
        case 'sync':
            if (!$isAdmin) {
                echo json_encode(['success' => false, 'message' => 'Chỉ Admin mới có quyền thực hiện đồng bộ'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            $stmt = $db->query("SELECT * FROM google_sheet_configs ORDER BY id DESC LIMIT 1");
            $config = $stmt->fetch();

            $scriptUrl = trim($_POST['script_url'] ?? ($config['script_url'] ?? ''));
            $sheetUrl  = trim($_POST['sheet_url'] ?? ($config['sheet_url'] ?? ''));

            if (empty($scriptUrl)) {
                echo json_encode(['success' => false, 'message' => 'Chưa có URL Google Apps Script để đồng bộ'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // Gọi sang Google Apps Script với Follow Location (302 redirect)
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $scriptUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 25);
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

            $headers = $gasData['headers'] ?? [];
            $rows = $gasData['data'] ?? [];
            $sheetName = $gasData['sheet_name'] ?? ($config['sheet_name'] ?? 'Sheet1');
            $checksum = $gasData['checksum'] ?? md5(json_encode($rows));

            if (empty($headers)) {
                echo json_encode(['success' => false, 'message' => 'Bảng tính không có cột nào hợp lệ ở dòng đầu tiên'], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // Bắt đầu giao dịch lưu trữ CSDL
            $db->beginTransaction();

            if ($config) {
                $updStmt = $db->prepare("
                    UPDATE google_sheet_configs 
                    SET sheet_url = :s_url, script_url = :sc_url, sheet_name = :s_name,
                        columns_json = :cols, checksum = :csum, last_synced_at = NOW(),
                        synced_by_user_id = :uid, updated_at = NOW()
                    WHERE id = :id
                ");
                $updStmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $sheetName,
                    ':cols'   => json_encode($headers, JSON_UNESCAPED_UNICODE),
                    ':csum'   => $checksum,
                    ':uid'    => $userId,
                    ':id'     => $config['id']
                ]);
                $configId = $config['id'];
            } else {
                $insStmt = $db->prepare("
                    INSERT INTO google_sheet_configs 
                    (sheet_url, script_url, sheet_name, columns_json, checksum, last_synced_at, synced_by_user_id, created_at, updated_at)
                    VALUES (:s_url, :sc_url, :s_name, :cols, :csum, NOW(), :uid, NOW(), NOW())
                ");
                $insStmt->execute([
                    ':s_url'  => $sheetUrl,
                    ':sc_url' => $scriptUrl,
                    ':s_name' => $sheetName,
                    ':cols'   => json_encode($headers, JSON_UNESCAPED_UNICODE),
                    ':csum'   => $checksum,
                    ':uid'    => $userId
                ]);
                $configId = $db->lastInsertId();
            }

            // Xóa dữ liệu cũ của config này và nạp toàn bộ dòng mới
            $delStmt = $db->prepare("DELETE FROM google_sheet_rows WHERE config_id = :cid");
            $delStmt->execute([':cid' => $configId]);

            $insertRowStmt = $db->prepare("
                INSERT INTO google_sheet_rows (config_id, row_index, row_data_json, created_at)
                VALUES (:cid, :idx, :data, NOW())
            ");

            $rowIndex = 1;
            foreach ($rows as $row) {
                $insertRowStmt->execute([
                    ':cid'  => $configId,
                    ':idx'  => $rowIndex++,
                    ':data' => json_encode($row, JSON_UNESCAPED_UNICODE)
                ]);
            }

            $db->commit();

            echo json_encode([
                'success'        => true,
                'message'        => 'Đồng bộ dữ liệu từ Google Sheet thành công',
                'sheet_name'     => $sheetName,
                'total_rows'     => count($rows),
                'columns'        => $headers,
                'checksum'       => $checksum,
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
