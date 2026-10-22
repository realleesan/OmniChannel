<?php
/**
 * API: customer_action.php
 * Xử lý cập nhật hồ sơ khách hàng, gắn nhãn và giả lập quét Agent
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/CustomerController.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    jsonResponse(false, [], 'Vui lòng đăng nhập lại', 401);
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

require_once __DIR__ . '/../models/Conversation.php';

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$customerController = new CustomerController();
$convModel = new Conversation();

switch ($action) {
    case 'update_field':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $field = trim($_POST['field'] ?? '');
        $value = trim($_POST['value'] ?? '');

        if (!$conversationId || empty($field)) {
            jsonResponse(false, [], 'Tham số không hợp lệ', 400);
        }

        $conv = $convModel->getById($conversationId);
        if ($conv && !empty($conv['assigned_user_id']) && $conv['assigned_user_id'] != $userId) {
            jsonResponse(false, [], 'Hội thoại do nhân viên khác phụ trách. Bạn không có quyền chỉnh sửa.', 403);
        }

        $res = $customerController->updateField($conversationId, $field, $value);
        jsonResponse($res['success'], [], $res['message']);
        break;

    case 'update_crm_profile':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        if (!$conversationId) {
            jsonResponse(false, [], 'Thiếu mã hội thoại', 400);
        }

        $conv = $convModel->getById($conversationId);
        if ($conv && !empty($conv['assigned_user_id']) && $conv['assigned_user_id'] != $userId) {
            jsonResponse(false, [], 'Hội thoại do nhân viên khác phụ trách. Bạn không có quyền chỉnh sửa hồ sơ.', 403);
        }

        $res = $customerController->updateCrmProfile($conversationId, $_POST);
        jsonResponse($res['success'], ['profile' => $res['profile']], $res['message']);
        break;

    case 'ai_extract_profile':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        if (!$conversationId) {
            jsonResponse(false, [], 'Thiếu mã hội thoại', 400);
        }

        $conv = $convModel->getById($conversationId);
        if ($conv && !empty($conv['assigned_user_id']) && $conv['assigned_user_id'] != $userId) {
            jsonResponse(false, [], 'Hội thoại do nhân viên khác phụ trách. Bạn không có quyền chỉnh sửa hồ sơ.', 403);
        }

        $res = $customerController->extractProfileWithAI($conversationId);
        if (!$res['success']) {
            jsonResponse(false, [], $res['message'], 400);
        }
        jsonResponse(true, ['profile' => $res['profile'], 'extracted' => $res['extracted']], $res['message']);
        break;

    case 'scan_agent':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        if (!$conversationId) {
            jsonResponse(false, [], 'Thiếu mã hội thoại', 400);
        }
        $res = $customerController->scanAgentData($conversationId);
        jsonResponse(true, $res['profile'], $res['message']);
        break;

    default:
        jsonResponse(false, [], 'Hành động không hợp lệ', 400);
}
