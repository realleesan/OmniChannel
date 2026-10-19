<?php
/**
 * API: webchat_endpoint.php
 * Cổng tiếp nhận và đồng bộ tin nhắn Webchat Widget cho website đối tác
 * Hỗ trợ CORS đầy đủ để nhúng trên bất kỳ tên miền nào
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/ChatController.php';
require_once __DIR__ . '/../models/Conversation.php';
require_once __DIR__ . '/../models/Message.php';

$action = $_POST['action'] ?? $_GET['action'] ?? 'send';
$chatController = new ChatController();
$convModel = new Conversation();
$msgModel = new Message();

switch ($action) {
    /**
     * Khởi tạo hoặc khôi phục phiên chat của khách truy cập website
     */
    case 'init':
        $customerId = trim($_POST['customer_id'] ?? $_GET['customer_id'] ?? '');
        $customerName = trim($_POST['customer_name'] ?? $_GET['customer_name'] ?? '');

        if (empty($customerId)) {
            $customerId = 'web_' . bin2hex(random_bytes(6));
        }

        if (empty($customerName)) {
            $customerName = 'Khách Web ' . substr($customerId, -4);
        }

        // Tìm kiếm hội thoại cũ của customerId này
        $conv = $convModel->findByExternalSender('WEBCHAT', $customerId);
        $messages = [];
        $conversationId = null;

        if ($conv) {
            $conversationId = (int)$conv['id'];
            $messages = $msgModel->getByConversationId($conversationId);
        }

        echo json_encode([
            'success'         => true,
            'customer_id'     => $customerId,
            'customer_name'   => $customerName,
            'conversation_id' => $conversationId,
            'messages'        => $messages
        ], JSON_UNESCAPED_UNICODE);
        break;

    /**
     * Nhận tin nhắn từ khách gửi qua Widget
     */
    case 'send':
        $customerId = trim($_POST['customer_id'] ?? '');
        $customerName = trim($_POST['customer_name'] ?? '');
        $content = trim($_POST['content'] ?? '');

        if (empty($customerId)) {
            $customerId = 'web_' . bin2hex(random_bytes(6));
        }
        if (empty($customerName)) {
            $customerName = 'Khách Web ' . substr($customerId, -4);
        }
        if (empty($content)) {
            echo json_encode(['success' => false, 'message' => 'Nội dung tin nhắn không được để trống'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Nhận tin nhắn và tự động phân chia tải / đổi ca
        $res = $chatController->receiveCustomerMessage('WEBCHAT', $customerId, $customerName, $content);

        echo json_encode([
            'success'         => true,
            'customer_id'     => $customerId,
            'conversation_id' => $res['conversation_id'],
            'message_id'      => $res['message_id'],
            'content'         => $content,
            'sender_type'     => 'CUSTOMER',
            'time'            => date('H:i')
        ], JSON_UNESCAPED_UNICODE);
        break;

    /**
     * Polling lấy tin nhắn mới (phản hồi từ nhân viên về cho khách)
     */
    case 'poll':
    case 'get_messages':
        $conversationId = (int)($_GET['conversation_id'] ?? $_POST['conversation_id'] ?? 0);
        $lastMsgId = (int)($_GET['last_msg_id'] ?? $_POST['last_msg_id'] ?? 0);

        if ($conversationId <= 0) {
            echo json_encode(['success' => true, 'messages' => []]);
            exit;
        }

        $newMessages = $msgModel->getLatestAfterId($conversationId, $lastMsgId);
        echo json_encode([
            'success'  => true,
            'messages' => $newMessages
        ], JSON_UNESCAPED_UNICODE);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Hành động không hợp lệ'], JSON_UNESCAPED_UNICODE);
}
