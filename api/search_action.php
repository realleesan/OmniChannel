<?php
/**
 * API: search_action.php
 * Tìm kiếm toàn diện chuẩn Zalo: Phân tách Khách hàng & Tin nhắn
 */

ob_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/Conversation.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    jsonResponse(false, [], 'Chưa đăng nhập', 401);
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$query = trim($_GET['q'] ?? $_POST['q'] ?? '');
$convModel = new Conversation();
$results = $convModel->searchZalo($query, $userId);

jsonResponse(true, $results);
