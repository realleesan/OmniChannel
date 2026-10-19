<?php
/**
 * OMNICHANNEL CHAT SYSTEM - SYSTEM CONSTANTS & CONFIGURATION
 */

// Bắt đầu session nếu chưa có
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Thiết lập múi giờ Việt Nam
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Đường dẫn URL gốc hệ thống
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scriptDir = dirname($_SERVER['SCRIPT_NAME'] ?? '');
$scriptDir = str_replace('\\', '/', $scriptDir);
// Chuẩn hóa base url
$basePath = preg_replace('/(\/api|\/views|\/controllers|\/public).*$/', '', $scriptDir);
define('BASE_URL', rtrim($protocol . $host . $basePath, '/'));

// Cấu hình Render Webhook Gateway URL (nơi tiếp nhận Webhook ngoài)
define('RENDER_GATEWAY_URL', getenv('RENDER_GATEWAY_URL') ?: 'https://omnichannel-webhook-gateway.onrender.com');
define('GATEWAY_SECRET_KEY', getenv('GATEWAY_SECRET_KEY') ?: 'omnichannel_secret_ba_2026');

// Định nghĩa các kênh hỗ trợ
define('CHANNELS', [
    'WEBCHAT'  => ['name' => 'Webchat Trực Tiếp', 'icon' => '💬', 'color' => '#10B981'],
    'FACEBOOK' => ['name' => 'Facebook Messenger', 'icon' => '📘', 'color' => '#1877F2'],
    'ZALO'     => ['name' => 'Zalo Chat',         'icon' => '🔵', 'color' => '#0068FF'],
    'SHOPEE'   => ['name' => 'Shopee Chat',        'icon' => '🟠', 'color' => '#EE4D2D'],
    'TIKTOK'   => ['name' => 'TikTok Shop',        'icon' => '⚫', 'color' => '#000000']
]);

// Định nghĩa các nhãn trạng thái hội thoại
define('TAGS', [
    'DANG_TU_VAN'      => ['label' => 'Đang tư vấn',       'color' => '#10B981', 'badge_class' => 'tag-consulting'],
    'DA_CHOT'          => ['label' => 'Đã chốt đơn',       'color' => '#3B82F6', 'badge_class' => 'tag-closed'],
    'CHO_CHUYEN_KHOAN' => ['label' => 'Chờ chuyển khoản',  'color' => '#F59E0B', 'badge_class' => 'tag-pending'],
    'BOOM_HANG'        => ['label' => 'Khách boom',        'color' => '#EF4444', 'badge_class' => 'tag-boom']
]);

/**
 * Trả về JSON chuẩn hóa cho các API endpoint
 */
function jsonResponse($success, $data = [], $message = '', $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success'   => $success,
        'message'   => $message,
        'data'      => $data,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Hàm format thời gian tương đối kiểu thân thiện (vd: 2 phút trước)
 */
function timeAgo($datetime) {
    if (empty($datetime)) return 'Mới đây';
    $time = strtotime($datetime);
    $diff = time() - $time;

    if ($diff < 60) {
        return 'Vừa xong';
    } elseif ($diff < 3600) {
        return floor($diff / 60) . ' phút trước';
    } elseif ($diff < 86400) {
        return floor($diff / 3600) . ' giờ trước';
    } else {
        return date('d/m H:i', $time);
    }
}

/**
 * Kiểm tra xác thực phiên đăng nhập
 */
function requireLogin() {
    if (empty($_SESSION['user_id'])) {
        header('Location: ' . BASE_URL . '/views/auth/login.php');
        exit;
    }
}
