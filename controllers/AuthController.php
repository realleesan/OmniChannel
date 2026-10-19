<?php
/**
 * CONTROLLER: AuthController
 * Xử lý đăng nhập, phiên làm việc và chuyển trạng thái ca trực (Online/Offline)
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/User.php';

class AuthController {
    private User $userModel;

    public function __construct() {
        $this->userModel = new User();
    }

    public function login($username, $password) {
        $user = $this->userModel->findByUsername(trim($username));
        if (!$user) {
            return ['success' => false, 'message' => 'Tài khoản không tồn tại trong hệ thống'];
        }

        // Kiểm tra mật khẩu chuẩn xác thực bảo mật
        $isMatch = password_verify($password, $user['password']);
        if (!$isMatch) {
            return ['success' => false, 'message' => 'Mật khẩu không chính xác'];
        }

        // Đăng nhập thành công -> Lưu session và BẬT ONLINE
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['fullname'] = $user['fullname'];
        
        $this->userModel->updateStatus($user['id'], 'ONLINE');

        return ['success' => true, 'user' => $user];
    }

    public function logout() {
        if (!empty($_SESSION['user_id'])) {
            $this->userModel->updateStatus($_SESSION['user_id'], 'OFFLINE');
        }
        session_unset();
        session_destroy();
        return ['success' => true];
    }

    public function toggleStatus($status) {
        if (empty($_SESSION['user_id'])) {
            return ['success' => false, 'message' => 'Chưa đăng nhập'];
        }
        $userId = $_SESSION['user_id'];
        $status = strtoupper($status);
        if (!in_array($status, ['ONLINE', 'OFFLINE'])) {
            $status = 'ONLINE';
        }
        $this->userModel->updateStatus($userId, $status);
        return ['success' => true, 'status' => $status];
    }

    public function getCurrentUser() {
        if (empty($_SESSION['user_id'])) {
            return null;
        }
        return $this->userModel->findById($_SESSION['user_id']);
    }
}
