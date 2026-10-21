<?php
/**
 * API: template_action.php
 * Xử lý truy xuất mẫu tin nhắn và phím tắt thay thế biến động
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/TemplateController.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    echo json_encode(['success' => false, 'message' => 'Vui lòng đăng nhập lại'], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$templateController = new TemplateController();

switch ($action) {
    case 'get_list':
        $templates = $templateController->getList();
        echo json_encode(['success' => true, 'templates' => $templates], JSON_UNESCAPED_UNICODE);
        break;

    case 'check_shortcut':
        $shortcut = trim($_GET['shortcut'] ?? $_POST['shortcut'] ?? '');
        $excludeId = $_GET['exclude_id'] ?? $_POST['exclude_id'] ?? null;
        $exists = $templateController->checkShortcut($shortcut, $excludeId);
        echo json_encode(['success' => true, 'exists' => $exists], JSON_UNESCAPED_UNICODE);
        break;

    case 'create':
        $shortcut = trim($_POST['shortcut'] ?? '');
        $title = trim($_POST['title'] ?? '');
        $content = trim($_POST['content'] ?? '');
        $variablesJson = $_POST['variables_json'] ?? null;
        $sheetName = trim($_POST['sheet_name'] ?? '');

        $res = $templateController->create($shortcut, $title, $content, $userId, $variablesJson, $sheetName);
        if ($res['success']) {
            $all = $templateController->getList();
            echo json_encode(['success' => true, 'message' => $res['message'], 'templates' => $all], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['success' => false, 'message' => $res['message']], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'update':
        $id = (int)($_POST['id'] ?? 0);
        $shortcut = trim($_POST['shortcut'] ?? '');
        $title = trim($_POST['title'] ?? '');
        $content = trim($_POST['content'] ?? '');
        $variablesJson = $_POST['variables_json'] ?? null;
        $sheetName = trim($_POST['sheet_name'] ?? '');

        $res = $templateController->update($id, $shortcut, $title, $content, $variablesJson, $sheetName);
        if ($res['success']) {
            $all = $templateController->getList();
            echo json_encode(['success' => true, 'message' => $res['message'], 'templates' => $all], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['success' => false, 'message' => $res['message']], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'delete':
        $id = (int)($_POST['id'] ?? 0);
        $res = $templateController->delete($id);
        if ($res['success']) {
            $all = $templateController->getList();
            echo json_encode(['success' => true, 'message' => $res['message'], 'templates' => $all], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['success' => false, 'message' => $res['message']], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'resolve_shortcut':
        $shortcut = trim($_GET['shortcut'] ?? $_POST['shortcut'] ?? '');
        $rowDataRaw = $_POST['row_data'] ?? $_GET['row_data'] ?? null;
        $rowData = null;
        if ($rowDataRaw) {
            $rowData = is_array($rowDataRaw) ? $rowDataRaw : json_decode($rowDataRaw, true);
        }

        if (empty($shortcut)) {
            echo json_encode(['success' => false, 'message' => 'Vui lòng cung cấp phím tắt'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $res = $templateController->resolveShortcut($shortcut, $rowData);
        if ($res['success']) {
            echo json_encode([
                'success'          => true,
                'compiled_content' => $res['compiled_content'],
                'template'         => $res['template']
            ], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['success' => false, 'message' => $res['message']], JSON_UNESCAPED_UNICODE);
        }
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Hành động không hợp lệ'], JSON_UNESCAPED_UNICODE);
        break;
}
