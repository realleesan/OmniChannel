<?php
/**
 * MODEL: Conversation
 * Quản lý hội thoại đa kênh, gán nhân viên, kiểm tra khóa View-only và chuyển ca
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/User.php';

class Conversation {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function findByExternalSender($channel, $externalSenderId) {
        $stmt = $this->db->prepare("SELECT * FROM conversations WHERE channel = :channel AND external_sender_id = :external_sender_id");
        $stmt->execute([
            ':channel' => $channel,
            ':external_sender_id' => $externalSenderId
        ]);
        return $stmt->fetch();
    }

    public function create($channel, $externalSenderId, $senderName, $assignedUserId = null, $status = 'UNREPLIED', $tag = 'DANG_TU_VAN') {
        $stmt = $this->db->prepare("
            INSERT INTO conversations (channel, external_sender_id, sender_name, assigned_user_id, status, tag, last_message_at)
            VALUES (:channel, :external_sender_id, :sender_name, :assigned_user_id, :status, :tag, NOW())
        ");
        $stmt->execute([
            ':channel'            => $channel,
            ':external_sender_id' => $externalSenderId,
            ':sender_name'        => $senderName,
            ':assigned_user_id'   => $assignedUserId,
            ':status'             => $status,
            ':tag'                => $tag
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getById($id) {
        $stmt = $this->db->prepare("
            SELECT c.*, 
                   u.fullname AS assigned_fullname, 
                   u.avatar AS assigned_avatar, 
                   u.status AS assigned_user_status,
                   cp.is_boom_risk,
                   cp.preferred_size,
                   cp.scan_version
            FROM conversations c
            LEFT JOIN users u ON c.assigned_user_id = u.id
            LEFT JOIN customer_profiles cp ON c.id = cp.conversation_id
            WHERE c.id = :id
        ");
        $stmt->execute([':id' => $id]);
        return $stmt->fetch();
    }

    /**
     * Lấy danh sách hội thoại theo bộ lọc (Tab Tất cả / Của tôi / Chưa trả lời / Tìm kiếm)
     */
    public function getFilteredList($currentUserId, $tab = 'all', $onlyUnreplied = false, $search = '') {
        $sql = "
            SELECT c.*, 
                   u.fullname AS assigned_fullname, 
                   u.avatar AS assigned_avatar,
                   u.status AS assigned_user_status,
                   cp.is_boom_risk,
                   cp.preferred_size
            FROM conversations c
            LEFT JOIN users u ON c.assigned_user_id = u.id
            LEFT JOIN customer_profiles cp ON c.id = cp.conversation_id
            WHERE 1=1
        ";
        $params = [];

        // Tab "Của tôi"
        if ($tab === 'mine') {
            $sql .= " AND c.assigned_user_id = :current_user_id";
            $params[':current_user_id'] = $currentUserId;
        }

        // Chip lọc "Chưa trả lời"
        if ($onlyUnreplied) {
            $sql .= " AND c.status = 'UNREPLIED'";
        }

        // Tìm kiếm theo tên khách, nội dung hoặc mã kênh
        if (!empty($search)) {
            $sql .= " AND (c.sender_name LIKE :search OR c.last_message LIKE :search OR c.external_sender_id LIKE :search)";
            $params[':search'] = '%' . trim($search) . '%';
        }

        // Sắp xếp theo ưu tiên: Nếu lọc Chưa trả lời thì tin chờ lâu nhất lên trước (FIFO), ngược lại tin chưa trả lời lên trước rồi đến tin mới nhất
        if ($onlyUnreplied) {
            $sql .= " ORDER BY c.last_message_at ASC";
        } else {
            $sql .= " ORDER BY (c.status = 'UNREPLIED') DESC, c.last_message_at DESC";
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $conversations = $stmt->fetchAll();

        // Bổ sung cờ xác định quyền (is_mine, is_view_only) và thời gian chờ
        foreach ($conversations as &$conv) {
            $conv['is_mine'] = ($conv['assigned_user_id'] == $currentUserId);
            $conv['is_view_only'] = (!empty($conv['assigned_user_id']) && $conv['assigned_user_id'] != $currentUserId);
            $conv['time_ago'] = timeAgo($conv['last_message_at']);

            $waitingSeconds = time() - strtotime($conv['last_message_at']);
            $waitingMinutes = max(0, floor($waitingSeconds / 60));
            $conv['waiting_minutes'] = $waitingMinutes;
            if ($conv['status'] === 'UNREPLIED') {
                if ($waitingMinutes < 1) {
                    $conv['waiting_label'] = 'Chờ phản hồi';
                } elseif ($waitingMinutes < 60) {
                    $conv['waiting_label'] = "Chờ {$waitingMinutes}p";
                } else {
                    $conv['waiting_label'] = "Chờ " . floor($waitingMinutes / 60) . "h";
                }
            } else {
                $conv['waiting_label'] = '';
            }
        }

        return $conversations;
    }

    /**
     * Đếm số lượng hội thoại theo từng tab phục vụ badge real-time
     */
    public function getCounts($currentUserId) {
        $stmt = $this->db->prepare("
            SELECT 
                COUNT(*) as total_all,
                SUM(CASE WHEN assigned_user_id = :uid THEN 1 ELSE 0 END) as total_mine,
                SUM(CASE WHEN status = 'UNREPLIED' THEN 1 ELSE 0 END) as total_unreplied
            FROM conversations
        ");
        $stmt->execute([':uid' => $currentUserId]);
        $row = $stmt->fetch();
        return [
            'all'       => (int)($row['total_all'] ?? 0),
            'mine'      => (int)($row['total_mine'] ?? 0),
            'unreplied' => (int)($row['total_unreplied'] ?? 0)
        ];
    }

    public function updateLastMessage($id, $content, $status = null) {
        $sql = "UPDATE conversations SET last_message = :content, last_message_at = NOW()";
        $params = [':content' => $content, ':id' => $id];

        if ($status !== null) {
            $sql .= ", status = :status";
            $params[':status'] = $status;
        }

        $sql .= " WHERE id = :id";
        $stmt = $this->db->prepare($sql);
        return $stmt->execute($params);
    }

    public function assignToUser($id, $userId) {
        $stmt = $this->db->prepare("UPDATE conversations SET assigned_user_id = :user_id WHERE id = :id");
        $res = $stmt->execute([':user_id' => $userId, ':id' => $id]);
        
        $userModel = new User();
        $userModel->syncChatCounts();
        return $res;
    }

    public function updateTag($id, $tag) {
        if (!array_key_exists($tag, TAGS)) return false;
        $stmt = $this->db->prepare("UPDATE conversations SET tag = :tag WHERE id = :id");
        return $stmt->execute([':tag' => $tag, ':id' => $id]);
    }

    public function updateStatus($id, $status) {
        $stmt = $this->db->prepare("UPDATE conversations SET status = :status WHERE id = :id");
        return $stmt->execute([':status' => $status, ':id' => $id]);
    }

    /**
     * UC2.3: Xử lý Chuyển ca tự động khi có tin mới từ khách
     * Nếu nhân viên phụ trách đang OFFLINE, tự động chuyển giao cho nhân viên đang ONLINE
     */
    public function checkAndTransferShiftIfNeeded($conversationId) {
        $conv = $this->getById($conversationId);
        if (!$conv) return false;

        $userModel = new User();
        $assignedUser = $conv['assigned_user_id'] ? $userModel->findById($conv['assigned_user_id']) : null;

        // Nếu chưa gán hoặc nhân viên phụ trách đã OFFLINE
        if (!$assignedUser || $assignedUser['status'] === 'OFFLINE') {
            $availableAgent = $userModel->findAgentForAssignment();
            if ($availableAgent && (!$assignedUser || $availableAgent['id'] != $assignedUser['id'])) {
                $this->assignToUser($conversationId, $availableAgent['id']);
                return $availableAgent['id'];
            }
        }
        return false;
    }
}
