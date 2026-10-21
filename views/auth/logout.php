<?php
/**
 * VIEW / SCRIPT: auth/logout.php
 * Xử lý đăng xuất tài khoản:
 * 1. Chuyển trạng thái ca trực thành OFFLINE (Hết ca)
 * 2. Hủy phiên làm việc (Session destroy)
 * 3. Chuyển hướng an toàn về trang đăng nhập
 */

require_once __DIR__ . '/../../config/constants.php';
require_once __DIR__ . '/../../controllers/AuthController.php';

try {
    $authController = new AuthController();
    $authController->logout();
} catch (Throwable $e) {
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    @session_unset();
    @session_destroy();
}

$loginUrl = defined('BASE_URL') ? rtrim(BASE_URL, '/') . '/views/auth/login.php' : 'login.php';
header('Location: ' . $loginUrl);
exit;
