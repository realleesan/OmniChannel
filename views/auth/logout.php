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

$authController = new AuthController();
$authController->logout();

header('Location: ' . BASE_URL . '/views/auth/login.php');
exit;
