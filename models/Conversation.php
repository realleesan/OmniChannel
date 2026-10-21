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

    public function create($channel, $externalSenderId, $senderName, $assignedUserId = null, $status = 'UNREPLIED', $tag = null) {
        $now = date('Y-m-d H:i:s');
        $stmt = $this->db->prepare("
            INSERT INTO conversations (channel, external_sender_id, sender_name, assigned_user_id, status, tag, last_message_at, created_at)
            VALUES (:channel, :external_sender_id, :sender_name, :assigned_user_id, :status, :tag, :now, :now2)
        ");
        $stmt->execute([
            ':channel'            => $channel,
            ':external_sender_id' => $externalSenderId,
            ':sender_name'        => $senderName,
            ':assigned_user_id'   => $assignedUserId,
            ':status'             => $status,
            ':tag'                => $tag,
            ':now'                => $now,
            ':now2'               => $now
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
        $conv = $stmt->fetch();
        if ($conv) {
            $conv['assigned_avatar'] = User::getAvatarUrl($conv['assigned_avatar'] ?? '', $conv['assigned_user_id'] ?? 0);
        }
        return $conv;
    }

    /**
     * Lấy danh sách hội thoại theo bộ lọc (Tab: all, mine, unreplied; Dropdown unreplied: all, mine; Label filter, Channel filter; Search)
     */
    public function getFilteredList($currentUserId, $tab = 'all', $unrepliedScope = 'all', $search = '', $labelId = 0, $channel = '') {
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

        // 1. Phân loại theo Tab (Nếu đang có từ khóa tìm kiếm thì bỏ qua giới hạn của Tab để tìm kiếm xuyên suốt toàn bộ khách hàng)
        if (empty($search)) {
            if ($tab === 'mine') {
                $sql .= " AND c.assigned_user_id = :current_user_id";
                $params[':current_user_id'] = $currentUserId;
            } elseif ($tab === 'unreplied') {
                // Tab Chưa đọc: xét is_read = 0 hoặc status = 'UNREPLIED'
                $sql .= " AND (c.is_read = 0 OR c.status = 'UNREPLIED')";
                if ($unrepliedScope === 'mine') {
                    $sql .= " AND c.assigned_user_id = :current_user_id";
                    $params[':current_user_id'] = $currentUserId;
                }
            }
        }

        // 2. Lọc theo Kênh (Webchat, Facebook, Zalo)
        if (!empty($channel) && in_array(strtoupper($channel), ['WEBCHAT', 'FACEBOOK', 'ZALO'])) {
            $sql .= " AND c.channel = :channel";
            $params[':channel'] = strtoupper($channel);
        }

        // 3. Lọc theo Nhãn phân loại tùy biến
        if (!empty($labelId) && (int)$labelId > 0) {
            $sql .= " AND c.id IN (SELECT conversation_id FROM conversation_labels WHERE label_id = :label_id)";
            $params[':label_id'] = (int)$labelId;
        }

        // 4. Tìm kiếm toàn diện theo Tên khách hàng hoặc BẤT KỲ tin nhắn nào trong lịch sử trò chuyện
        if (!empty($search)) {
            $sql .= " AND (
                c.sender_name LIKE :search 
                OR c.last_message LIKE :search 
                OR EXISTS (
                    SELECT 1 FROM messages m 
                    WHERE m.conversation_id = c.id 
                    AND m.content LIKE :search
                )
            )";
            $params[':search'] = '%' . trim($search) . '%';
        }

        // 5. Sắp xếp theo thời gian từ mới nhất đến cũ nhất
        $sql .= " ORDER BY c.last_message_at DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $conversations = $stmt->fetchAll();

        if (empty($conversations)) {
            return [];
        }

        // Lấy danh sách nhãn gắn cho các hội thoại này
        $convIds = array_column($conversations, 'id');
        $labelsMap = [];
        if (!empty($convIds)) {
            $inClause = implode(',', array_map('intval', $convIds));
            $labelStmt = $this->db->query("
                SELECT cl.conversation_id, l.id, l.name, l.color, l.icon
                FROM conversation_labels cl
                JOIN labels l ON cl.label_id = l.id
                WHERE cl.conversation_id IN ($inClause)
                ORDER BY l.name ASC
            ");
            while ($row = $labelStmt->fetch()) {
                $labelsMap[$row['conversation_id']][] = [
                    'id'    => (int)$row['id'],
                    'name'  => $row['name'],
                    'color' => $row['color'],
                    'icon'  => $row['icon']
                ];
            }
        }

        // Bổ sung cờ xác định quyền (is_mine, is_view_only), nhãn và định dạng thời gian
        foreach ($conversations as &$conv) {
            $conv['is_mine'] = ($conv['assigned_user_id'] == $currentUserId);
            $conv['is_view_only'] = (!empty($conv['assigned_user_id']) && $conv['assigned_user_id'] != $currentUserId);
            $conv['assigned_avatar'] = User::getAvatarUrl($conv['assigned_avatar'] ?? '', $conv['assigned_user_id'] ?? 0);
            $conv['time_ago'] = timeAgo($conv['last_message_at']);
            $conv['labels'] = $labelsMap[$conv['id']] ?? [];

            // Định dạng ngày giờ chuẩn các app chat lớn (Hôm nay: HH:mm, Hôm qua: HH:mm Hôm qua, Cũ hơn: HH:mm d/m hoặc d/m/Y)
            $conv['short_time'] = formatChatTime($conv['last_message_at']);

            $msgTime = !empty($conv['last_message_at']) ? strtotime($conv['last_message_at']) : time();
            $waitingSeconds = time() - $msgTime;
            $waitingMinutes = max(0, floor($waitingSeconds / 60));
            $conv['waiting_minutes'] = $waitingMinutes;
        }

        return $conversations;
    }

    /**
     * Đánh dấu cuộc hội thoại đã được đọc
     */
    public function markAsRead($id) {
        $stmt = $this->db->prepare("UPDATE conversations SET is_read = 1, last_message_at = last_message_at WHERE id = :id");
        return $stmt->execute([':id' => $id]);
    }

    /**
     * Cập nhật trạng thái khách hàng đã xem (Seen) qua Webchat/kênh kết nối
     */
    public function setCustomerSeen($id, $seen = 1) {
        $stmt = $this->db->prepare("UPDATE conversations SET customer_seen = :seen WHERE id = :id");
        return $stmt->execute([':seen' => $seen, ':id' => $id]);
    }

    public function setCustomerSeenByExternalId($externalSenderId, $seen = 1) {
        $stmt = $this->db->prepare("UPDATE conversations SET customer_seen = :seen WHERE external_sender_id = :ext_id");
        return $stmt->execute([':seen' => $seen, ':ext_id' => $externalSenderId]);
    }

    public function updateLastMessage($id, $content, $senderType = 'CUSTOMER', $status = null) {
        $now = date('Y-m-d H:i:s');
        $sql = "UPDATE conversations SET last_message = :content, last_sender_type = :sender_type, last_message_at = :now";
        $params = [
            ':content'     => $content,
            ':sender_type' => $senderType,
            ':now'         => $now,
            ':id'          => $id
        ];

        // Nếu nhân viên gửi thì đánh dấu nhân viên đã đọc, nhưng khách CHƯA xem (customer_seen = 0)
        // Nếu khách gửi thì đánh dấu nhân viên chưa đọc (is_read = 0)
        if ($senderType === 'STAFF') {
            $sql .= ", is_read = 1, customer_seen = 0";
        } else {
            $sql .= ", is_read = 0, customer_seen = 1";
        }

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

    public function updateSenderName($id, $senderName) {
        $stmt = $this->db->prepare("UPDATE conversations SET sender_name = :sender_name WHERE id = :id");
        return $stmt->execute([':sender_name' => $senderName, ':id' => $id]);
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

        // Nếu chưa gán hoặc nhân viên phụ trách đã OFFLINE (do Đăng xuất hoặc Hết ca)
        if (!$assignedUser || $assignedUser['status'] === 'OFFLINE') {
            $availableAgent = $userModel->findAgentForAssignment();
            if ($availableAgent) {
                if (!$assignedUser || $availableAgent['id'] != $assignedUser['id']) {
                    $this->assignToUser($conversationId, $availableAgent['id']);
                    return $availableAgent['id'];
                }
            } else {
                // Toàn bộ nhân viên đều đã OFFLINE/hết ca: Giải phóng khỏi nhân viên đã đăng xuất, chuyển về Chưa gán
                if (!empty($conv['assigned_user_id'])) {
                    $this->assignToUser($conversationId, null);
                }
                return null;
            }
        }
        return false;
    }

    /**
     * Tìm kiếm toàn diện chuẩn phong cách Zalo: Phân tách Khách hàng và Tin nhắn
     */
    public function searchZalo($keyword, $currentUserId) {
        $clean = trim((string)$keyword);
        if (empty($clean)) {
            return ['customers' => [], 'messages' => []];
        }
        $param = '%' . $clean . '%';

        // 1. Tìm Khách hàng: khớp sender_name, SĐT hoặc real_name/phone trong customer_profiles
        $custStmt = $this->db->prepare("
            SELECT c.*, 
                   u.fullname AS assigned_fullname, 
                   u.avatar AS assigned_avatar,
                   cp.real_name,
                   cp.phone AS customer_phone
            FROM conversations c
            LEFT JOIN users u ON c.assigned_user_id = u.id
            LEFT JOIN customer_profiles cp ON c.id = cp.conversation_id
            WHERE c.sender_name LIKE :kw1 
               OR cp.real_name LIKE :kw2 
               OR cp.phone LIKE :kw3
            ORDER BY c.last_message_at DESC
        ");
        $custStmt->execute([
            ':kw1' => $param,
            ':kw2' => $param,
            ':kw3' => $param
        ]);
        $customers = $custStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($customers as &$c) {
            $c['is_mine'] = ($c['assigned_user_id'] == $currentUserId);
            $c['is_view_only'] = (!empty($c['assigned_user_id']) && $c['assigned_user_id'] != $currentUserId);
            $c['assigned_avatar'] = User::getAvatarUrl($c['assigned_avatar'] ?? '', $c['assigned_user_id'] ?? 0);
            $c['short_time'] = formatChatTime($c['last_message_at']);
        }

        // 2. Tìm Tin nhắn: khớp nội dung content trong bảng messages
        $msgStmt = $this->db->prepare("
            SELECT m.id, m.conversation_id, m.sender_type, m.sender_id, m.content, m.attachment_url, m.created_at,
                   c.channel, c.sender_name, c.assigned_user_id,
                   u.fullname AS assigned_fullname
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            LEFT JOIN users u ON c.assigned_user_id = u.id
            WHERE m.content LIKE :mkw
            ORDER BY m.created_at DESC
            LIMIT 50
        ");
        $msgStmt->execute([':mkw' => $param]);
        $messages = $msgStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($messages as &$m) {
            $m['is_mine'] = ($m['assigned_user_id'] == $currentUserId);
            $m['time_formatted'] = formatChatTime($m['created_at']);
        }

        return [
            'customers' => $customers,
            'messages'  => $messages
        ];
    }
}
