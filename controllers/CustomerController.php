<?php
/**
 * CONTROLLER: CustomerController
 * Xử lý cập nhật hồ sơ khách hàng, giả lập Agent quét thực thể và đổi nhãn phân loại
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/CustomerProfile.php';
require_once __DIR__ . '/../models/Conversation.php';

class CustomerController {
    private CustomerProfile $profileModel;
    private Conversation $convModel;

    public function __construct() {
        $this->profileModel = new CustomerProfile();
        $this->convModel = new Conversation();
    }

    public function updateField($conversationId, $field, $value) {
        $success = $this->profileModel->updateManual($conversationId, $field, $value);
        return [
            'success' => $success,
            'message' => $success ? 'Cập nhật thành công' : 'Lỗi cập nhật trường dữ liệu'
        ];
    }

    public function scanAgentData($conversationId) {
        $profile = $this->profileModel->scanAgentData($conversationId);
        return [
            'success' => true,
            'message' => 'Agent đã bóc tách dữ liệu và cập nhật hồ sơ thành công',
            'profile' => $profile
        ];
    }

    public function updateCrmProfile($conversationId, array $data) {
        $success = $this->profileModel->updateCrmProfile($conversationId, $data);
        $updatedProfile = $this->profileModel->getByConversationId($conversationId);
        return [
            'success' => $success,
            'message' => $success ? 'Đã cập nhật hồ sơ khách hàng thành công' : 'Lỗi cập nhật hồ sơ',
            'profile' => $updatedProfile
        ];
    }
}
