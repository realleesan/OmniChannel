<?php
/**
 * OMNICHANNEL CHAT SYSTEM - SYSTEM CONSTANTS & CONFIGURATION
 */

// Tắt in cảnh báo lỗi/deprecated trực tiếp ra output để không làm hỏng chuỗi JSON trên PHP 8.4
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);

// Bắt đầu session nếu chưa có
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Tự động nạp file .env nếu có ở thư mục gốc
$envFile = dirname(__DIR__) . '/.env';
if (!file_exists($envFile)) {
    $envFile = __DIR__ . '/../.env';
}

if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($envKey, $envVal) = explode('=', $line, 2);
            $envKey = trim($envKey);
            $envVal = trim($envVal, " \t\n\r\0\x0B\"'");
            
            // Nạp vào cả 3 nơi để tránh hosting chặn hàm putenv()
            if (function_exists('putenv')) {
                @putenv("{$envKey}={$envVal}");
            }
            $_ENV[$envKey] = $envVal;
            $_SERVER[$envKey] = $envVal;
        }
    }
}

/**
 * Hàm đọc biến môi trường an toàn, tương thích mọi loại hosting (kể cả khi putenv bị tắt)
 */
function env($key, $default = '') {
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
        return $_ENV[$key];
    }
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
        return $_SERVER[$key];
    }
    if (function_exists('getenv')) {
        $val = @getenv($key);
        if ($val !== false && $val !== '') {
            return $val;
        }
    }
    return $default;
}

// Thiết lập múi giờ Việt Nam
date_default_timezone_set('Asia/Ho_Chi_Minh');

$serverPort = $_SERVER['SERVER_PORT'] ?? 80;
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $serverPort == 443) ? "https://" : "http://";
$host = $_SERVER['HTTP_HOST'] ?? 'omnichannel.gt.tc';
$scriptDir = dirname($_SERVER['SCRIPT_NAME'] ?? '');
$scriptDir = str_replace('\\', '/', $scriptDir);
// Chuẩn hóa base url
$basePath = preg_replace('/(\/api|\/views|\/controllers|\/public).*$/', '', $scriptDir);
$detectedUrl = rtrim($protocol . $host . $basePath, '/');
define('BASE_URL', env('APP_URL', $detectedUrl));

// Cấu hình Render Webhook Gateway URL (nơi tiếp nhận Webhook ngoài)
define('RENDER_GATEWAY_URL', env('RENDER_GATEWAY_URL', 'https://omnichannel-gateway.onrender.com'));
define('GATEWAY_SECRET_KEY', env('GATEWAY_SECRET_KEY', 'omnichannel_secret_ba_2026'));

// Định nghĩa các kênh hỗ trợ
define('CHANNELS', [
    'WEBCHAT'  => ['name' => 'Webchat',            'icon' => 'fa-solid fa-comments',           'color' => '#10B981'],
    'FACEBOOK' => ['name' => 'Facebook Messenger', 'icon' => 'fa-brands fa-facebook-messenger', 'color' => '#1877F2'],
    'ZALO'     => ['name' => 'Zalo Chat',          'icon' => 'fa-solid fa-comment-dots',       'color' => '#0068FF'],
    'SHOPEE'   => ['name' => 'Shopee Chat',        'icon' => 'fa-solid fa-bag-shopping',       'color' => '#EE4D2D'],
    'TIKTOK'   => ['name' => 'TikTok Shop',         'icon' => 'fa-brands fa-tiktok',            'color' => '#000000']
]);

// Định nghĩa các nhãn trạng thái hội thoại
define('TAGS', [
    'DANG_TU_VAN'      => ['label' => 'Đang tư vấn',       'color' => '#10B981', 'badge_class' => 'tag-consulting'],
    'DA_CHOT'          => ['label' => 'Đã chốt đơn',       'color' => '#3B82F6', 'badge_class' => 'tag-closed'],
    'CHO_CHUYEN_KHOAN' => ['label' => 'Chờ chuyển khoản',  'color' => '#F59E0B', 'badge_class' => 'tag-pending'],
    'BOOM_HANG'        => ['label' => 'Rủi ro hoàn hàng',  'color' => '#EF4444', 'badge_class' => 'tag-boom']
]);

/**
 * Trả về JSON chuẩn hóa cho các API endpoint
 */
function jsonResponse($success, $data = [], $message = '', $statusCode = 200) {
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success'   => $success,
        'message'   => $message,
        'data'      => $data,
        'status'    => $statusCode,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Hàm format thời gian tin nhắn chuẩn các app chat lớn (Hôm nay: HH:mm, Hôm qua: HH:mm Hôm qua, Cũ hơn: HH:mm dd/mm/YYYY)
 */
function formatChatTime($datetime) {
    if (empty($datetime)) return '';
    $time = is_numeric($datetime) ? (int)$datetime : strtotime($datetime);
    if (!$time) return '';

    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $dateStr = date('Y-m-d', $time);
    $timeStr = date('H:i', $time);

    if ($dateStr === $today) {
        return $timeStr;
    } elseif ($dateStr === $yesterday) {
        return $timeStr . ' Hôm qua';
    } elseif (date('Y', $time) === date('Y')) {
        return $timeStr . ' ' . date('d/m', $time);
    } else {
        return $timeStr . ' ' . date('d/m/Y', $time);
    }
}

/**
 * Hàm format thời gian tương đối kiểu thân thiện (vd: 2 phút trước)
 */
function timeAgo($datetime) {
    if (empty($datetime)) return 'Mới đây';
    $time = is_numeric($datetime) ? (int)$datetime : strtotime($datetime);
    $diff = time() - $time;

    if ($diff < 60) {
        return 'Vừa xong';
    } elseif ($diff < 3600) {
        return floor($diff / 60) . ' phút trước';
    } elseif ($diff < 86400) {
        return floor($diff / 3600) . ' giờ trước';
    } else {
        return formatChatTime($time);
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

/**
 * Tự động tải và chuyển đổi URL ảnh từ Google Sheets / liên kết ngoài
 * thành file ảnh tĩnh vật lý lưu vĩnh viễn trên máy chủ host (public/uploads/sheet_images/xxx.jpg)
 */
function localizeMediaUrl($urlInput) {
    if (empty($urlInput)) return '';
    $urls = is_array($urlInput) ? $urlInput : explode(',', (string)$urlInput);
    $localizedList = [];

    $uploadDir = __DIR__ . '/../public/uploads/sheet_images/';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0777, true);
    }

    foreach ($urls as $rawUrl) {
        $u = trim($rawUrl);
        if (empty($u)) continue;

        // Nếu đã là link ảnh tĩnh cục bộ của hệ thống -> giữ nguyên
        if (strpos($u, '/public/uploads/') !== false) {
            $localizedList[] = $u;
            continue;
        }

        // Kiểm tra xem có phải ảnh từ Google Sheets hoặc liên kết ngoài cần lưu không
        $isGoogleSheetImg = (
            strpos($u, 'docs.google.com') !== false ||
            strpos($u, 'sheets-images') !== false ||
            strpos($u, 'googleusercontent.com') !== false ||
            strpos($u, 'drive.google.com') !== false
        );

        if (!$isGoogleSheetImg) {
            $localizedList[] = $u;
            continue;
        }

        // Sinh mã ID duy nhất theo URL hoặc ID ảnh Google Sheets
        $cacheId = md5($u);
        if (preg_match('#sheets-images-rt/([^=?/]+)#', $u, $m)) {
            $cacheId = 'gs_' . md5($m[1]);
        } else {
            $cacheId = 'img_' . md5($u);
        }

        $localFilename = $cacheId . '.jpg';
        $localFilePath = $uploadDir . $localFilename;
        $localWebUrl = rtrim(BASE_URL, '/') . '/public/uploads/sheet_images/' . $localFilename;

        // 1. Nếu file tĩnh đã tồn tại trên máy chủ và hợp lệ -> Dùng ngay
        if (file_exists($localFilePath) && filesize($localFilePath) > 100) {
            $localizedList[] = $localWebUrl;
            continue;
        }

        // 2. Nếu đã có file cache trước đây -> Copy sang file ảnh tĩnh .jpg
        $legacyCacheFile = $uploadDir . $cacheId . '.cache';
        if (file_exists($legacyCacheFile) && filesize($legacyCacheFile) > 100) {
            @copy($legacyCacheFile, $localFilePath);
            if (file_exists($localFilePath) && filesize($localFilePath) > 100) {
                $localizedList[] = $localWebUrl;
                continue;
            }
        }

        // 3. Tải trực tiếp dữ liệu ảnh về lưu vào file tĩnh vật lý
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $u);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        $imgBinary = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && !empty($imgBinary) && strlen($imgBinary) > 100) {
            @file_put_contents($localFilePath, $imgBinary);
            $localizedList[] = $localWebUrl;
        } else {
            $localizedList[] = $u;
        }
    }

    if (is_array($urlInput)) {
        return $localizedList;
    }
    return implode(',', $localizedList);
}

