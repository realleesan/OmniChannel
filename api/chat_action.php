<?php
/**
 * API: chat_action.php
 * Xử lý các thao tác tương tác của nhân viên trên khung chat
 */

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

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$chatController = new ChatController();
$authController = new AuthController();

switch ($action) {
    case 'get_conversation':
        $conversationId = (int)($_GET['id'] ?? 0);
        $data = $chatController->getConversationDetail($conversationId, $userId);
        if (!$data) {
            jsonResponse(false, [], 'Không tìm thấy hội thoại', 404);
        }
        jsonResponse(true, $data);
        break;

    case 'send_message':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $content = trim($_POST['content'] ?? '');
        $attachmentUrl = trim($_POST['attachment_url'] ?? '');

        if (empty($content) && empty($attachmentUrl)) {
            jsonResponse(false, [], 'Nội dung tin nhắn không được để trống');
        }

        $res = $chatController->sendStaffMessage($conversationId, $userId, $content, $attachmentUrl ?: null);
        if ($res['success']) {
            jsonResponse(true, $res['data'], 'Gửi tin nhắn thành công');
        } else {
            jsonResponse(false, [], $res['message'], 403);
        }
        break;

    case 'toggle_shift':
        $newStatus = trim($_POST['status'] ?? 'ONLINE');
        $res = $authController->toggleStatus($newStatus);
        jsonResponse($res['success'], ['status' => $res['status']], 'Đã cập nhật ca trực');
        break;

    case 'upload_attachment':
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(false, [], 'Không có tệp tải lên hoặc lỗi tải tệp');
        }

        $file = $_FILES['file'];
        $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        if (!in_array($ext, $allowedExtensions)) {
            jsonResponse(false, [], 'Chỉ chấp nhận file ảnh: jpg, jpeg, png, gif, webp');
        }

        if ($file['size'] > 5 * 1024 * 1024) { // 5MB
            jsonResponse(false, [], 'Dung lượng ảnh tối đa là 5MB');
        }

        $uploadDir = __DIR__ . '/../public/uploads/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $fileName = 'attach_' . time() . '_' . uniqid() . '.' . $ext;
        $targetPath = $uploadDir . $fileName;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $fileUrl = BASE_URL . '/public/uploads/' . $fileName;
            jsonResponse(true, ['url' => $fileUrl], 'Tải ảnh thành công');
        } else {
            jsonResponse(false, [], 'Không thể lưu tệp ảnh lên máy chủ');
        }
        break;

    default:
        jsonResponse(false, [], 'Hành động không hợp lệ', 400);
}
