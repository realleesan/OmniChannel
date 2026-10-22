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

    /**
     * Bóc tách thông tin hồ sơ khách hàng tự động bằng Google Gemini AI
     */
    public function extractProfileWithAI($conversationId) {
        $db = Database::getConnection();

        // 1. Kiểm tra API Key
        $apiKey = env('GEMINI_API_KEY');
        if (empty($apiKey)) {
            // Kiểm tra trong hằng số hoặc cấu hình phụ
            if (defined('GEMINI_API_KEY') && !empty(constant('GEMINI_API_KEY'))) {
                $apiKey = constant('GEMINI_API_KEY');
            }
        }

        if (empty($apiKey)) {
            return [
                'success' => false,
                'message' => 'Hệ thống chưa được cấu hình GEMINI_API_KEY trong file .env. Vui lòng cấu hình API Key từ Google AI Studio.'
            ];
        }

        // 2. Lấy hồ sơ hiện tại và kiểm tra cơ chế chống lãng phí API (Smart Delta Detection)
        $currentProfile = $this->profileModel->getByConversationId($conversationId);
        $lastScannedId = (int)($currentProfile['last_scanned_msg_id'] ?? 0);

        // Kiểm tra ID tin nhắn mới nhất trong hội thoại
        $statStmt = $db->prepare("SELECT MAX(id) as max_id, COUNT(*) as total_cnt FROM messages WHERE conversation_id = :cid");
        $statStmt->execute([':cid' => $conversationId]);
        $stat = $statStmt->fetch();
        $maxMsgId = (int)($stat['max_id'] ?? 0);
        $totalMsgs = (int)($stat['total_cnt'] ?? 0);

        if ($totalMsgs === 0 || $maxMsgId === 0) {
            return [
                'success' => false,
                'no_new_info' => true,
                'message' => 'Chưa có tin nhắn nào trong cuộc trò chuyện để AI phân tích.'
            ];
        }

        // TẦNG 1: Đối chiếu ID tin nhắn - nếu hoàn toàn không có thêm tin nhắn nào kể từ lần quét trước
        if ($lastScannedId > 0 && $maxMsgId <= $lastScannedId) {
            return [
                'success' => false,
                'no_new_info' => true,
                'message' => 'Hội thoại chưa có tin nhắn mới kể từ lần cập nhật gần nhất.'
            ];
        }

        // TẦNG 2: Nếu có tin nhắn mới, kiểm tra xem có tin nhắn nào từ KHÁCH HÀNG (CUSTOMER) hay không
        if ($lastScannedId > 0 && $maxMsgId > $lastScannedId) {
            $custStmt = $db->prepare("
                SELECT id, content 
                FROM messages 
                WHERE conversation_id = :cid AND id > :last_id AND sender_type = 'CUSTOMER'
            ");
            $custStmt->execute([':cid' => $conversationId, ':last_id' => $lastScannedId]);
            $newCustMsgs = $custStmt->fetchAll();

            // Chỉ có tin nhắn từ phía tư vấn viên gửi đi, khách chưa phản hồi gì
            if (empty($newCustMsgs)) {
                return [
                    'success' => false,
                    'no_new_info' => true,
                    'message' => 'Chưa có thêm thông tin từ khách hàng (chỉ có tin nhắn từ phía tư vấn viên). Không cần quét lại.'
                ];
            }

            // TẦNG 3: Kiểm tra nội dung tin nhắn mới từ khách hàng xem có ý nghĩa thực chất hay không
            $joinedCustText = '';
            foreach ($newCustMsgs as $cm) {
                $joinedCustText .= ' ' . trim($cm['content'] ?? '');
            }
            // Lọc bỏ khoảng trắng và ký tự dấu câu để đếm độ dài thực
            $cleanText = preg_replace('/[\s\p{P}]+/u', '', $joinedCustText);
            if (mb_strlen($cleanText, 'UTF-8') < 4) {
                return [
                    'success' => false,
                    'no_new_info' => true,
                    'message' => 'Phản hồi mới của khách hàng quá ngắn, chưa chứa thông tin cá nhân mới để phân tích.'
                ];
            }
        }

        // 3. Lấy toàn bộ lịch sử tin nhắn của cuộc trò chuyện từ lúc bắt đầu tới mới nhất
        $stmt = $db->prepare("
            SELECT sender_type, content, attachment_url, created_at 
            FROM messages 
            WHERE conversation_id = :cid 
            ORDER BY id ASC
        ");
        $stmt->execute([':cid' => $conversationId]);
        $messages = $stmt->fetchAll();

        if (empty($messages)) {
            return [
                'success' => false,
                'no_new_info' => true,
                'message' => 'Chưa có tin nhắn nào trong cuộc trò chuyện để AI phân tích.'
            ];
        }

        // 3. Nén kịch bản hội thoại để tối ưu token và thời gian phản hồi
        $transcriptLines = [];
        $validMsgCount = 0;
        foreach ($messages as $m) {
            $sender = ($m['sender_type'] === 'STAFF' || $m['sender_type'] === 'SYSTEM') ? 'Tư vấn viên' : 'Khách hàng';
            $content = trim($m['content'] ?? '');
            
            // Bỏ qua tin rác hệ thống
            if ($m['sender_type'] === 'SYSTEM' && empty($content)) continue;

            $lineText = '';
            if (!empty($content)) {
                $lineText = $content;
            }
            if (!empty($m['attachment_url'])) {
                $lineText .= ($lineText ? ' ' : '') . '[Gửi kèm ảnh/tệp]';
            }

            if (!empty($lineText)) {
                $transcriptLines[] = "[{$sender}]: {$lineText}";
                $validMsgCount++;
            }
        }

        if ($validMsgCount === 0) {
            return [
                'success' => false,
                'message' => 'Nội dung tin nhắn trống, không đủ dữ liệu để phân tích.'
            ];
        }

        $conversationText = implode("\n", $transcriptLines);

        // 4. Xây dựng Prompt Zero-Hallucination
        $prompt = <<<PROMPT
Bạn là chuyên viên trích xuất thông tin khách hàng (CRM) chính xác 100%.
Nhiệm vụ: Đọc toàn bộ đoạn hội thoại chăm sóc khách hàng bên dưới và bóc tách thông tin khách hàng vào đúng 8 trường theo yêu cầu.

QUY TẮC BẮT BUỘC (TUYỆT ĐỐI KHÔNG BỊA ĐẶT - ZERO HALLUCINATION):
1. Chỉ trích xuất những thông tin ĐƯỢC NÊU RÕ RÀNG VÀ CHẮC CHẮN trong cuộc trò chuyện.
2. NẾU MỘT TRƯỜNG CHƯA TỪNG ĐƯỢC NHẮC ĐẾN HOẶC CHƯA CÓ ĐỦ THÔNG TIN XÁC THỰC -> BẮT BUỘC TRẢ VỀ GIÁ TRỊ null.
3. TUYỆT ĐỐI KHÔNG SUY ĐOÁN, không đoán mò, không điền các số điện thoại ví dụ (như 0123456789) hoặc địa chỉ mẫu.
4. Trả về đúng định dạng JSON object với 8 key sau (tất cả là chuỗi string hoặc null):
   - "real_name": Họ và tên thật của khách (chỉ lấy khi khách tự xưng tên hoặc xác nhận khi tư vấn viên gọi đích danh). Bỏ qua các từ xưng hô chung như "Khách Web", "Anh", "Chị". Nếu chưa rõ tên thật thì để null.
   - "phone": Số điện thoại liên hệ của khách hàng (chuỗi số 9-11 chữ số tại Việt Nam). Nếu chưa có thì để null.
   - "address": Địa chỉ giao hàng hoặc nơi ở cụ thể của khách. Nếu chưa có thì để null.
   - "body_measurements": Số đo cụ thể, chiều cao, cân nặng hoặc kích thước (Size S, M, L, XL, 38, 39, 40,...) mà khách hàng đã đề cập hoặc tư vấn viên đã tư vấn chuẩn cho khách. Nếu không có thì để null.
   - "customer_needs": Tên sản phẩm, dòng sản phẩm, dịch vụ hoặc nhu cầu cụ thể khách hàng đang hỏi mua/quan tâm. Nếu chỉ chào hỏi xã giao thì để null.
   - "recent_purchases": Sản phẩm hoặc đơn hàng khách đã chốt mua, xác nhận đặt hàng thành công hoặc từng mua được nhắc đến. Nếu chưa chốt đơn hoặc chưa nhắc đến đơn cũ thì để null.
   - "notes": Ghi chú đặc biệt hoặc yêu cầu riêng của khách (ví dụ: giao ngoài giờ hành chính, gọi trước khi đến, đóng gói cẩn thận,...). Nếu không có ghi chú gì đặc biệt thì để null.
   - "conversation_summary": Tóm tắt ngắn gọn nội dung chính và tình trạng hiện tại của cuộc trò chuyện trong 1 đến 2 câu súc tích. Nếu cuộc trò chuyện quá ngắn chỉ có lời chào thì tóm tắt ngắn là khách mới liên hệ chào hỏi.

LỊCH SỬ HỘI THOẠI CẦN PHÂN TÍCH:
{$conversationText}
PROMPT;

        // 5. Gửi request đến Gemini API
        $apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . urlencode($apiKey);

        $payload = [
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [
                        ['text' => $prompt]
                    ]
                ]
            ],
            'generationConfig' => [
                'response_mime_type' => 'application/json',
                'temperature'        => 0.1
            ]
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        $rawResponse = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return [
                'success' => false,
                'message' => 'Lỗi kết nối tới Google Gemini API: ' . $curlError
            ];
        }

        if ($httpCode !== 200) {
            $errData = json_decode($rawResponse, true);
            $msg = $errData['error']['message'] ?? "Mã lỗi HTTP {$httpCode}";
            return [
                'success' => false,
                'message' => 'Google Gemini API trả về lỗi: ' . $msg
            ];
        }

        $resData = json_decode($rawResponse, true);
        $aiText = $resData['candidates'][0]['content']['parts'][0]['text'] ?? '';

        if (empty($aiText)) {
            return [
                'success' => false,
                'message' => 'Không nhận được nội dung phản hồi từ AI Gemini.'
            ];
        }

        $extracted = json_decode($aiText, true);
        if (!is_array($extracted)) {
            // Thử bóc tách JSON nếu có markdown thừa
            if (preg_match('/\{[\s\S]*\}/', $aiText, $match)) {
                $extracted = json_decode($match[0], true);
            }
        }

        if (!is_array($extracted)) {
            return [
                'success' => false,
                'message' => 'Phản hồi từ AI không đúng định dạng JSON hợp lệ.'
            ];
        }

        // 6. Lưu vào cơ sở dữ liệu và trả về kết quả
        $updatedProfile = $this->profileModel->saveAiExtractedProfile($conversationId, $extracted, $maxMsgId);

        return [
            'success'   => true,
            'message'   => 'AI Gemini đã đọc và trích xuất hồ sơ khách hàng thành công!',
            'extracted' => $extracted,
            'profile'   => $updatedProfile
        ];
    }
}
