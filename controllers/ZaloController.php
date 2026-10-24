<?php
/**
 * CONTROLLER: ZaloController
 * Bộ điều khiển chuyên trách cho kênh Zalo Cá Nhân (zca-js)
 * Hoàn toàn tách biệt khỏi luồng Webchat/Facebook để đảm bảo tính module hóa và dễ bảo trì
 */

require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/ZaloAccount.php';
require_once __DIR__ . '/../models/Conversation.php';
require_once __DIR__ . '/../models/Message.php';
require_once __DIR__ . '/ChatController.php';

class ZaloController {
    private ZaloAccount $accountModel;
    private Conversation $convModel;
    private Message $msgModel;
    private ChatController $chatController;

    public function __construct() {
        $this->accountModel   = new ZaloAccount();
        $this->convModel      = new Conversation();
        $this->msgModel       = new Message();
        $this->chatController = new ChatController();
    }

    /**
     * Xác thực khóa bảo mật giữa Zalo Gateway và CRM
     */
    public function verifyGatewayKey($providedKey): bool {
        $expectedKey = defined('ZALO_GATEWAY_KEY') ? trim(ZALO_GATEWAY_KEY) : 'omnichannel_zalo_secret_2026';
        $providedKey = trim((string)$providedKey);
        // Làm sạch ký tự tàng hình nếu có
        $expectedKey = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $expectedKey);
        $providedKey = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $providedKey);
        return (!empty($providedKey) && hash_equals($expectedKey, $providedKey));
    }

    /**
     * Tiếp nhận Webhook từ Render Zalo Gateway
     */
    public function handleInboundWebhook(array $payload): array {
        $key = $payload['gateway_key'] ?? $_SERVER['HTTP_X_GATEWAY_KEY'] ?? '';
        $isLoggedInStaff = !empty($_SESSION['user_id']); // Nhân viên đang mở phiên làm việc CRM

        if (!$isLoggedInStaff && !$this->verifyGatewayKey($key)) {
            return ['success' => false, 'message' => 'Không được phép: Sai hoặc thiếu Gateway Secret Key'];
        }

        $action = $payload['action'] ?? '';

        switch ($action) {
            case 'account_connected':
                $accountId   = $payload['account_id'] ?? '';
                $accountName = $payload['account_name'] ?? ('Zalo ' . substr($accountId, -4));
                $avatar      = $payload['account_avatar'] ?? null;
                $configAt    = $payload['configured_at'] ?? (time() * 1000);

                if (!empty($accountId)) {
                    $this->accountModel->upsert($accountId, $accountName, $avatar, $configAt, 'CONNECTED');
                }
                return ['success' => true, 'message' => 'Đã đồng bộ tài khoản Zalo kết nối'];

            case 'account_disconnected':
                $accountId = $payload['account_id'] ?? '';
                if (!empty($accountId)) {
                    $this->accountModel->updateStatus($accountId, 'DISCONNECTED');
                }
                return ['success' => true, 'message' => 'Đã cập nhật trạng thái ngắt kết nối'];

            case 'inbound_message':
                $customerZaloId = trim($payload['customer_zalo_id'] ?? '');
                $customerName   = trim($payload['customer_name'] ?? 'Khách Zalo');
                $messageText    = trim($payload['message_text'] ?? '');
                $customerAvatar = trim($payload['customer_avatar'] ?? '');
                $attachmentUrl  = trim($payload['attachment_url'] ?? '');

                if (empty($customerZaloId) || (empty($messageText) && empty($attachmentUrl))) {
                    return ['success' => false, 'message' => 'Thiếu customer_zalo_id hoặc message_text'];
                }

                // Tự động tiếp nhận, gán nhân viên (Round-Robin) và tạo/cập nhật Conversation kênh ZALO
                $result = $this->chatController->receiveCustomerMessage(
                    'ZALO',
                    $customerZaloId,
                    $customerName,
                    $messageText,
                    $attachmentUrl ?: null,
                    null,
                    $customerAvatar ?: null
                );

                return [
                    'success'         => true,
                    'conversation_id' => $result['conversation_id'] ?? null,
                    'message_id'      => $result['message_id'] ?? null
                ];

            default:
                return ['success' => false, 'message' => 'Hành động webhook không được hỗ trợ'];
        }
    }

    /**
     * Chuyển tiếp tin nhắn trả lời của nhân viên từ CRM sang Zalo khách qua Render Gateway
     */
    public function forwardReplyToZalo($conversationId, $content, $attachmentUrl = null): array {
        $conv = $this->convModel->getById($conversationId);
        if (!$conv || $conv['channel'] !== 'ZALO') {
            return ['success' => false, 'message' => 'Hội thoại không thuộc kênh Zalo'];
        }

        $customerZaloId = $conv['external_sender_id'];
        $gatewayUrl = defined('ZALO_GATEWAY_URL') ? rtrim(ZALO_GATEWAY_URL, '/') : 'https://omnichannel-zalo-gateway.onrender.com';
        $gatewayKey = defined('ZALO_GATEWAY_KEY') ? ZALO_GATEWAY_KEY : 'omnichannel_zalo_secret_2026';

        $payload = [
            'gateway_key'      => $gatewayKey,
            'customer_zalo_id' => $customerZaloId,
            'content'          => $content
        ];

        if (!empty($attachmentUrl)) {
            $urls = [];
            $trimmed = trim((string)$attachmentUrl);
            if (str_starts_with($trimmed, '[') && str_ends_with($trimmed, ']')) {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    $urls = array_filter(array_map('trim', $decoded));
                }
            }
            if (empty($urls)) {
                $urls = array_filter(array_map('trim', explode(',', $trimmed)));
            }

            $attachments = [];
            foreach ($urls as $u) {
                $item = ['url' => $u];
                // Thử đọc file cục bộ nếu URL thuộc về server này để gửi dạng Base64
                // Giúp Gateway Render nhận ngay ảnh mà không bị rào cản Anti-bot aes.js của InfinityFree chặn
                try {
                    $parsedPath = parse_url($u, PHP_URL_PATH);
                    if ($parsedPath) {
                        $cleanPath = ltrim($parsedPath, '/');
                        $candidates = [
                            __DIR__ . '/../' . $cleanPath,
                            dirname(__DIR__) . '/' . $cleanPath,
                            __DIR__ . '/../public/' . preg_replace('#^public/#', '', $cleanPath)
                        ];
                        foreach ($candidates as $cand) {
                            if (file_exists($cand) && !is_dir($cand) && filesize($cand) > 50) {
                                $item['filename'] = basename($cand);
                                $item['base64'] = base64_encode(file_get_contents($cand));
                                break;
                            }
                        }
                    }
                } catch (Throwable $e) {}

                // Nếu chưa có base64 và là link ngoài (Google Sheets / CDN), thử tải trực tiếp
                if (empty($item['base64']) && (strpos($u, 'google') !== false || strpos($u, 'http') === 0)) {
                    try {
                        $chImg = curl_init($u);
                        curl_setopt($chImg, CURLOPT_RETURNTRANSFER, true);
                        curl_setopt($chImg, CURLOPT_TIMEOUT, 6);
                        curl_setopt($chImg, CURLOPT_FOLLOWLOCATION, true);
                        curl_setopt($chImg, CURLOPT_SSL_VERIFYPEER, false);
                        curl_setopt($chImg, CURLOPT_USERAGENT, 'Mozilla/5.0');
                        $imgBin = curl_exec($chImg);
                        $code = curl_getinfo($chImg, CURLINFO_HTTP_CODE);
                        curl_close($chImg);
                        if ($code === 200 && !empty($imgBin) && strlen($imgBin) > 50) {
                            $item['filename'] = 'image_' . md5($u) . '.jpg';
                            $item['base64'] = base64_encode($imgBin);
                        }
                    } catch (Throwable $e) {}
                }

                $attachments[] = $item;
            }

            $payload['attachments'] = $attachments;
        }

        $ch = curl_init($gatewayUrl . '/api/zalo/send');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Gateway-Key: ' . $gatewayKey
        ]);

        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            return ['success' => false, 'message' => 'Lỗi kết nối Zalo Gateway: ' . $err];
        }

        $json = json_decode($res, true);
        if ($httpCode === 200 && !empty($json['success'])) {
            return ['success' => true, 'data' => $json];
        }

        return [
            'success'  => false, 
            'message'  => $json['message'] ?? 'Gateway Zalo phản hồi lỗi (HTTP ' . $httpCode . ')'
        ];
    }

    /**
     * Lấy danh sách các tài khoản Zalo đã kết nối
     */
    public function getAccountsList(): array {
        return $this->accountModel->getAll();
    }
}
