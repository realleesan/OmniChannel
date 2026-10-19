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
$unrepliedOnly = (!empty($_GET['unreplied']) && $_GET['unreplied'] == '1');
$search = $_GET['search'] ?? '';
$activeConvId = !empty($_GET['active_conv_id']) ? (int)$_GET['active_conv_id'] : null;
$lastMsgId = !empty($_GET['last_msg_id']) ? (int)$_GET['last_msg_id'] : 0;

$userModel = new User();
$convModel = new Conversation();
$msgModel = new Message();
$profileModel = new CustomerProfile();

// 1. Kiểm tra trạng thái người dùng hiện tại
$currentUser = $userModel->findById($userId);
$userStatus = $currentUser ? $currentUser['status'] : 'OFFLINE';

// 2. Lấy danh sách hội thoại theo bộ lọc
$conversations = $convModel->getFilteredList($userId, $tab, $unrepliedOnly, $search);

// 3. Nếu đang mở 1 hội thoại cụ thể, lấy các tin nhắn mới và thông tin chi tiết
$activeConversationData = null;
if ($activeConvId) {
    $conv = $convModel->getById($activeConvId);
    if ($conv) {
        $isMine = ($conv['assigned_user_id'] == $userId);
        $isViewOnly = (!empty($conv['assigned_user_id']) && !$isMine);
        $newMessages = $msgModel->getLatestAfterId($activeConvId, $lastMsgId);
        $profile = $profileModel->getByConversationId($activeConvId);

        $activeConversationData = [
            'conversation' => $conv,
            'is_mine'      => $isMine,
            'is_view_only' => $isViewOnly,
            'new_messages' => $newMessages,
            'profile'      => $profile
        ];
    }
}

// 4. (Tùy chọn) Kéo tin nhắn từ Render Webhook Gateway nếu có cài đặt
// InfinityFree cho phép gọi cURL HTTPS ra ngoài cổng 443
if (defined('RENDER_GATEWAY_URL') && !empty(RENDER_GATEWAY_URL)) {
    // Có thể thực hiện polling nhẹ nhàng hoặc dựa vào client-side
}

echo json_encode([
    'success'              => true,
    'current_user_status'  => $userStatus,
    'conversations'        => $conversations,
    'active_conversation'  => $activeConversationData,
    'timestamp'            => time()
], JSON_UNESCAPED_UNICODE);
