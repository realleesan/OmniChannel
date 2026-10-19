<?php
/**
 * OMNICHANNEL CHAT SYSTEM - ENTRY POINT
 * Điều hướng người dùng vào Workspace nếu đã đăng nhập hoặc trang Login nếu chưa
 */

require_once __DIR__ . '/config/constants.php';

if (!empty($_SESSION['user_id'])) {
    header('Location: ' . BASE_URL . '/views/chat/workspace.php');
} else {
    header('Location: ' . BASE_URL . '/views/auth/login.php');
}
exit;
