-- ========================================================
-- OMNICHANNEL CHAT SYSTEM - DATABASE SCHEMA & SEED DATA
-- Tương thích: MySQL 5.7+ / MySQL 8.x / MariaDB / InfinityFree
-- Bộ mã: UTF-8 Unicode (utf8mb4_unicode_ci)
-- ========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Bảng nhân viên tư vấn (Hỗ trợ phân quyền ca trực và chia tải)
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

-- 2. Bảng sản phẩm (Nguồn dữ liệu điền vào template biến động)
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

-- 3. Bảng cuộc trò chuyện (Hội thoại đa kênh)
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

-- 4. Bảng tin nhắn chi tiết
DROP TABLE IF EXISTS messages;
CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_type ENUM('CUSTOMER', 'STAFF') NOT NULL,
    sender_id INT NULL, -- NULL nếu là khách, user_id nếu là nhân viên
    content TEXT NOT NULL,
    attachment_url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bảng mẫu tin nhắn nhanh (Templates hỗ trợ phím tắt và biến động)
DROP TABLE IF EXISTS templates;
CREATE TABLE templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shortcut VARCHAR(20) NOT NULL UNIQUE, -- Ví dụ: /1, /size, /stk
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL, -- Chứa placeholder như [ten_sp], [ma_sp], [gia]
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bảng thẻ hồ sơ khách hàng (Phục vụ Agent bóc tách và cảnh báo rủi ro)
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

-- ========================================================
-- SEED DATA MẪU (PHỤC VỤ KỊCH BẢN DEMO THUYẾT TRÌNH)
-- ========================================================

-- Nạp 2 nhân viên tư vấn ban đầu (Mật khẩu: 123456)
INSERT INTO users (id, username, password, fullname, avatar, status, current_chat_count) VALUES
(1, 'nv1', '$2y$10$4.6yM3aJgW3Qf.23bS/aQOuW0cQ5f7jKGeJq7P1yP2lZ0X1yO.X2K', 'Nguyễn Văn Quân', 'quan.png', 'ONLINE', 0),
(2, 'nv2', '$2y$10$4.6yM3aJgW3Qf.23bS/aQOuW0cQ5f7jKGeJq7P1yP2lZ0X1yO.X2K', 'Trần Thị Phương', 'phuong.png', 'ONLINE', 1);
-- Ghi chú: Mật khẩu hash trên tương ứng với chuỗi '123456'

-- Nạp sản phẩm mẫu cho shop thời trang
INSERT INTO products (id, product_code, name, price, image_url, stock_status) VALUES
(1, 'SP01', 'Váy Dạ Tweed Cao Cấp', 350000.00, 'vay_da_tweed.jpg', 'CÒN HÀNG (Size S, M, L)'),
(2, 'SP02', 'Áo Blazer Hàn Quốc Form Rộng', 420000.00, 'blazer_hanquoc.jpg', 'CÒN HÀNG (Size M, XL)'),
(3, 'SP03', 'Chân Váy Chữ A Xếp Ly', 220000.00, 'chan_vay_a.jpg', 'SẮP HẾT HÀNG');

-- Nạp mẫu tin nhắn nhanh (Templates)
INSERT INTO templates (id, shortcut, title, content, created_by_user_id) VALUES
(1, '/1', 'Tư vấn Váy Dạ Tweed SP01', 'Chào bạn, mẫu [ten_sp] (Mã: [ma_sp]) hiện có giá [gia]đ. Bạn cho shop xin chiều cao và cân nặng để shop chọn size vừa xinh cho bạn nhé!', 1),
(2, '/size', 'Bảng quy đổi kích cỡ', 'Dạ bảng size bên shop: Size S (40-47kg), Size M (48-54kg), Size L (55-60kg). Bạn mặc size nào vừa ạ?', 1),
(3, '/stk', 'Thông tin chuyển khoản', 'Dạ shop gửi bạn STK xác nhận đơn: MB Bank - 999988886666 - NGUYEN VAN QUAN. Nội dung CK: [ma_sp] + SĐT bạn nhé!', 1);

-- Nạp hội thoại ban đầu để phân phối tải (Phương NV2 đang giữ 1 khách)
INSERT INTO conversations (id, channel, external_sender_id, sender_name, sender_avatar, assigned_user_id, status, tag, last_message, last_message_at) VALUES
(1, 'FACEBOOK', 'fb_khach_01', 'Đỗ Thùy Trang', NULL, 2, 'CHATTING', 'DANG_TU_VAN', 'Giao hỏa tốc ra Cầu Giấy trong chiều nay được không shop?', NOW() - INTERVAL 10 MINUTE);

INSERT INTO messages (id, conversation_id, sender_type, sender_id, content, created_at) VALUES
(1, 1, 'CUSTOMER', NULL, 'Shop ơi áo blazer mã SP02 còn màu be không?', NOW() - INTERVAL 12 MINUTE),
(2, 1, 'STAFF', 2, 'Chào bạn Trang, shop còn sẵn màu be size M nha!', NOW() - INTERVAL 11 MINUTE),
(3, 1, 'CUSTOMER', NULL, 'Giao hỏa tốc ra Cầu Giấy trong chiều nay được không shop?', NOW() - INTERVAL 10 MINUTE);

INSERT INTO customer_profiles (id, conversation_id, customer_name, preferred_size, recent_purchases, is_boom_risk, boom_note, scan_version) VALUES
(1, 1, 'Đỗ Thùy Trang', 'Size M', 'Áo sơ mi lụa (Đã giao thành công)', 0, NULL, 1);
