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
        $uKey = trim($username);
        $user = $this->userModel->findByUsername($uKey);

        if (!$user) {
            // Danh sách tài khoản nhân sự mẫu hỗ trợ tạo sẵn
            $predefined = [
                'admin' => ['pass' => 'admin123', 'name' => 'Quản trị viên', 'avatar' => 'default_avatar.png'],
                'nv1'   => ['pass' => '123456',   'name' => 'Nguyễn Văn Quân', 'avatar' => 'quan.png'],
                'nv2'   => ['pass' => '123456',   'name' => 'Trần Thị Phương', 'avatar' => 'phuong.png']
            ];

            if (isset($predefined[$uKey])) {
                $info = $predefined[$uKey];
                $this->userModel->create($uKey, $info['pass'], $info['name'], $info['avatar']);
                $user = $this->userModel->findByUsername($uKey);
            }
        }

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
        $_SESSION['avatar'] = User::getAvatarUrl($user['avatar'] ?? '', $user['id']);
        
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
