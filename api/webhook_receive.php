<?php
/**
 * API: webhook_receive.php
 * Cổng tiếp nhận sự kiện và tin nhắn từ Webhook Gateway (Render, Facebook, Zalo, Shopee...)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Gateway-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/ChatController.php';

// Hỗ trợ nhận cả application/x-www-form-urlencoded và application/json (từ Gateway)
$rawInput = file_get_contents('php://input');
$jsonData = json_decode($rawInput, true);

$channel           = strtoupper(trim($jsonData['channel'] ?? $_POST['channel'] ?? 'FACEBOOK'));
$externalSenderId  = trim($jsonData['external_sender_id'] ?? $_POST['external_sender_id'] ?? '');
$senderName        = trim($jsonData['sender_name'] ?? $_POST['sender_name'] ?? 'Khách Mạng Xã Hội');
$content           = trim($jsonData['content'] ?? $_POST['content'] ?? '');
$attachmentUrl     = trim($jsonData['attachment_url'] ?? $_POST['attachment_url'] ?? '');

if (empty($externalSenderId)) {
    $externalSenderId = strtolower($channel) . '_' . substr(md5(uniqid(rand(), true)), 0, 8);
}

if (empty($content)) {
    jsonResponse(false, [], 'Nội dung tin nhắn không được để trống', 400);
}

$chatController = new ChatController();
$res = $chatController->receiveCustomerMessage(
    $channel, 
    $externalSenderId, 
    $senderName, 
    $content, 
    $attachmentUrl ?: null
);

jsonResponse(true, [
    'channel'             => $channel,
    'conversation_id'     => $res['conversation_id'],
    'message_id'          => $res['message_id'],
    'is_new_conversation' => $res['is_new_conversation'],
    'sender_name'         => $senderName,
    'content'             => $content
], "Đã tiếp nhận tin nhắn từ kênh {$channel} thành công");
