<?php
/**
 * API: sync_polling.php
 * Trái tim của cơ chế mô phỏng thời gian thực (Real-time Simulation)
 * Trả về danh sách hội thoại cập nhật, tin nhắn mới và trạng thái ca trực mỗi 2-3 giây
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/Conversation.php';
require_once __DIR__ . '/../models/Message.php';
require_once __DIR__ . '/../models/CustomerProfile.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    echo json_encode(['success' => false, 'error' => 'UNAUTHENTICATED']);
    exit;
}

$tab = $_GET['tab'] ?? 'all';
$unrepliedScope = $_GET['unreplied_scope'] ?? 'all';
$search = $_GET['search'] ?? '';
$labelId = !empty($_GET['label_id']) ? (int)$_GET['label_id'] : 0;
$channel = $_GET['channel'] ?? '';
$activeConvId = !empty($_GET['active_conv_id']) ? (int)$_GET['active_conv_id'] : null;
$lastMsgId = !empty($_GET['last_msg_id']) ? (int)$_GET['last_msg_id'] : 0;

require_once __DIR__ . '/../models/Label.php';

$userModel = new User();
$convModel = new Conversation();
$msgModel = new Message();
$profileModel = new CustomerProfile();
$labelModel = new Label();

// 1. Kiểm tra trạng thái người dùng hiện tại
$currentUser = $userModel->findById($userId);
$userStatus = $currentUser ? $currentUser['status'] : 'OFFLINE';

// 1.5. Tự động rút tin nhắn từ Render Gateway (Webchat/Facebook/Zalo) về CSDL MySQL
$gatewayUrl = defined('RENDER_GATEWAY_URL') ? RENDER_GATEWAY_URL : '';
if (!empty($gatewayUrl)) {
    if (!isset($_SESSION['last_gateway_poll']) || (time() - $_SESSION['last_gateway_poll']) >= 2) {
        $_SESSION['last_gateway_poll'] = time();
        $ch = curl_init(rtrim($gatewayUrl, '/') . '/api/messages/poll');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $pollRes = curl_exec($ch);
        curl_close($ch);

        if ($pollRes) {
            $pollJson = json_decode($pollRes, true);
            if (!empty($pollJson['success']) && !empty($pollJson['messages'])) {
                require_once __DIR__ . '/../controllers/ChatController.php';
                $chatCtrl = new ChatController();
                foreach ($pollJson['messages'] as $m) {
                    $chatCtrl->receiveCustomerMessage(
                        $m['channel'],
                        $m['external_sender_id'],
                        $m['sender_name'],
                        $m['content'],
                        $m['attachment_url'] ?? null
                    );
                }
            }
        }
    }
}

// 2. Lấy danh sách hội thoại theo bộ lọc mới (chuẩn plan.md)
$conversations = $convModel->getFilteredList($userId, $tab, $unrepliedScope, $search, $labelId, $channel);

// 3. Nếu đang mở 1 hội thoại cụ thể, đánh dấu đã đọc và lấy tin mới
$activeConversationData = null;
if ($activeConvId) {
    // Đánh dấu đã đọc khi xem
    $convModel->markAsRead($activeConvId);

    $conv = $convModel->getById($activeConvId);
    if ($conv) {
        $isMine = ($conv['assigned_user_id'] == $userId);
        $isViewOnly = (!empty($conv['assigned_user_id']) && !$isMine);
        $newMessages = $msgModel->getLatestAfterId($activeConvId, $lastMsgId);
        $profile = $profileModel->getByConversationId($activeConvId);
        $assignedLabels = $labelModel->getLabelsForConversation($activeConvId);

        $activeConversationData = [
            'conversation'    => $conv,
            'is_mine'         => $isMine,
            'is_view_only'    => $isViewOnly,
            'new_messages'    => $newMessages,
            'profile'         => $profile,
            'assigned_labels' => $assignedLabels
        ];
    }
}

// 4. Lấy danh sách tất cả các nhãn phân loại (phục vụ dropdown Phân loại)
$allLabels = $labelModel->getAll();

echo json_encode([
    'success'              => true,
    'current_user_status'  => $userStatus,
    'conversations'        => $conversations,
    'all_labels'           => $allLabels,
    'active_conversation'  => $activeConversationData,
    'timestamp'            => time()
], JSON_UNESCAPED_UNICODE);
