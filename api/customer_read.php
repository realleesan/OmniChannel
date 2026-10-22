<?php
/**
 * API: customer_read.php
 * Điểm cuối tiếp nhận tín hiệu "Khách hàng đã mở khung chat xem tin nhắn" (Customer Seen)
 * Hỗ trợ CORS đa miền (nhúng trên website đối tác)
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: *');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

while (ob_get_level() > 0) { @ob_end_clean(); }

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/Conversation.php';

$customerId = trim($_REQUEST['customer_id'] ?? '');

if (!empty($customerId)) {
    try {
        $convModel = new Conversation();
        $convModel->setCustomerSeenByExternalId($customerId, 1);
        echo json_encode(['success' => true, 'message' => 'Đã ghi nhận khách hàng đã xem']);
        exit;
    } catch (Throwable $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

echo json_encode(['success' => false, 'message' => 'Thiếu customer_id']);

