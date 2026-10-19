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

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$customerController = new CustomerController();

switch ($action) {
    case 'scan_agent':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        if (!$conversationId) {
            jsonResponse(false, [], 'Thiếu mã hội thoại', 400);
        }
        $res = $customerController->scanAgentData($conversationId);
        jsonResponse(true, $res['profile'], $res['message']);
        break;

    case 'update_field':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $field = trim($_POST['field'] ?? '');
        $value = trim($_POST['value'] ?? '');

        if (!$conversationId || empty($field)) {
            jsonResponse(false, [], 'Tham số không hợp lệ', 400);
        }

        $res = $customerController->updateField($conversationId, $field, $value);
        jsonResponse($res['success'], [], $res['message']);
        break;

    case 'update_tag':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $tag = trim($_POST['tag'] ?? '');

        if (!$conversationId || empty($tag)) {
            jsonResponse(false, [], 'Tham số không hợp lệ', 400);
        }

        $res = $customerController->updateTag($conversationId, $tag);
        jsonResponse($res['success'], ['tag' => $res['tag'], 'tag_info' => $res['tag_info']], $res['message']);
        break;

    default:
        jsonResponse(false, [], 'Hành động không hợp lệ', 400);
}
