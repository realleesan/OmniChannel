-- ========================================================
-- OMNICHANNEL CHAT SYSTEM - DATABASE SCHEMA & SEED DATA
-- Tương thích: MySQL 5.7+ / MySQL 8.x / MariaDB / InfinityFree
-- Bộ mã: UTF-8 Unicode (utf8mb4_unicode_ci)
-- ========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ========================================================
-- BƯỚC 1: XÓA CÁC BẢNG THEO THỨ TỰ BẢNG CON TRƯỚC, BẢNG CHA SAU
-- (Tránh hoàn toàn lỗi #1451 Cannot delete or update a parent row trên phpMyAdmin)
-- ========================================================
DROP TABLE IF EXISTS conversation_labels;
DROP TABLE IF EXISTS labels;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS customer_profiles;
DROP TABLE IF EXISTS templates;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

-- ========================================================
-- BƯỚC 2: KHỞI TẠO CẤU TRÚC BẢNG HỆ THỐNG
-- ========================================================

-- 1. Bảng nhân viên tư vấn (Hỗ trợ phân quyền ca trực và chia tải)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    fullname VARCHAR(100) NOT NULL,
    avatar VARCHAR(255) DEFAULT 'default_avatar.png',
    status ENUM('ONLINE', 'OFFLINE') DEFAULT 'OFFLINE',
    last_active_at TIMESTAMP NULL DEFAULT NULL,
    current_chat_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng sản phẩm (Nguồn dữ liệu điền vào template biến động)
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
CREATE TABLE conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channel ENUM('WEBCHAT', 'FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK') NOT NULL,
    external_sender_id VARCHAR(100) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    sender_avatar VARCHAR(255) DEFAULT NULL,
    assigned_user_id INT NULL,
    status ENUM('UNREPLIED', 'CHATTING', 'CLOSED') DEFAULT 'UNREPLIED',
    is_read TINYINT(1) DEFAULT 0,
    customer_seen TINYINT(1) DEFAULT 0,
    tag ENUM('DANG_TU_VAN', 'DA_CHOT', 'CHO_CHUYEN_KHOAN', 'BOOM_HANG') NULL DEFAULT NULL,
    last_message TEXT NULL,
    last_sender_type ENUM('CUSTOMER', 'STAFF') DEFAULT 'CUSTOMER',
    last_message_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng tin nhắn chi tiết
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
CREATE TABLE templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shortcut VARCHAR(50) NOT NULL UNIQUE, -- Ví dụ: /1, /size, /sp, [id]
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL, -- Chứa placeholder như [ten_sp], [ma_sp], [gia], [sản phẩm]
    variables_json TEXT NULL, -- Danh sách biến JSON: ["sản phẩm", "id", "giá"]
    sheet_name VARCHAR(100) NULL DEFAULT NULL, -- Tên trang tính Google Sheet liên kết (NULL nếu dùng chung hoặc mẫu tĩnh)
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5.1. Bảng cấu hình kết nối Google Sheet
CREATE TABLE IF NOT EXISTS google_sheet_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sheet_url TEXT NULL,
    script_url TEXT NOT NULL,
    sheet_name VARCHAR(100) DEFAULT 'Sheet1',
    columns_json TEXT NOT NULL,
    sheets_json LONGTEXT NULL, -- JSON danh sách toàn bộ các trang tính: [{name, columns, count}]
    checksum VARCHAR(64) DEFAULT NULL,
    last_synced_at DATETIME DEFAULT NULL,
    synced_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (synced_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5.2. Bảng lưu trữ các dòng dữ liệu Google Sheet (Snapshot)
CREATE TABLE IF NOT EXISTS google_sheet_rows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    sheet_name VARCHAR(100) DEFAULT 'Sheet1', -- Tên trang tính của dòng dữ liệu
    row_index INT NOT NULL,
    row_data_json LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_config_sheet (config_id, sheet_name),
    FOREIGN KEY (config_id) REFERENCES google_sheet_configs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bảng thẻ hồ sơ khách hàng (Phục vụ Agent bóc tách và cảnh báo rủi ro)
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

-- 7. Bảng nhãn phân loại hội thoại tùy biến (Custom Labels)
CREATE TABLE labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#3B82F6',
    icon VARCHAR(50) DEFAULT 'fa-solid fa-tag',
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Bảng liên kết hội thoại và nhãn (Conversation Labels)
CREATE TABLE conversation_labels (
    conversation_id INT NOT NULL,
    label_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, label_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ========================================================
-- KHỞI TẠO TÀI KHOẢN QUẢN TRỊ & NHÂN SỰ
-- ========================================================
-- admin: admin123 | nv1: 123456 | nv2: 123456
INSERT INTO users (id, username, password, fullname, avatar, status, current_chat_count) VALUES
(1, 'admin', '$2y$10$lbYfEQEySZDYVHIWqWC/n..SQ/TpTBMgd7kdtkdsBrwmw2aMPLptG', 'Quản trị viên', 'default_avatar.png', 'ONLINE', 0),
(2, 'nv1', '$2y$10$WanQ/dHJ8jTGKgPDdnrcauGlde3FvMb05IcE7XcKV/C9ihdiyuu/S', 'Nguyễn Văn Quân', 'quan.png', 'ONLINE', 0),
(3, 'nv2', '$2y$10$WanQ/dHJ8jTGKgPDdnrcauGlde3FvMb05IcE7XcKV/C9ihdiyuu/S', 'Trần Thị Phương', 'phuong.png', 'ONLINE', 0);

-- ========================================================
-- KHỞI TẠO DANH MỤC SẢN PHẨM MẪU (PHỤC VỤ BIẾN ĐỘNG TEMPLATE)
-- ========================================================
INSERT INTO products (id, product_code, name, price, stock_status) VALUES
(1, 'SP01', 'Áo Thun Oversize Cotton 100%', 189000, 'CÒN HÀNG'),
(2, 'SP02', 'Quần Jeans Slimfit Co Giãn', 320000, 'CÒN HÀNG'),
(3, 'SP03', 'Áo Khoác Bomber Kaki 2 Lớp', 450000, 'CÒN HÀNG');

-- ========================================================
-- KHỞI TẠO MẪU CÂU TRẢ LỜI NHANH (CANNED RESPONSES)
-- ========================================================
INSERT INTO templates (id, shortcut, title, content, created_by_user_id) VALUES
(1, '/chao', 'Lời chào khách hàng', 'Dạ em chào anh/chị ạ! Em có thể hỗ trợ gì cho mình hôm nay ạ?', 1),
(2, '/size', 'Tư vấn bảng size', 'Dạ bảng size chuẩn bên em: Size S (45-53kg), Size M (54-62kg), Size L (63-70kg), Size XL (71-80kg). Anh/chị cho em xin chiều cao và cân nặng để em tư vấn chuẩn nhất nha!', 1),
(3, '/sp', 'Thông tin sản phẩm & giá', 'Dạ sản phẩm [ten_sp] (Mã: [ma_sp]) hiện đang có giá ưu đãi là [gia] ạ! Shop đang sẵn hàng gửi ngay trong ngày ạ.', 1),
(4, '/stk', 'Thông tin chuyển khoản', 'Dạ thông tin thanh toán của bên em: Ngân hàng MB Bank - STK: 0987654321 - Chủ TK: OMNICHANNEL STORE. Nội dung: [ma_sp] + SĐT của anh/chị ạ.', 1),
(5, '/ship', 'Chính sách vận chuyển & Freeship', 'Dạ bên em hỗ trợ Freeship cho đơn từ 2 sản phẩm trở lên, hoặc đơn thanh toán chuyển khoản trước ạ!', 1);

-- ========================================================
-- KHỞI TẠO NHÃN PHÂN LOẠI MẪU (CHUẨN RESPOND.IO MOCKUP)
-- ========================================================
INSERT INTO labels (id, name, color, icon) VALUES
(1, 'New Lead', '#2563EB', 'fa-solid fa-bolt'),
(2, 'Cần tư vấn', '#F59E0B', 'fa-solid fa-comments'),
(3, 'Đã chốt đơn', '#10B981', 'fa-solid fa-check'),
(4, 'Chờ thanh toán', '#8B5CF6', 'fa-solid fa-credit-card'),
(5, 'Cảnh báo rủi ro', '#EF4444', 'fa-solid fa-triangle-exclamation');

