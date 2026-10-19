<?php
// Tự động chuyển hướng sang HTTPS nếu vào bằng HTTP để tránh lỗi chặn cookie của InfinityFree
if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
    if (!headers_sent()) {
        header("Location: https://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'], true, 301);
        exit;
    }
}
include __DIR__ . '/demo.html';
