<?php
/**
 * API: zalo_action.php
 * Cổng giao tiếp hai chiều giữa OmniChannel CRM Frontend/Backend và Dedicated Zalo Gateway
 * Tách biệt hoàn toàn, an toàn và dễ bảo trì
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Gateway-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../controllers/ZaloController.php';

// Đọc input JSON hoặc form POST
$rawInput = file_get_contents('php://input');
$jsonBody = json_decode($rawInput, true);

$action = $_POST['action'] ?? $_GET['action'] ?? ($jsonBody['action'] ?? '');
$zaloController = new ZaloController();

$gatewayUrl = defined('ZALO_GATEWAY_URL') ? rtrim(ZALO_GATEWAY_URL, '/') : 'https://omnichannel-zalo-gateway.onrender.com';
$gatewayKey = defined('ZALO_GATEWAY_KEY') ? ZALO_GATEWAY_KEY : 'omnichannel_zalo_secret_2026';

/**
 * 1. TIẾP NHẬN WEBHOOK TỪ RENDER ZALO GATEWAY
 */
if ($action === 'inbound_message' || $action === 'account_connected' || $action === 'account_disconnected' || !empty($_SERVER['HTTP_X_GATEWAY_KEY'])) {
    $payload = is_array($jsonBody) ? $jsonBody : $_POST;
    if (empty($payload['action'])) {
        $payload['action'] = $action;
    }

    $res = $zaloController->handleInboundWebhook($payload);
    echo json_encode($res, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 2. CÁC HÀNH ĐỘNG DÀNH CHO GIAO DIỆN CRM WORKSPACE
 */
switch ($action) {
    /**
     * Lấy danh sách tài khoản Zalo đã kết nối
     */
    case 'get_accounts':
        $accounts = $zaloController->getAccountsList();
        echo json_encode([
            'success'  => true,
            'accounts' => $accounts
        ], JSON_UNESCAPED_UNICODE);
        break;

    /**
     * Khởi tạo phiên quét mã QR (gọi sang Gateway)
     */
    case 'generate_qr':
        $ch = curl_init($gatewayUrl . '/api/zalo/qr/generate');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err || $httpCode !== 200) {
            echo json_encode([
                'success' => false,
                'message' => 'Không thể kết nối máy chủ Zalo Gateway (' . ($err ?: "HTTP $httpCode") . ')'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        echo $res;
        break;

    /**
     * Kiểm tra trạng thái phiên quét mã QR (Polling từ modal)
     */
    case 'check_qr_status':
        $sessionId = $_GET['session_id'] ?? $_POST['session_id'] ?? '';
        if (empty($sessionId)) {
            echo json_encode(['success' => false, 'message' => 'Thiếu session_id'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $url = $gatewayUrl . '/api/zalo/qr/status?session_id=' . urlencode($sessionId);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $res = curl_exec($ch);
        curl_close($ch);

        echo $res ?: json_encode(['success' => false, 'message' => 'Lỗi kết nối kiểm tra QR']);
        break;

    /**
     * Ngắt kết nối một tài khoản Zalo
     */
    case 'disconnect':
        $accountId = $_POST['account_id'] ?? '';
        if (empty($accountId)) {
            echo json_encode(['success' => false, 'message' => 'Thiếu account_id'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Gọi sang Gateway để xóa khỏi Map
        $ch = curl_init($gatewayUrl . '/api/zalo/disconnect');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['account_id' => $accountId, 'gateway_key' => $gatewayKey]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Gateway-Key: ' . $gatewayKey
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        @curl_exec($ch);
        @curl_close($ch);

        // Cập nhật CSDL CRM
        $accountModel = new ZaloAccount();
        $accountModel->updateStatus($accountId, 'DISCONNECTED');

        echo json_encode(['success' => true, 'message' => 'Đã ngắt kết nối tài khoản Zalo'], JSON_UNESCAPED_UNICODE);
        break;

    /**
     * Gửi tin nhắn trả lời từ nhân viên tới khách Zalo
     */
    case 'send_reply':
        $conversationId = (int)($_POST['conversation_id'] ?? 0);
        $content        = trim($_POST['content'] ?? '');
        $attachmentUrl  = trim($_POST['attachment_url'] ?? '');

        if ($conversationId <= 0 || empty($content)) {
            echo json_encode(['success' => false, 'message' => 'Thiếu conversation_id hoặc nội dung tin nhắn'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $res = $zaloController->forwardReplyToZalo($conversationId, $content, $attachmentUrl);
        echo json_encode($res, JSON_UNESCAPED_UNICODE);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Hành động không hợp lệ'], JSON_UNESCAPED_UNICODE);
        break;
}
