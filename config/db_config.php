<?php
/**
 * THÔNG TIN KẾT NỐI CƠ SỞ DỮ LIỆU
 * Đọc 100% từ biến môi trường (.env), TUYỆT ĐỐI KHÔNG HARDCODE MẬT KHẨU
 */

define('IF_DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('IF_DB_NAME', getenv('DB_NAME') ?: '');
define('IF_DB_USER', getenv('DB_USER') ?: '');
define('IF_DB_PASS', getenv('DB_PASS') ?: '');
define('IF_DB_PORT', getenv('DB_PORT') ?: 3306);
