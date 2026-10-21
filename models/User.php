<?php
/**
 * MODEL: User
 * Quản lý nhân viên tư vấn, phân quyền ca trực và chia tải
 */

require_once __DIR__ . '/../config/database.php';

class User {
    private PDO $db;

    public const AVATAR_POOL = [
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face', // 0: Nữ tư vấn viên công sở
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face', // 1: Nam lịch lãm
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop&crop=face', // 2: Nữ tươi cười, tóc ngắn
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face', // 3: Nam thanh lịch
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face', // 4: Nữ rạng rỡ, hiện đại
        'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&h=150&fit=crop&crop=face', // 5: Nam công sở trẻ trung
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face', // 6: Nữ thân thiện
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face', // 7: Nam phong độ
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face', // 8: Nữ thanh lịch
        'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&h=150&fit=crop&crop=face'  // 9: Nam năng động
    ];

    public static function getAvatarUrl($avatar, $userId = 0) {
        if (!empty($avatar) && $avatar !== 'default_avatar.png' && filter_var($avatar, FILTER_VALIDATE_URL)) {
            return $avatar;
        }
        $index = abs((int)$userId) % count(self::AVATAR_POOL);
        return self::AVATAR_POOL[$index];
    }

    public function __construct() {
        $this->db = Database::getConnection();

        // Tự động kiểm tra và bổ sung cột last_active_at nếu chưa có trên database hosting
        static $checkedSchema = false;
        if (!$checkedSchema) {
            $checkedSchema = true;
            try {
                $check = $this->db->query("SHOW COLUMNS FROM users LIKE 'last_active_at'")->fetch();
                if (!$check) {
                    $this->db->exec("ALTER TABLE users ADD COLUMN last_active_at TIMESTAMP NULL DEFAULT NULL AFTER status");
                }
            } catch (Exception $e) {}
        }
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT id, username, fullname, avatar, status, current_chat_count FROM users WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();
        if ($user) {
            $user['avatar'] = self::getAvatarUrl($user['avatar'], $user['id']);
        }
        return $user;
    }

    public function findByUsername($username) {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = :username");
        $stmt->execute([':username' => $username]);
        $user = $stmt->fetch();
        if ($user) {
            $user['avatar'] = self::getAvatarUrl($user['avatar'], $user['id']);
        }
        return $user;
    }

    public function create($username, $password, $fullname, $avatar = 'default_avatar.png') {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare("
            INSERT INTO users (username, password, fullname, avatar, status, current_chat_count)
            VALUES (:username, :password, :fullname, :avatar, 'ONLINE', 0)
        ");
        return $stmt->execute([
            ':username' => trim($username),
            ':password' => $hash,
            ':fullname' => trim($fullname),
            ':avatar'   => $avatar
        ]);
    }

    public function updateStatus($id, $status) {
        $status = in_array($status, ['ONLINE', 'OFFLINE']) ? $status : 'OFFLINE';
        try {
            if ($status === 'ONLINE') {
                $stmt = $this->db->prepare("UPDATE users SET status = 'ONLINE', last_active_at = NOW() WHERE id = :id");
            } else {
                $stmt = $this->db->prepare("UPDATE users SET status = 'OFFLINE', last_active_at = NULL WHERE id = :id");
            }
            $res = $stmt->execute([':id' => $id]);
        } catch (Exception $e) {
            // Fallback an toàn nếu chưa có cột last_active_at
            try {
                $stmt = $this->db->prepare("UPDATE users SET status = :status WHERE id = :id");
                $res = $stmt->execute([':status' => $status, ':id' => $id]);
            } catch (Exception $e2) {
                $res = false;
            }
        }
        try {
            $this->syncChatCounts();
        } catch (Exception $e) {}
        return $res;
    }

    /**
     * Cập nhật nhịp đập hoạt động thực tế (Heartbeat) của nhân viên đang làm việc
     */
    public function updateLastActive($id) {
        try {
            $stmt = $this->db->prepare("UPDATE users SET last_active_at = NOW() WHERE id = :id AND status = 'ONLINE'");
            return $stmt->execute([':id' => $id]);
        } catch (Exception $e) {
            return false;
        }
    }

    public function getOnlineAgents() {
        $stmt = $this->db->query("SELECT id, username, fullname, avatar, current_chat_count FROM users WHERE status = 'ONLINE' ORDER BY current_chat_count ASC");
        $agents = $stmt->fetchAll();
        foreach ($agents as &$ag) {
            $ag['avatar'] = self::getAvatarUrl($ag['avatar'], $ag['id']);
        }
        return $agents;
    }

    /**
     * Thuật toán Chia tải: Tìm nhân viên đang ONLINE có ít hội thoại nhất
     * Tự động loại bỏ bất kỳ nhân viên nào đã ĐĂNG XUẤT hoặc TẮT CA (OFFLINE)
     */
    public function findAgentForAssignment() {
        // 1. Tự động chuyển OFFLINE các nhân viên đã đóng trình duyệt hoặc mất kết nối quá 60s mà không bấm đăng xuất
        try {
            $this->db->exec("
                UPDATE users 
                SET status = 'OFFLINE' 
                WHERE status = 'ONLINE' 
                  AND last_active_at IS NOT NULL 
                  AND last_active_at < (NOW() - INTERVAL 60 SECOND)
            ");
        } catch (Exception $e) {}

        // 2. Cập nhật lại số lượng chat thực tế trước khi gán
        $this->syncChatCounts();

        // 3. Chỉ chọn nhân viên đang thực sự ONLINE trong ca trực
        $stmt = $this->db->query("
            SELECT id, fullname, current_chat_count 
            FROM users 
            WHERE status = 'ONLINE' 
            ORDER BY current_chat_count ASC, id ASC 
            LIMIT 1
        ");
        return $stmt->fetch();
    }

    /**
     * Đồng bộ số lượng chat đang phụ trách thực tế
     */
    public function syncChatCounts() {
        $this->db->query("
            UPDATE users u
            LEFT JOIN (
                SELECT assigned_user_id, COUNT(*) as cnt 
                FROM conversations 
                WHERE status != 'CLOSED' AND assigned_user_id IS NOT NULL 
                GROUP BY assigned_user_id
            ) c ON u.id = c.assigned_user_id
            SET u.current_chat_count = COALESCE(c.cnt, 0)
        ");
    }
}
