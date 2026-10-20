<?php
/**
 * OMNICHANNEL CHAT SYSTEM - DATABASE CONNECTION (PDO)
 * Đọc từ biến môi trường (.env) an toàn qua hàm env()
 */

require_once __DIR__ . '/constants.php';

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            // Lấy từ biến môi trường đã được hàm env() xử lý an toàn
            $host = env('DB_HOST', '');
            $db   = env('DB_NAME', '');
            $user = env('DB_USER', '');
            $pass = env('DB_PASS', '');
            $port = env('DB_PORT', 3306);

            // Nếu DB_HOST rỗng, kiểm tra thêm trong db_config.php nếu có
            if (empty($host) && file_exists(__DIR__ . '/db_config.php')) {
                require_once __DIR__ . '/db_config.php';
                if (defined('IF_DB_HOST') && !empty(IF_DB_HOST)) {
                    $host = IF_DB_HOST;
                    $db   = IF_DB_NAME;
                    $user = IF_DB_USER;
                    $pass = IF_DB_PASS;
                    $port = defined('IF_DB_PORT') ? IF_DB_PORT : 3306;
                }
            }

            // Mặc định fallback nếu vẫn rỗng
            if (empty($host)) {
                $host = '127.0.0.1';
                $db   = 'omnichannel_chat';
                $user = 'root';
                $pass = '';
            }

            $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
                @self::$instance->exec("SET time_zone = '+07:00'");
            } catch (PDOException $e) {
                $isApi = (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false);
                $errorMsg = "Không thể kết nối Cơ sở Dữ liệu: " . $e->getMessage();
                
                if ($isApi) {
                    jsonResponse(false, ['error' => $errorMsg, 'host' => $host, 'db' => $db], 'Database Connection Error', 500);
                } else {
                    $envPath = dirname(__DIR__) . '/.env';
                    $hasEnv = file_exists($envPath) ? "Đã tìm thấy (.env tồn tại trên hosting)" : "Không tìm thấy (chưa có file .env trên hosting)";
                    
                    die("<div style='font-family:sans-serif;padding:30px;max-width:650px;margin:50px auto;border:2px solid #ef4444;border-radius:10px;background:#fef2f2;color:#991b1b;'>
                        <h2 style='margin-top:0'>Lỗi Kết nối Cơ sở Dữ liệu (MySQL)</h2>
                        <p><strong>Chi tiết lỗi:</strong> " . htmlspecialchars($e->getMessage()) . "</p>
                        <div style='background:#fee2e2;border:1px solid #fca5a5;padding:12px;border-radius:6px;font-size:13px;margin:15px 0;'>
                            <div><strong>Trạng thái file .env:</strong> $hasEnv</div>
                            <div><strong>Host đang kết nối:</strong> <code>" . htmlspecialchars($host) . "</code></div>
                            <div><strong>CSDL:</strong> <code>" . htmlspecialchars($db) . "</code> | <strong>User:</strong> <code>" . htmlspecialchars($user) . "</code></div>
                        </div>
                        <p style='font-size:13px;line-height:1.5;'>
                            <strong>Nguyên nhân 'Connection refused':</strong><br>
                            Khi host hiển thị là <code>127.0.0.1</code> hoặc rỗng, tức là hosting InfinityFree chưa đọc được thông số MySQL từ file <code>.env</code>.
                            Trên InfinityFree, MySQL đặt tại <code>sql310.infinityfree.com</code> (không phải 127.0.0.1).
                        </p>
                    </div>");
                }
            }
        }
        return self::$instance;
    }
}
