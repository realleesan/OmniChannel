<?php
require_once __DIR__ . '/../config/constants.php';

$url = rtrim(RENDER_GATEWAY_URL, '/') . '/api/webchat/reply';
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'customer_id' => 'test_cust_live_check',
    'content'     => 'Chào bạn từ test script',
    'staff_name'  => 'Quản trị viên'
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$res = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

echo "URL: $url\nCode: $code\nError: $err\nResponse: $res\n";
