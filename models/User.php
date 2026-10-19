<?php
/**
 * MODEL: User
 * Quản lý nhân viên tư vấn, phân quyền ca trực và chia tải
 */

require_once __DIR__ . '/../config/database.php';

class User {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT id, username, fullname, avatar, status, current_chat_count FROM users WHERE id = :id");
        $stmt->execute([':id' => $id]);
        return $stmt->fetch();
    }

    public function findByUsername($username) {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = :username");
        $stmt->execute([':username' => $username]);
        return $stmt->fetch();
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
        $stmt = $this->db->prepare("UPDATE users SET status = :status WHERE id = :id");
        return $stmt->execute([':status' => $status, ':id' => $id]);
    }

    public function getOnlineAgents() {
        $stmt = $this->db->query("SELECT id, username, fullname, avatar, current_chat_count FROM users WHERE status = 'ONLINE' ORDER BY current_chat_count ASC");
        return $stmt->fetchAll();
    }

    /**
     * Thuật toán Chia tải: Tìm nhân viên đang ONLINE có ít hội thoại nhất
     */
    public function findAgentForAssignment() {
        // Cập nhật lại số lượng chat thực tế trước khi gán
        $this->syncChatCounts();

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
