<?php
/**
 * CONTROLLER: ChatController
 * Điều phối xử lý hội thoại, tin nhắn, phân tải tự động, kiểm soát quyền View-Only và chuyển đổi ca
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/Conversation.php';
require_once __DIR__ . '/../models/Message.php';
require_once __DIR__ . '/../models/CustomerProfile.php';

class ChatController {
    private Conversation $convModel;
    private Message $msgModel;
    private User $userModel;
    private CustomerProfile $profileModel;

    public function __construct() {
        $this->convModel = new Conversation();
        $this->msgModel = new Message();
        $this->userModel = new User();
        $this->profileModel = new CustomerProfile();
    }

    /**
     * Lấy danh sách hội thoại cho Sidebar Trái
     */
    public function getConversations($userId, $tab = 'all', $onlyUnreplied = false, $search = '') {
        return $this->convModel->getFilteredList($userId, $tab, $onlyUnreplied, $search);
    }

    /**
     * Lấy chi tiết cuộc trò chuyện và lịch sử tin nhắn
     */
    public function getConversationDetail($conversationId, $currentUserId) {
        $conv = $this->convModel->getById($conversationId);
        if (!$conv) {
            return null;
        }

        // Kiểm tra quyền View-Only
        $isMine = ($conv['assigned_user_id'] == $currentUserId);
        $isViewOnly = (!empty($conv['assigned_user_id']) && !$isMine);

        $messages = $this->msgModel->getByConversationId($conversationId);
        $profile = $this->profileModel->getByConversationId($conversationId);

        return [
            'conversation' => $conv,
            'is_mine'      => $isMine,
            'is_view_only' => $isViewOnly,
            'messages'     => $messages,
            'profile'      => $profile
        ];
    }

    /**
     * Nhân viên gửi tin nhắn phản hồi
     */
    public function sendStaffMessage($conversationId, $userId, $content, $attachmentUrl = null) {
        $conv = $this->convModel->getById($conversationId);
        if (!$conv) {
            return ['success' => false, 'message' => 'Hội thoại không tồn tại'];
        }

        // UC2.2: Khóa View-Only - Ngăn chặn cướp đơn nếu hội thoại thuộc nhân viên khác
        if (!empty($conv['assigned_user_id']) && $conv['assigned_user_id'] != $userId) {
            return [
                'success' => false, 
                'message' => '🔒 Chế độ Chỉ xem (View-only) – Hội thoại đang do ' . $conv['assigned_fullname'] . ' phụ trách. Bạn không thể gửi tin nhắn.'
            ];
        }

        // Nếu hội thoại chưa được gán cho ai, tự động nhận cho nhân viên hiện tại
        if (empty($conv['assigned_user_id'])) {
            $this->convModel->assignToUser($conversationId, $userId);
        }

        $messageId = $this->msgModel->create($conversationId, 'STAFF', $userId, $content, $attachmentUrl);

        // Đẩy tin phản hồi của nhân viên sang Render Gateway để Widget Webchat nhận ngay
        if ($conv['channel'] === 'WEBCHAT' && defined('RENDER_GATEWAY_URL') && !empty(RENDER_GATEWAY_URL)) {
            $this->pushReplyToWebchatGateway($conv['external_sender_id'], $content);
        }

        return [
            'success'    => true, 
            'message_id' => $messageId,
            'data'       => [
                'id'             => $messageId,
                'content'        => $content,
                'sender_type'    => 'STAFF',
                'sender_id'      => $userId,
                'staff_name'     => $_SESSION['fullname'] ?? 'Nhân viên tư vấn',
                'attachment_url' => $attachmentUrl,
                'created_at'     => date('Y-m-d H:i:s'),
                'time_formatted' => date('H:i')
            ]
        ];
    }

    /**
     * Gửi bản sao tin nhắn trả lời của nhân viên tới Webchat Gateway
     */
    private function pushReplyToWebchatGateway($customerId, $content) {
        if (!defined('RENDER_GATEWAY_URL') || empty(RENDER_GATEWAY_URL)) return;
        $url = rtrim(RENDER_GATEWAY_URL, '/') . '/api/webchat/reply';
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'customer_id' => $customerId,
            'content'     => $content,
            'staff_name'  => $_SESSION['fullname'] ?? 'Nhân viên tư vấn'
        ]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_exec($ch);
        curl_close($ch);
    }

    /**
     * UC1.1, UC2.1, UC2.3: Tiếp nhận tin nhắn từ khách (Webchat, Facebook, Zalo, Shopee)
     * Tự động chia tải và tự động đổi ca khi nhân viên phụ trách rời ca
     */
    public function receiveCustomerMessage($channel, $externalSenderId, $senderName, $content, $attachmentUrl = null, $customerPhone = null) {
        $conv = $this->convModel->findByExternalSender($channel, $externalSenderId);
        $isNewConversation = false;

        if (!$conv) {
            // Hội thoại mới -> Áp dụng thuật toán chia tải UC2.1
            $isNewConversation = true;
            $bestAgent = $this->userModel->findAgentForAssignment();
            $assignedUserId = $bestAgent ? $bestAgent['id'] : null;

            $conversationId = $this->convModel->create(
                $channel,
                $externalSenderId,
                $senderName,
                $assignedUserId,
                'UNREPLIED',
                'DANG_TU_VAN'
            );

            // Khởi tạo hồ sơ khách hàng ban đầu
            $this->profileModel->getByConversationId($conversationId);
            if (!empty($customerPhone)) {
                $this->profileModel->updateManual($conversationId, 'recent_purchases', 'SĐT: ' . $customerPhone);
            }
        } else {
            $conversationId = $conv['id'];

            // Nếu tên khách thay đổi (ví dụ trước là "Khách Web..." nay có họ tên thật từ Pre-chat form)
            if (!empty($senderName) && $conv['sender_name'] !== $senderName) {
                $this->convModel->updateSenderName($conversationId, $senderName);
                $this->profileModel->updateManual($conversationId, 'customer_name', $senderName);
            }

            // Cập nhật SĐT nếu có
            if (!empty($customerPhone)) {
                $currentProfile = $this->profileModel->getByConversationId($conversationId);
                if (empty($currentProfile['recent_purchases']) || $currentProfile['recent_purchases'] === 'Chưa có thông tin' || $currentProfile['recent_purchases'] === 'Chưa có đơn hàng cũ') {
                    $this->profileModel->updateManual($conversationId, 'recent_purchases', 'SĐT: ' . $customerPhone);
                }
            }

            // UC2.3: Kiểm tra chuyển giao đổi ca nếu nhân viên phụ trách đã OFFLINE
            $transferredAgentId = $this->convModel->checkAndTransferShiftIfNeeded($conversationId);
        }

        // Lưu tin nhắn của khách vào CSDL (chỉ tạo khi có nội dung thực tế)
        $messageId = null;
        if (isset($content) && strlen(trim($content)) > 0) {
            $messageId = $this->msgModel->create($conversationId, 'CUSTOMER', null, $content, $attachmentUrl);
        }

        return [
            'success'             => true,
            'conversation_id'     => $conversationId,
            'message_id'          => $messageId,
            'is_new_conversation' => $isNewConversation
        ];
    }
}
