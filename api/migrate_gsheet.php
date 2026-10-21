<?php
/**
 * MIGRATION SCRIPT: migrate_gsheet.php
 * Tự động tạo bảng google_sheet_configs, google_sheet_rows và nâng cấp bảng templates
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

try {
    $db = Database::getConnection();
    $logs = [];

    // 1. Tạo bảng google_sheet_configs
    $sql1 = "
    CREATE TABLE IF NOT EXISTS google_sheet_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sheet_url TEXT NULL,
        script_url TEXT NOT NULL,
        sheet_name VARCHAR(100) DEFAULT 'Sheet1',
        columns_json TEXT NOT NULL,
        checksum VARCHAR(64) DEFAULT NULL,
        last_synced_at DATETIME DEFAULT NULL,
        synced_by_user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_synced_by (synced_by_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $db->exec($sql1);
    $logs[] = "Tạo/kiểm tra bảng google_sheet_configs thành công";

    // 2. Tạo bảng google_sheet_rows
    $sql2 = "
    CREATE TABLE IF NOT EXISTS google_sheet_rows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_id INT NOT NULL,
        row_index INT NOT NULL,
        row_data_json LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_config_id (config_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $db->exec($sql2);
    $logs[] = "Tạo/kiểm tra bảng google_sheet_rows thành công";

    // 3. Nâng cấp bảng templates: kiểm tra và thêm cột variables_json nếu chưa có
    $stmt = $db->query("DESCRIBE templates");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (!in_array('variables_json', $columns)) {
        $db->exec("ALTER TABLE templates ADD COLUMN variables_json TEXT NULL AFTER content");
        $logs[] = "Thêm cột variables_json vào bảng templates thành công";
    } else {
        $logs[] = "Cột variables_json đã tồn tại trong bảng templates";
    }

    // 4. Kiểm tra ràng buộc UNIQUE trên shortcut của bảng templates
    $indexStmt = $db->query("SHOW INDEX FROM templates WHERE Column_name = 'shortcut'");
    $indexes = $indexStmt->fetchAll();
    $isUnique = false;
    foreach ($indexes as $idx) {
        if ($idx['Non_unique'] == 0) {
            $isUnique = true;
            break;
        }
    }

    if (!$isUnique) {
        try {
            $db->exec("ALTER TABLE templates ADD UNIQUE KEY unique_shortcut (shortcut)");
            $logs[] = "Thêm ràng buộc UNIQUE KEY trên shortcut thành công";
        } catch (Exception $ex) {
            $logs[] = "Cảnh báo UNIQUE KEY: " . $ex->getMessage();
        }
    } else {
        $logs[] = "Ràng buộc UNIQUE KEY trên shortcut đã tồn tại";
    }

    echo json_encode([
        'success' => true,
        'message' => 'Cơ sở dữ liệu đã được cập nhật thành công!',
        'logs'    => $logs
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Lỗi migration: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}
