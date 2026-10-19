<?php
/**
 * OMNICHANNEL CHAT SYSTEM - DATABASE CONNECTION (PDO)
 * Tự động nhận diện môi trường Localhost (XAMPP/WAMP) hoặc Hosting InfinityFree
 */

require_once __DIR__ . '/constants.php';

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            // Xác định xem đang chạy trên InfinityFree hay Localhost
            $serverName = $_SERVER['SERVER_NAME'] ?? 'localhost';
            $isInfinityFree = (
                strpos($serverName, 'epizy.com') !== false || 
                strpos($serverName, 'infinityfreeapp.com') !== false
            );

            // Nếu có file cấu hình riêng db_config.php và không phải mật khẩu mặc định
            if (file_exists(__DIR__ . '/db_config.php')) {
                require_once __DIR__ . '/db_config.php';
            }

            if (defined('IF_DB_HOST') && IF_DB_PASS !== 'your_vpanel_password') {
                $host = IF_DB_HOST;
                $db   = IF_DB_NAME;
                $user = IF_DB_USER;
                $pass = IF_DB_PASS;
                $port = 3306;
            } elseif ($isInfinityFree) {
                // Cấu hình từ biến môi trường hoặc mặc định InfinityFree
                $host     = getenv('DB_HOST') ?: (defined('IF_DB_HOST') ? IF_DB_HOST : 'sql300.infinityfree.com');
                $db       = getenv('DB_NAME') ?: (defined('IF_DB_NAME') ? IF_DB_NAME : 'epiz_38000000_omnichannel');
                $user     = getenv('DB_USER') ?: (defined('IF_DB_USER') ? IF_DB_USER : 'epiz_38000000');
                $pass     = getenv('DB_PASS') ?: (defined('IF_DB_PASS') ? IF_DB_PASS : '');
                $port     = 3306;
            } else {
                $host     = getenv('DB_HOST') ?: '127.0.0.1';
                $db       = getenv('DB_NAME') ?: 'omnichannel_chat';
                $user     = getenv('DB_USER') ?: 'root';
                $pass     = getenv('DB_PASS') ?: '';
                $port     = getenv('DB_PORT') ?: 3306;
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
            } catch (PDOException $e) {
                // Báo lỗi rõ ràng dạng JSON nếu đang gọi qua API hoặc hiển thị trang báo lỗi thân thiện
                $isApi = (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false);
                $errorMsg = "Không thể kết nối Cơ sở Dữ liệu: " . $e->getMessage();
                
                if ($isApi) {
                    jsonResponse(false, ['error' => $errorMsg], 'Database Connection Error', 500);
                } else {
                    die("<div style='font-family:sans-serif;padding:30px;max-width:600px;margin:50px auto;border:2px solid #ef4444;border-radius:10px;background:#fef2f2;color:#991b1b;'>
                        <h2 style='margin-top:0'>⚠️ Lỗi Kết nối Cơ sở Dữ liệu (MySQL)</h2>
                        <p><strong>Chi tiết lỗi:</strong> " . htmlspecialchars($e->getMessage()) . "</p>
                        <hr style='border:none;border-top:1px solid #fca5a5;margin:15px 0;'>
                        <p><strong>Hướng dẫn khắc phục:</strong></p>
                        <ol>
                            <li>Nếu chạy Local: Hãy mở XAMPP và bật <b>MySQL</b>, sau đó tạo CSDL tên <code>omnichannel_chat</code> và nạp file <code>database.sql</code>.</li>
                            <li>Nếu chạy trên InfinityFree: Mở file <code>config/database.php</code> và cập nhật chính xác <b>DB_HOST, DB_NAME, DB_USER, DB_PASS</b> theo thông số trong cPanel.</li>
                        </ol>
                    </div>");
                }
            }
        }
        return self::$instance;
    }
}
