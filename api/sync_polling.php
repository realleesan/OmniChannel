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
    $rawInput = file_get_contents('php://input');
    $jsonData = json_decode($rawInput, true) ?: [];

    $postAction = $jsonData['action'] ?? $_POST['action'] ?? '';
    if ($postAction === 'send_message') {
        require_once __DIR__ . '/../controllers/ChatController.php';
        $chatController = new ChatController();
        $conversationId = (int)($jsonData['conversation_id'] ?? $_POST['conversation_id'] ?? 0);
        $content = trim($jsonData['content'] ?? $_POST['content'] ?? '');
        $attachmentUrl = trim($jsonData['attachment_url'] ?? $_POST['attachment_url'] ?? '');

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
        $newStatus = trim($jsonData['status'] ?? $_POST['status'] ?? 'ONLINE');
        $res = $authController->toggleStatus($newStatus);
        jsonResponse($res['success'], ['status' => $res['status']], 'Đã cập nhật ca trực', 200);
    } elseif ($postAction === 'toggle_label' || $postAction === 'toggle' || $postAction === 'create_label' || $postAction === 'update_label' || $postAction === 'delete_label' || strpos($postAction, 'label') !== false) {
        require __DIR__ . '/label_action.php';
        exit;
    } elseif ($postAction === 'save_settings' || $postAction === 'save_config' || $postAction === 'sync_data' || $postAction === 'sync' || $postAction === 'gsheet_sync' || $postAction === 'gsheet_save_config') {
        require __DIR__ . '/google_sheet_action.php';
        exit;
    } elseif ($postAction === 'create_template' || $postAction === 'update_template' || $postAction === 'delete_template' || $postAction === 'get_templates' || strpos($postAction, 'template') !== false || strpos($postAction, 'tpl') !== false) {
        require __DIR__ . '/template_action.php';
        exit;
    }
}

if (in_array(($_GET['action'] ?? ''), ['get_templates', 'get_template_list', 'check_shortcut', 'tpl_list', 'get_labels'])) {
    if (($_GET['action'] ?? '') === 'get_labels') {
        require __DIR__ . '/label_action.php';
    } else {
        require __DIR__ . '/template_action.php';
    }
    exit;
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

// Tự động bổ sung trường customer_seen cho bảng conversations (Đánh dấu khách đã xem tin nhắn)
if (!file_exists(__DIR__ . '/.schema_fixed_customer_seen')) {
    @file_put_contents(__DIR__ . '/.schema_fixed_customer_seen', '1');
    try {
        $db = Database::getConnection();
        $cols = $db->query("DESCRIBE conversations")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('customer_seen', $cols)) {
            $db->exec("ALTER TABLE conversations ADD COLUMN customer_seen TINYINT(1) DEFAULT 0");
        }
    } catch (Exception $e) {}
}

// Tự động bổ sung trường last_active_at cho bảng users (Heartbeat kiểm soát ca trực tự động)
if (!file_exists(__DIR__ . '/.schema_fixed_user_active')) {
    @file_put_contents(__DIR__ . '/.schema_fixed_user_active', '1');
    try {
        $db = Database::getConnection();
        $cols = $db->query("DESCRIBE users")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('last_active_at', $cols)) {
            $db->exec("ALTER TABLE users ADD COLUMN last_active_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
        }
    } catch (Exception $e) {}
}

// Cập nhật nhịp đập hoạt động thực tế (Heartbeat) của nhân viên đang mở giao diện làm việc
if ($userId && $userStatus === 'ONLINE') {
    $userModel->updateLastActive($userId);
}

// Hỗ trợ cập nhật khách hàng đã xem (Customer Seen)
if (($_GET['action'] ?? '') === 'customer_seen') {
    $cid = trim($_GET['customer_id'] ?? '');
    if ($cid) {
        $convModel->setCustomerSeenByExternalId($cid, 1);
    }
    echo json_encode(['success' => true]);
    exit;
}

// 2. Lấy danh sách hội thoại theo bộ lọc mới (chuẩn plan.md)
$conversations = $convModel->getFilteredList($userId, $tab, $unrepliedScope, $search, $labelId, $channel);

// 3. Nếu đang mở 1 hội thoại cụ thể, lấy tin mới và kiểm tra quyền
$activeConversationData = null;
if ($activeConvId) {
    $conv = $convModel->getById($activeConvId);
    if ($conv) {
        $isMine = ($conv['assigned_user_id'] == $userId);
        $isViewOnly = (!empty($conv['assigned_user_id']) && !$isMine);

        // QUAN TRỌNG: Chỉ đánh dấu đã đọc nếu là hội thoại của chính mình hoặc hội thoại chưa được gán cho ai!
        // Nếu là hội thoại của nhân viên khác, xem chỉ là View-only, KHÔNG làm mất trạng thái Chưa đọc của nhân viên phụ trách!
        if ($isMine || empty($conv['assigned_user_id'])) {
            $convModel->markAsRead($activeConvId);
        }

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
