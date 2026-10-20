<?php
/**
 * API: label_action.php
 * Xử lý tạo nhãn mới, gán/gỡ nhãn cho cuộc hội thoại
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/Label.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    echo json_encode(['success' => false, 'message' => 'Vui lòng đăng nhập lại']);
    exit;
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$labelModel = new Label();

require_once __DIR__ . '/../models/Conversation.php';
$convModel = new Conversation();

switch ($action) {
    case 'get_all':
        $labels = $labelModel->getAll();
        echo json_encode(['success' => true, 'labels' => $labels]);
        break;

    case 'create':
        $name = trim($_POST['name'] ?? '');
        $color = trim($_POST['color'] ?? '#3B82F6');
        $icon = trim($_POST['icon'] ?? 'fa-solid fa-tag');

        $result = $labelModel->create($name, $color, $icon, $userId);
        if ($result['success']) {
            $result['all_labels'] = $labelModel->getAll();
        }
        echo json_encode($result);
        break;

    case 'toggle':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $labelId = (int)($_POST['label_id'] ?? 0);

        if ($conversationId <= 0 || $labelId <= 0) {
            echo json_encode(['success' => false, 'message' => 'Dữ liệu không hợp lệ']);
            exit;
        }

        $conv = $convModel->getById($conversationId);
        if ($conv && !empty($conv['assigned_user_id']) && $conv['assigned_user_id'] != $userId) {
            echo json_encode(['success' => false, 'message' => 'Hội thoại do nhân viên khác phụ trách. Bạn không có quyền gắn/hủy nhãn.']);
            exit;
        }

        $result = $labelModel->toggleLabel($conversationId, $labelId);
        $result['assigned_labels'] = $labelModel->getLabelsForConversation($conversationId);
        echo json_encode($result);
        break;

    case 'update':
        $id = (int)($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $color = trim($_POST['color'] ?? '#3B82F6');

        if ($id <= 0 || empty($name)) {
            echo json_encode(['success' => false, 'message' => 'Dữ liệu sửa nhãn không hợp lệ']);
            exit;
        }

        $result = $labelModel->update($id, $name, $color);
        echo json_encode($result);
        break;

    case 'delete':
        $id = (int)($_POST['id'] ?? 0);
        if ($id <= 0) {
            echo json_encode(['success' => false, 'message' => 'ID nhãn không hợp lệ']);
            exit;
        }

        $result = $labelModel->delete($id);
        echo json_encode($result);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Hành động không hợp lệ']);
}
