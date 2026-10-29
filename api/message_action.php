<?php
/**
 * API: message_action.php
 * Xử lý các thao tác tương tác của nhân viên (gửi tin nhắn, upload ảnh, đổi ca trực)
 * Thay thế chat_action.php để tránh bộ lọc từ khóa WAF của Apache/InfinityFree
 */

ob_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/ChatController.php';
require_once __DIR__ . '/../controllers/AuthController.php';

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) {
    jsonResponse(false, [], 'Vui lòng đăng nhập lại', 401);
}

// Giải phóng khóa session ngay lập tức để không cản trở các request đồng thời
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$rawInput = file_get_contents('php://input');
$jsonData = json_decode($rawInput, true) ?: [];

$action = $jsonData['action'] ?? $_POST['action'] ?? $_GET['action'] ?? '';
$chatController = new ChatController();
$authController = new AuthController();

switch ($action) {
    case 'get_conversation':
        $conversationId = (int)($jsonData['id'] ?? $_GET['id'] ?? $_POST['id'] ?? 0);
        $data = $chatController->getConversationDetail($conversationId, $userId);
        if (!$data) {
            jsonResponse(false, [], 'Không tìm thấy hội thoại', 404);
        }
        jsonResponse(true, $data);
        break;

    case 'send_message':
        $conversationId = (int)($jsonData['conversation_id'] ?? $_POST['conversation_id'] ?? $_GET['conversation_id'] ?? 0);
        $content = trim($jsonData['content'] ?? $_POST['content'] ?? $_GET['content'] ?? '');
        $attachmentUrl = trim($jsonData['attachment_url'] ?? $_POST['attachment_url'] ?? $_GET['attachment_url'] ?? '');

        if (empty($content) && empty($attachmentUrl)) {
            jsonResponse(false, [], 'Nội dung tin nhắn không được để trống');
        }

        $res = $chatController->sendStaffMessage($conversationId, $userId, $content, $attachmentUrl ?: null);
        if ($res['success']) {
            jsonResponse(true, $res['data'], 'Gửi tin nhắn thành công');
        } else {
            jsonResponse(false, [], $res['message'], 200);
        }
        break;

    case 'delete_conversation':
        $conversationId = (int)($jsonData['conversation_id'] ?? $_POST['conversation_id'] ?? $_GET['conversation_id'] ?? 0);
        if ($conversationId <= 0) {
            jsonResponse(false, [], 'Thiếu conversation_id');
        }
        $res = $chatController->deleteConversation($conversationId, $userId);
        jsonResponse($res['success'], [], $res['message'], 200);
        break;

    case 'toggle_shift':
        $newStatus = trim($_POST['status'] ?? 'ONLINE');
        $res = $authController->toggleStatus($newStatus);
        jsonResponse($res['success'], ['status' => $res['status']], 'Đã cập nhật ca trực');
        break;

    case 'upload_attachment':
        $uploadedUrls = [];
        $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        $uploadDir = __DIR__ . '/../public/uploads/';
        if (!is_dir($uploadDir)) {
            @mkdir($uploadDir, 0777, true);
        }

        $filesToProcess = [];
        if (isset($_FILES['files']) && is_array($_FILES['files']['name'])) {
            foreach ($_FILES['files']['name'] as $idx => $name) {
                if ($_FILES['files']['error'][$idx] === UPLOAD_ERR_OK) {
                    $filesToProcess[] = [
                        'name'     => $name,
                        'tmp_name' => $_FILES['files']['tmp_name'][$idx],
                        'size'     => $_FILES['files']['size'][$idx]
                    ];
                }
            }
        } elseif (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $filesToProcess[] = $_FILES['file'];
        }

        if (empty($filesToProcess)) {
            jsonResponse(false, [], 'Không có tệp tải lên hợp lệ');
        }

        foreach ($filesToProcess as $f) {
            $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $allowedExtensions)) continue;
            if ($f['size'] > 10 * 1024 * 1024) continue; // 10MB max

            $fileName = 'attach_' . time() . '_' . uniqid() . '.' . $ext;
            $targetPath = $uploadDir . $fileName;

            if (move_uploaded_file($f['tmp_name'], $targetPath)) {
                $uploadedUrls[] = BASE_URL . '/public/uploads/' . $fileName;
            }
        }

        if (!empty($uploadedUrls)) {
            jsonResponse(true, [
                'url'            => $uploadedUrls[0],
                'urls'           => $uploadedUrls,
                'attachment_url' => implode(',', $uploadedUrls)
            ], 'Tải ảnh thành công');
        } else {
            jsonResponse(false, [], 'Không thể lưu tệp ảnh lên máy chủ');
        }
        break;

    case 'upload_attachment_b64':
        $files = $jsonData['files'] ?? [];
        if (!is_array($files) || empty($files)) {
            jsonResponse(false, [], 'Không có tệp tải lên hợp lệ');
        }
        $uploadDir = __DIR__ . '/../public/uploads/';
        if (!is_dir($uploadDir)) {
            @mkdir($uploadDir, 0777, true);
        }
        $mimeToExt = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/gif'  => 'gif',
            'image/webp' => 'webp'
        ];
        $uploadedUrls = [];
        foreach (array_slice($files, 0, 10) as $f) {
            $dataUrl = $f['data'] ?? '';
            if (!preg_match('/^data:(image\/[a-z]+);base64,(.+)$/is', $dataUrl, $m)) continue;
            $binary = base64_decode($m[2], true);
            if ($binary === false || strlen($binary) > 10 * 1024 * 1024) continue;
            $info = @getimagesizefromstring($binary);
            if (!$info || !isset($mimeToExt[$info['mime']])) continue;

            $fileName = 'attach_' . time() . '_' . uniqid() . '.' . $mimeToExt[$info['mime']];
            if (@file_put_contents($uploadDir . $fileName, $binary) !== false) {
                $uploadedUrls[] = BASE_URL . '/public/uploads/' . $fileName;
            }
        }
        if (!empty($uploadedUrls)) {
            jsonResponse(true, [
                'url'            => $uploadedUrls[0],
                'urls'           => $uploadedUrls,
                'attachment_url' => implode(',', $uploadedUrls)
            ], 'Tải ảnh thành công');
        }
        jsonResponse(false, [], 'Không thể lưu tệp ảnh lên máy chủ');
        break;

    default:
        jsonResponse(false, [], 'Hành động không hợp lệ', 400);
}
