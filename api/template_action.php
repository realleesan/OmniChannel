<?php
/**
 * API: template_action.php
 * Xử lý truy xuất mẫu tin nhắn và phím tắt thay thế biến động
 */

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/TemplateController.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    echo json_encode(['success' => false, 'message' => 'Vui lòng đăng nhập lại'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawInput = file_get_contents('php://input');
$jsonData = json_decode($rawInput, true) ?: [];

$action = $jsonData['action'] ?? $_POST['action'] ?? $_GET['action'] ?? '';
$templateController = new TemplateController();

switch ($action) {
    case 'get_list':
    case 'get_templates':
    case 'get_template_list':
        $templates = $templateController->getList();
        echo json_encode(['success' => true, 'templates' => $templates], JSON_UNESCAPED_UNICODE);
        break;

    case 'check_shortcut':
        $shortcut = trim($jsonData['shortcut'] ?? $_GET['shortcut'] ?? $_POST['shortcut'] ?? '');
        $excludeId = $jsonData['exclude_id'] ?? $_GET['exclude_id'] ?? $_POST['exclude_id'] ?? null;
        $exists = $templateController->checkShortcut($shortcut, $excludeId);
        echo json_encode(['success' => true, 'exists' => $exists], JSON_UNESCAPED_UNICODE);
        break;

    case 'create':
    case 'create_template':
    case 'template_create':
        $shortcut = trim($jsonData['shortcut'] ?? $_POST['shortcut'] ?? '');
        $title = trim($jsonData['title'] ?? $_POST['title'] ?? '');
        $content = trim($jsonData['content'] ?? $_POST['content'] ?? '');
        $variablesJson = $jsonData['variables_json'] ?? $_POST['variables_json'] ?? null;
        $sheetName = trim($jsonData['sheet_name'] ?? $_POST['sheet_name'] ?? '');

        $res = $templateController->create($shortcut, $title, $content, $userId, $variablesJson, $sheetName);
        if ($res['success']) {
            $all = $templateController->getList();
            echo json_encode(['success' => true, 'message' => $res['message'], 'templates' => $all], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['success' => false, 'message' => $res['message']], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'update':
    case 'update_template':
    case 'template_update':
        $id = (int)($jsonData['id'] ?? $_POST['id'] ?? 0);
        $shortcut = trim($jsonData['shortcut'] ?? $_POST['shortcut'] ?? '');
        $title = trim($jsonData['title'] ?? $_POST['title'] ?? '');
        $content = trim($jsonData['content'] ?? $_POST['content'] ?? '');
        $variablesJson = $jsonData['variables_json'] ?? $_POST['variables_json'] ?? null;
        $sheetName = trim($jsonData['sheet_name'] ?? $_POST['sheet_name'] ?? '');

        $res = $templateController->update($id, $shortcut, $title, $content, $variablesJson, $sheetName);
        if ($res['success']) {
            $all = $templateController->getList();
            echo json_encode(['success' => true, 'message' => $res['message'], 'templates' => $all], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['success' => false, 'message' => $res['message']], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'delete':
    case 'delete_template':
    case 'template_delete':
        $id = (int)($jsonData['id'] ?? $_POST['id'] ?? 0);
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
