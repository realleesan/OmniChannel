<?php
/**
 * MODEL: Message
 * Quản lý tin nhắn chi tiết, tệp đính kèm và phân loại người gửi (CUSTOMER / STAFF)
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/Conversation.php';

class Message {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function create($conversationId, $senderType, $senderId, $content, $attachmentUrl = null) {
        $now = date('Y-m-d H:i:s');
        $stmt = $this->db->prepare("
            INSERT INTO messages (conversation_id, sender_type, sender_id, content, attachment_url, created_at)
            VALUES (:conversation_id, :sender_type, :sender_id, :content, :attachment_url, :created_at)
        ");
        $stmt->execute([
            ':conversation_id' => $conversationId,
            ':sender_type'     => $senderType,
            ':sender_id'       => $senderId,
            ':content'         => $content,
            ':attachment_url'  => $attachmentUrl,
            ':created_at'      => $now
        ]);
        $messageId = (int)$this->db->lastInsertId();

        // Cập nhật last_message và last_sender_type cho hội thoại
        $convModel = new Conversation();
        $newStatus = ($senderType === 'STAFF') ? 'CHATTING' : 'UNREPLIED';
        $convModel->updateLastMessage($conversationId, $content, $senderType, $newStatus);

        return $messageId;
    }

    public function getByConversationId($conversationId) {
        $stmt = $this->db->prepare("
            SELECT m.*, u.fullname AS staff_name, u.avatar AS staff_avatar
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id AND m.sender_type = 'STAFF'
            WHERE m.conversation_id = :conversation_id
            ORDER BY m.created_at ASC, m.id ASC
        ");
        $stmt->execute([':conversation_id' => $conversationId]);
        $messages = $stmt->fetchAll();

        foreach ($messages as &$msg) {
            $msg['time_formatted'] = formatChatTime($msg['created_at']);
        }
        return $messages;
    }

    public function getLatestAfterId($conversationId, $lastId) {
        $stmt = $this->db->prepare("
            SELECT m.*, u.fullname AS staff_name, u.avatar AS staff_avatar
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id AND m.sender_type = 'STAFF'
            WHERE m.conversation_id = :conversation_id AND m.id > :last_id
            ORDER BY m.created_at ASC, m.id ASC
        ");
        $stmt->execute([':conversation_id' => $conversationId, ':last_id' => $lastId]);
        $messages = $stmt->fetchAll();

        foreach ($messages as &$msg) {
            $msg['time_formatted'] = formatChatTime($msg['created_at']);
        }
        return $messages;
    }
}
