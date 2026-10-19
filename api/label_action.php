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

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$labelModel = new Label();

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
        echo json_encode($result);
        break;

    case 'toggle':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $labelId = (int)($_POST['label_id'] ?? 0);

        if ($conversationId <= 0 || $labelId <= 0) {
            echo json_encode(['success' => false, 'message' => 'Dữ liệu không hợp lệ']);
            exit;
        }

        $result = $labelModel->toggleLabel($conversationId, $labelId);
        echo json_encode($result);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Hành động không hợp lệ']);
}
