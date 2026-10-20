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

// Giải phóng khóa session ngay lập tức để các request khác (click chuyển hội thoại) không bị treo/block
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

// Hỗ trợ gửi tin nhắn và đổi ca trực trực tiếp qua sync_polling để miễn nhiễm tuyệt đối với WAF chặn POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
    if ($postAction === 'send_message') {
        require_once __DIR__ . '/../controllers/ChatController.php';
        $chatController = new ChatController();
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $content = trim($_POST['content'] ?? '');
        $attachmentUrl = trim($_POST['attachment_url'] ?? '');

        if (empty($content) && empty($attachmentUrl)) {
            jsonResponse(false, [], 'Nội dung tin nhắn không được để trống', 200);
        }

        $res = $chatController->sendStaffMessage($conversationId, $userId, $content, $attachmentUrl ?: null);
        if ($res['success']) {
            jsonResponse(true, $res['data'], 'Gửi tin nhắn thành công');
        } else {
            jsonResponse(false, [], $res['message'], 200);
        }
    } elseif ($postAction === 'toggle_shift') {
        require_once __DIR__ . '/../controllers/AuthController.php';
        $authController = new AuthController();
        $newStatus = trim($_POST['status'] ?? 'ONLINE');
        $res = $authController->toggleStatus($newStatus);
        jsonResponse($res['success'], ['status' => $res['status']], 'Đã cập nhật ca trực', 200);
    } elseif ($postAction === 'update_label') {
        require_once __DIR__ . '/../models/Label.php';
        $labelModel = new Label();
        $id = (int)($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $color = trim($_POST['color'] ?? '#3B82F6');
        $res = $labelModel->update($id, $name, $color);
        echo json_encode($res);
        exit;
    } elseif ($postAction === 'delete_label') {
        require_once __DIR__ . '/../models/Label.php';
        $labelModel = new Label();
        $id = (int)($_POST['id'] ?? 0);
        $res = $labelModel->delete($id);
        echo json_encode($res);
        exit;
    }
}

if (($_GET['action'] ?? '') === 'search_zalo') {
    $q = trim($_GET['q'] ?? '');
    $convModel = new Conversation();
    $results = $convModel->searchZalo($q, $userId);
    echo json_encode(['success' => true, 'data' => $results], JSON_UNESCAPED_UNICODE);
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

// Tự động nâng cấp schema và làm sạch dữ liệu 1 lần duy nhất
if (!file_exists(__DIR__ . '/.schema_fixed_v2')) {
    @file_put_contents(__DIR__ . '/.schema_fixed_v2', '1');
    try {
        $db = Database::getConnection();
        $db->exec("ALTER TABLE conversations MODIFY last_message_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
        $db->exec("ALTER TABLE conversations MODIFY tag ENUM('DANG_TU_VAN', 'DA_CHOT', 'CHO_CHUYEN_KHOAN', 'BOOM_HANG') NULL DEFAULT NULL");
        $db->exec("UPDATE conversations c SET c.last_message_at = (SELECT COALESCE(MAX(m.created_at), c.created_at) FROM messages m WHERE m.conversation_id = c.id) WHERE EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)");
        $db->exec("UPDATE conversations SET tag = NULL WHERE tag = 'DANG_TU_VAN'");
    } catch (Exception $e) {}
}

// Tự động bổ sung các trường CRM thực tế cho bảng customer_profiles
if (!file_exists(__DIR__ . '/.schema_fixed_crm')) {
    @file_put_contents(__DIR__ . '/.schema_fixed_crm', '1');
    try {
        $db = Database::getConnection();
        $cols = $db->query("DESCRIBE customer_profiles")->fetchAll(PDO::FETCH_COLUMN);
        $needed = [
            'real_name'            => "VARCHAR(150) NULL",
            'phone'                => "VARCHAR(50) NULL",
            'address'              => "VARCHAR(255) NULL",
            'customer_needs'       => "TEXT NULL",
            'conversation_summary' => "TEXT NULL",
            'from_date'            => "DATE NULL",
            'to_date'              => "DATE NULL"
        ];
        foreach ($needed as $col => $def) {
            if (!in_array($col, $cols)) {
                $db->exec("ALTER TABLE customer_profiles ADD COLUMN $col $def");
            }
        }
    } catch (Exception $e) {}
}

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
                        $m['content'] ?? '',
                        $m['attachment_url'] ?? null,
                        $m['customer_phone'] ?? null
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
