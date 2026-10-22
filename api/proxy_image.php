<?php
/**
 * Image Proxy: Chuyển tiếp ảnh an toàn và tương thích hoàn hảo mọi trình duyệt
 * Khắc phục triệt để lỗi Google Sheets Images chặn Sec-Fetch-Site/NotSameSite hoặc Referrer
 */

// Bỏ qua giới hạn thời gian chạy cho việc stream ảnh
@set_time_limit(15);

$url = $_GET['url'] ?? '';
if (empty($url)) {
    http_response_code(400);
    exit('Missing image URL');
}

// Giải mã URL nếu bị encode
$url = trim(urldecode($url));

// Chỉ cho phép proxy các URL hợp lệ (Google Docs/Sheets, Google Drive, Web Images)
if (!preg_match('/^https?:\/\//i', $url)) {
    http_response_code(400);
    exit('Invalid URL protocol');
}

// Cho phép trình duyệt và thẻ img tải ảnh không bị giới hạn Same-Origin hoặc Referrer
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Cross-Origin-Resource-Policy: cross-origin');
header('Cache-Control: public, max-age=86400'); // Cache 1 ngày

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 12);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
// Không gửi Referer để Google không chặn
curl_setopt($ch, CURLOPT_REFERER, '');

$data = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($data !== false && $httpCode >= 200 && $httpCode < 400) {
    if (!empty($contentType)) {
        header('Content-Type: ' . $contentType);
    } else {
        header('Content-Type: image/jpeg');
    }
    echo $data;
    exit;
}

// Fallback bằng file_get_contents nếu curl bị tắt trên hosting
$opts = [
    'http' => [
        'method' => 'GET',
        'timeout' => 10,
        'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n"
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false
    ]
];
$context = stream_context_create($opts);
$streamData = @file_get_contents($url, false, $context);
if ($streamData !== false) {
    header('Content-Type: image/jpeg');
    echo $streamData;
    exit;
}

http_response_code(502);
echo 'Error fetching image';
