<?php
/**
 * OMNICHANNEL CHAT SYSTEM - DATABASE CONNECTION (PDO)
 * Đọc 100% từ biến môi trường (.env) - Tuyệt đối không hardcode mật khẩu
 */

require_once __DIR__ . '/constants.php';

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            // Lấy trực tiếp từ biến môi trường được nạp từ .env
            $host = getenv('DB_HOST') ?: '127.0.0.1';
            $db   = getenv('DB_NAME') ?: 'omnichannel_chat';
            $user = getenv('DB_USER') ?: 'root';
            $pass = (getenv('DB_PASS') !== false) ? getenv('DB_PASS') : '';
            $port = getenv('DB_PORT') ?: 3306;

            $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
            } catch (PDOException $e) {
                $isApi = (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false);
                $errorMsg = "Không thể kết nối Cơ sở Dữ liệu: " . $e->getMessage();
                
                if ($isApi) {
                    jsonResponse(false, ['error' => $errorMsg], 'Database Connection Error', 500);
                } else {
                    die("<div style='font-family:sans-serif;padding:30px;max-width:600px;margin:50px auto;border:2px solid #ef4444;border-radius:10px;background:#fef2f2;color:#991b1b;'>
                        <h2 style='margin-top:0'>⚠️ Lỗi Kết nối Cơ sở Dữ liệu (MySQL)</h2>
                        <p><strong>Chi tiết lỗi:</strong> " . htmlspecialchars($e->getMessage()) . "</p>
                        <hr style='border:none;border-top:1px solid #fca5a5;margin:15px 0;'>
                        <p>Vui lòng kiểm tra lại thông số trong file <code>.env</code> (DB_HOST, DB_NAME, DB_USER, DB_PASS).</p>
                    </div>");
                }
            }
        }
        return self::$instance;
    }
}
