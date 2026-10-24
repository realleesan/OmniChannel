<?php
/**
 * MODEL: ZaloAccount
 * Quản lý các tài khoản Zalo cá nhân kết nối vào hệ thống OmniChannel CRM
 * Độc lập, tự động khởi tạo bảng nếu chưa có (Self-healing schema)
 */

require_once __DIR__ . '/../config/database.php';

class ZaloAccount {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();

        // Tự động kiểm tra và khởi tạo bảng zalo_accounts nếu chưa tồn tại
        static $checkedSchema = false;
        if (!$checkedSchema) {
            $checkedSchema = true;
            try {
                $this->db->exec("
                    CREATE TABLE IF NOT EXISTS zalo_accounts (
                        id VARCHAR(100) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        avatar TEXT NULL,
                        status VARCHAR(50) DEFAULT 'CONNECTED',
                        configured_at BIGINT NULL,
                        last_active_at DATETIME NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                ");
            } catch (Throwable $e) {
                error_log('[ZaloAccount Schema Error]: ' . $e->getMessage());
            }
        }
    }

    /**
     * Lưu hoặc cập nhật thông tin tài khoản Zalo đã kết nối
     */
    public function upsert($id, $name, $avatar = null, $configuredAt = null, $status = 'CONNECTED') {
        $now = date('Y-m-d H:i:s');
        $stmt = $this->db->prepare("
            INSERT INTO zalo_accounts (id, name, avatar, status, configured_at, last_active_at, created_at)
            VALUES (:id, :name, :avatar, :status, :configured_at, :now, :now)
            ON DUPLICATE KEY UPDATE 
                name = :name_update,
                avatar = COALESCE(:avatar_update, avatar),
                status = :status_update,
                configured_at = COALESCE(:configured_at_update, configured_at),
                last_active_at = :now_update
        ");

        return $stmt->execute([
            ':id'                     => (string)$id,
            ':name'                   => $name,
            ':avatar'                 => $avatar,
            ':status'                 => $status,
            ':configured_at'          => $configuredAt,
            ':now'                    => $now,
            ':name_update'            => $name,
            ':avatar_update'          => $avatar,
            ':status_update'          => $status,
            ':configured_at_update'   => $configuredAt,
            ':now_update'             => $now
        ]);
    }

    /**
     * Lấy tất cả tài khoản Zalo đã kết nối
     */
    public function getAll() {
        try {
            $stmt = $this->db->query("SELECT * FROM zalo_accounts ORDER BY created_at DESC");
            return $stmt->fetchAll();
        } catch (Throwable $e) {
            return [];
        }
    }

    /**
     * Lấy thông tin tài khoản theo ID
     */
    public function getById($id) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM zalo_accounts WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => (string)$id]);
            return $stmt->fetch();
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * Cập nhật trạng thái (CONNECTED, DISCONNECTED, ERROR)
     */
    public function updateStatus($id, $status) {
        $stmt = $this->db->prepare("
            UPDATE zalo_accounts 
            SET status = :status, last_active_at = NOW() 
            WHERE id = :id
        ");
        return $stmt->execute([':status' => $status, ':id' => (string)$id]);
    }

    /**
     * Xóa tài khoản Zalo khỏi hệ thống
     */
    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM zalo_accounts WHERE id = :id");
        return $stmt->execute([':id' => (string)$id]);
    }
}
