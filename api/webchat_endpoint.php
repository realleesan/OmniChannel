<?php
/**
 * API: webchat_endpoint.php
 * Cổng tiếp nhận tin nhắn trực tiếp từ Webchat Widget của khách hàng trên website
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/ChatController.php';
require_once __DIR__ . '/../models/Message.php';

$action = $_POST['action'] ?? $_GET['action'] ?? 'send';
$chatController = new ChatController();
$msgModel = new Message();

switch ($action) {
    case 'send':
        $customerId = trim($_POST['customer_id'] ?? '');
        $customerName = trim($_POST['customer_name'] ?? 'Khách Webchat');
        $content = trim($_POST['content'] ?? '');

        if (empty($customerId)) {
            $customerId = 'web_' . substr(md5(uniqid(rand(), true)), 0, 10);
        }

        if (empty($content)) {
            jsonResponse(false, [], 'Nội dung tin nhắn không được để trống', 400);
        }

        // Tiếp nhận tin nhắn khách hàng (tự động chia tải và đổi ca nếu cần)
        $res = $chatController->receiveCustomerMessage('WEBCHAT', $customerId, $customerName, $content);

        jsonResponse(true, [
            'customer_id'     => $customerId,
            'conversation_id' => $res['conversation_id'],
            'message_id'      => $res['message_id'],
            'content'         => $content,
            'time'            => date('H:i')
        ], 'Tin nhắn đã được tiếp nhận');
        break;

    case 'get_messages':
        $conversationId = (int)($_GET['conversation_id'] ?? 0);
        $lastMsgId = (int)($_GET['last_msg_id'] ?? 0);

        if (!$conversationId) {
            jsonResponse(false, [], 'Thiếu mã hội thoại', 400);
        }

        $messages = $msgModel->getLatestAfterId($conversationId, $lastMsgId);
        jsonResponse(true, ['messages' => $messages]);
        break;

    default:
        jsonResponse(false, [], 'Hành động không hợp lệ', 400);
}
