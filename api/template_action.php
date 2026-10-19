<?php
/**
 * API: template_action.php
 * Xử lý truy xuất mẫu tin nhắn và phím tắt thay thế biến động (/1, /size...)
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/TemplateController.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    jsonResponse(false, [], 'Vui lòng đăng nhập lại', 401);
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$templateController = new TemplateController();

switch ($action) {
    case 'get_list':
        $templates = $templateController->getList();
        jsonResponse(true, $templates);
        break;

    case 'resolve_shortcut':
        $shortcut = trim($_GET['shortcut'] ?? $_POST['shortcut'] ?? '');
        $productCode = trim($_GET['product_code'] ?? $_POST['product_code'] ?? 'SP01');

        if (empty($shortcut)) {
            jsonResponse(false, [], 'Vui lòng cung cấp phím tắt');
        }

        $res = $templateController->resolveShortcut($shortcut, $productCode);
        if ($res['success']) {
            jsonResponse(true, [
                'compiled_content' => $res['compiled_content'],
                'template'         => $res['template']
            ]);
        } else {
            jsonResponse(false, [], $res['message'], 404);
        }
        break;

    case 'create':
        $shortcut = trim($_POST['shortcut'] ?? '');
        $title = trim($_POST['title'] ?? '');
        $content = trim($_POST['content'] ?? '');

        $res = $templateController->create($shortcut, $title, $content, $userId);
        jsonResponse($res['success'], [], $res['message'], $res['success'] ? 200 : 400);
        break;

    default:
        jsonResponse(false, [], 'Hành động không hợp lệ', 400);
}
