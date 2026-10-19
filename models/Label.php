<?php
/**
 * MODEL: Label
 * Quản lý nhãn phân loại hội thoại tùy biến và gắn nhãn (Custom Labels)
 */

require_once __DIR__ . '/../config/database.php';

class Label {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    /**
     * Lấy danh sách tất cả các nhãn trong hệ thống
     */
    public function getAll(): array {
        $stmt = $this->db->query("
            SELECT l.*, u.fullname AS creator_name,
                   (SELECT COUNT(*) FROM conversation_labels cl WHERE cl.label_id = l.id) AS usage_count
            FROM labels l
            LEFT JOIN users u ON l.created_by_user_id = u.id
            ORDER BY l.id ASC
        ");
        return $stmt->fetchAll();
    }

    /**
     * Tạo nhãn mới với màu sắc và icon tùy chọn
     */
    public function create(string $name, string $color = '#3B82F6', string $icon = 'fa-solid fa-tag', ?int $userId = null): array {
        $name = trim($name);
        $color = trim($color) ?: '#3B82F6';
        $icon = trim($icon) ?: 'fa-solid fa-tag';

        if (empty($name)) {
            return ['success' => false, 'message' => 'Tên nhãn không được để trống'];
        }

        $stmt = $this->db->prepare("
            INSERT INTO labels (name, color, icon, created_by_user_id, created_at)
            VALUES (:name, :color, :icon, :created_by_user_id, NOW())
        ");
        $stmt->execute([
            ':name'               => $name,
            ':color'              => $color,
            ':icon'               => $icon,
            ':created_by_user_id' => $userId
        ]);

        $newId = (int)$this->db->lastInsertId();
        return [
            'success' => true,
            'message' => 'Tạo nhãn thành công',
            'label'   => [
                'id'    => $newId,
                'name'  => $name,
                'color' => $color,
                'icon'  => $icon
            ]
        ];
    }

    /**
     * Lấy các nhãn của một hội thoại cụ thể
     */
    public function getLabelsForConversation(int $conversationId): array {
        $stmt = $this->db->prepare("
            SELECT l.id, l.name, l.color, l.icon
            FROM labels l
            JOIN conversation_labels cl ON l.id = cl.label_id
            WHERE cl.conversation_id = :cid
            ORDER BY l.name ASC
        ");
        $stmt->execute([':cid' => $conversationId]);
        return $stmt->fetchAll();
    }

    /**
     * Gán hoặc hủy gán một nhãn cho hội thoại (toggle)
     */
    public function toggleLabel(int $conversationId, int $labelId): array {
        $checkStmt = $this->db->prepare("
            SELECT 1 FROM conversation_labels WHERE conversation_id = :cid AND label_id = :lid
        ");
        $checkStmt->execute([':cid' => $conversationId, ':lid' => $labelId]);
        $exists = $checkStmt->fetchColumn();

        if ($exists) {
            $delStmt = $this->db->prepare("
                DELETE FROM conversation_labels WHERE conversation_id = :cid AND label_id = :lid
            ");
            $delStmt->execute([':cid' => $conversationId, ':lid' => $labelId]);
            return ['success' => true, 'action' => 'removed', 'message' => 'Đã gỡ nhãn'];
        } else {
            $addStmt = $this->db->prepare("
                INSERT INTO conversation_labels (conversation_id, label_id, assigned_at)
                VALUES (:cid, :lid, NOW())
            ");
            $addStmt->execute([':cid' => $conversationId, ':lid' => $labelId]);
            return ['success' => true, 'action' => 'added', 'message' => 'Đã gắn nhãn'];
        }
    }
}
