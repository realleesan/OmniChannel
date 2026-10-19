<?php
/**
 * OMNICHANNEL CHAT SYSTEM - DATABASE MIGRATION SCRIPT
 * Tự động khởi tạo cấu trúc 6 bảng và dữ liệu mẫu trên Hosting InfinityFree
 * Truy cập qua trình duyệt: https://your-domain/migrate.php
 */

require_once __DIR__ . '/config/constants.php';

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Khởi Tạo Cơ Sở Dữ Liệu - Omnichannel CRM</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0F172A;
            color: #F8FAFC;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .migrate-box {
            background: #1E293B;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 30px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        }
        .migrate-title {
            font-size: 20px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
            color: #6366F1;
        }
        .log-item {
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            margin-bottom: 8px;
            font-family: monospace;
        }
        .log-success { background: #064E3B; color: #6EE7B7; border: 1px solid #059669; }
        .log-info { background: #1E3A8A; color: #93C5FD; border: 1px solid #2563EB; }
        .log-error { background: #7F1D1D; color: #FCA5A5; border: 1px solid #DC2626; }
        .btn-action {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #4F46E5;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            margin-top: 16px;
            border: none;
            cursor: pointer;
        }
        .btn-action:hover { background: #4338CA; }
    </style>
</head>
<body>

<div class="migrate-box">
    <div class="migrate-title">
        <i class="fa-solid fa-database"></i> Khởi Tạo Cơ Sở Dữ Liệu
    </div>
    <p style="font-size:13px;color:#94A3B8;margin-bottom:20px;">
        Hệ thống tự động thực thi <code>database.sql</code> nạp vào MySQL trên máy chủ Hosting.
    </p>

    <?php
    $host = getenv('DB_HOST') ?: 'localhost';
    $db   = getenv('DB_NAME') ?: '';
    $user = getenv('DB_USER') ?: '';
    $pass = (getenv('DB_PASS') !== false) ? getenv('DB_PASS') : '';
    $port = getenv('DB_PORT') ?: 3306;

    echo "<div class='log-item log-info'><i class='fa-solid fa-server'></i> Máy chủ: $host | CSDL: $db | Người dùng: $user</div>";

    if (empty($db) || empty($user)) {
        echo "<div class='log-item log-error'><i class='fa-solid fa-triangle-exclamation'></i> Lỗi: Thiếu thông tin DB_NAME hoặc DB_USER trong file .env</div>";
        exit;
    }

    try {
        $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ]);
        echo "<div class='log-item log-success'><i class='fa-solid fa-circle-check'></i> Kết nối MySQL thành công!</div>";

        $sqlContent = '';
        $sqlPath = __DIR__ . '/database.sql';
        if (file_exists($sqlPath)) {
            $sqlContent = file_get_contents($sqlPath);
        } else {
            // Schema dự phòng nạp trực tiếp nếu database.sql bị chặn bởi ftpignore
            $sqlContent = <<<SQL
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    fullname VARCHAR(100) NOT NULL,
    avatar VARCHAR(255) DEFAULT 'default_avatar.png',
    status ENUM('ONLINE', 'OFFLINE') DEFAULT 'OFFLINE',
    current_chat_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS products;
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(255),
    stock_status VARCHAR(50) DEFAULT 'CÒN HÀNG',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS conversations;
CREATE TABLE conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channel ENUM('WEBCHAT', 'FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK') NOT NULL,
    external_sender_id VARCHAR(100) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    sender_avatar VARCHAR(255) DEFAULT NULL,
    assigned_user_id INT NULL,
    status ENUM('UNREPLIED', 'CHATTING', 'CLOSED') DEFAULT 'UNREPLIED',
    tag ENUM('DANG_TU_VAN', 'DA_CHOT', 'CHO_CHUYEN_KHOAN', 'BOOM_HANG') DEFAULT 'DANG_TU_VAN',
    last_message TEXT NULL,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS messages;
CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_type ENUM('CUSTOMER', 'STAFF') NOT NULL,
    sender_id INT NULL,
    content TEXT NOT NULL,
    attachment_url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS templates;
CREATE TABLE templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shortcut VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS customer_profiles;
CREATE TABLE customer_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL UNIQUE,
    customer_name VARCHAR(100) NOT NULL,
    preferred_size VARCHAR(50) DEFAULT 'Chưa xác định',
    recent_purchases TEXT NULL,
    is_boom_risk TINYINT(1) DEFAULT 0,
    boom_note VARCHAR(255) DEFAULT NULL,
    scan_version INT DEFAULT 1,
    last_scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO users (id, username, password, fullname, avatar, status, current_chat_count) VALUES
(1, 'nv1', '$2y$10$4.6yM3aJgW3Qf.23bS/aQOuW0cQ5f7jKGeJq7P1yP2lZ0X1yO.X2K', 'Nguyễn Văn Quân', 'quan.png', 'ONLINE', 0),
(2, 'nv2', '$2y$10$4.6yM3aJgW3Qf.23bS/aQOuW0cQ5f7jKGeJq7P1yP2lZ0X1yO.X2K', 'Trần Thị Phương', 'phuong.png', 'ONLINE', 1);

INSERT INTO products (id, product_code, name, price, image_url, stock_status) VALUES
(1, 'SP01', 'Váy Dạ Tweed Cao Cấp', 350000.00, 'vay_da_tweed.jpg', 'CÒN HÀNG (Size S, M, L)'),
(2, 'SP02', 'Áo Blazer Hàn Quốc Form Rộng', 420000.00, 'blazer_hanquoc.jpg', 'CÒN HÀNG (Size M, XL)'),
(3, 'SP03', 'Chân Váy Chữ A Xếp Ly', 220000.00, 'chan_vay_a.jpg', 'SẮP HẾT HÀNG');

INSERT INTO templates (id, shortcut, title, content, created_by_user_id) VALUES
(1, '/1', 'Tư vấn Váy Dạ Tweed SP01', 'Chào bạn, mẫu [ten_sp] (Mã: [ma_sp]) hiện có giá [gia]đ. Bạn cho shop xin chiều cao và cân nặng để shop tư vấn size phù hợp nhé!', 1),
(2, '/size', 'Bảng quy đổi kích cỡ', 'Bảng kích cỡ chuẩn: Size S (40-47kg), Size M (48-54kg), Size L (55-60kg). Bạn thường mặc size nào để shop tư vấn kỹ hơn ạ?', 1),
(3, '/stk', 'Thông tin chuyển khoản', 'Thông tin tài khoản xác nhận đơn: MB Bank - 999988886666 - NGUYEN VAN QUAN. Cú pháp: [ma_sp] + Số điện thoại.', 1);

INSERT INTO conversations (id, channel, external_sender_id, sender_name, sender_avatar, assigned_user_id, status, tag, last_message, last_message_at) VALUES
(1, 'FACEBOOK', 'fb_khach_01', 'Đỗ Thùy Trang', NULL, 2, 'CHATTING', 'DANG_TU_VAN', 'Giao hỏa tốc ra Cầu Giấy trong chiều nay được không shop?', NOW() - INTERVAL 10 MINUTE);

INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, created_at) VALUES
(1, 1, 'CUSTOMER', NULL, 'Shop ơi áo blazer mã SP02 còn màu be không?', NOW() - INTERVAL 12 MINUTE),
(2, 1, 'STAFF', 2, 'Chào bạn Trang, shop còn sẵn màu be size M nha!', NOW() - INTERVAL 11 MINUTE),
(3, 1, 'CUSTOMER', NULL, 'Giao hỏa tốc ra Cầu Giấy trong chiều nay được không shop?', NOW() - INTERVAL 10 MINUTE);

INSERT INTO customer_profiles (id, conversation_id, customer_name, preferred_size, recent_purchases, is_boom_risk, boom_note, scan_version) VALUES
(1, 1, 'Đỗ Thùy Trang', 'Size M', 'Áo sơ mi lụa (Đã giao thành công)', 0, NULL, 1);
SQL;
        }

        // Chia nhỏ các câu lệnh SQL để thực thi an toàn
        $queries = array_filter(array_map('trim', explode(';', $sqlContent)));
        $executed = 0;

        foreach ($queries as $q) {
            if (!empty($q)) {
                $pdo->exec($q);
                $executed++;
            }
        }

        echo "<div class='log-item log-success'><i class='fa-solid fa-circle-check'></i> Đã khởi tạo thành công toàn bộ 6 bảng và nạp dữ liệu mẫu ban đầu ($executed câu lệnh)!</div>";
        echo "<div style='margin-top:20px;'>
            <a href='index.php' class='btn-action'>
                <i class='fa-solid fa-arrow-right'></i> Mở Trang Đăng Nhập Hệ Thống
            </a>
        </div>";

    } catch (PDOException $e) {
        echo "<div class='log-item log-error'><i class='fa-solid fa-circle-xmark'></i> Lỗi kết nối hoặc khởi tạo: " . htmlspecialchars($e->getMessage()) . "</div>";
        echo "<p style='font-size:12px;color:#94A3B8;margin-top:14px;'>
            Gợi ý: Nếu gặp lỗi máy chủ không phân giải được hostname, hãy kiểm tra lại file <code>.env</code> hoặc dùng tính năng <b>Import</b> trực tiếp file <code>database.sql</code> trong phpMyAdmin trên cPanel.
        </p>";
    }
    ?>
</div>

</body>
</html>
