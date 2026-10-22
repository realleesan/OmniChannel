<?php
/**
 * MODEL: CustomerProfile
 * Quản lý thẻ hồ sơ khách hàng, thuật toán Agent bóc tách thực thể (NER) và cảnh báo rủi ro boom hàng
 */

require_once __DIR__ . '/../config/database.php';

class CustomerProfile {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();

        // Tự động kiểm tra và bổ sung các cột CRM nếu CSDL chưa có (Self-healing schema)
        static $checkedCrmSchema = false;
        if (!$checkedCrmSchema) {
            $checkedCrmSchema = true;
            try {
                $cols = $this->db->query("DESCRIBE customer_profiles")->fetchAll(PDO::FETCH_COLUMN);
                $needed = [
                    'real_name'            => "VARCHAR(150) NULL AFTER customer_name",
                    'phone'                => "VARCHAR(50) NULL AFTER real_name",
                    'address'              => "VARCHAR(255) NULL AFTER phone",
                    'body_measurements'    => "VARCHAR(100) NULL AFTER address",
                    'customer_needs'       => "TEXT NULL AFTER body_measurements",
                    'recent_purchases'     => "TEXT NULL AFTER customer_needs",
                    'notes'                => "TEXT NULL AFTER recent_purchases",
                    'conversation_summary' => "TEXT NULL AFTER notes",
                    'from_date'            => "DATE NULL AFTER conversation_summary",
                    'to_date'              => "DATE NULL AFTER from_date",
                    'preferred_size'       => "VARCHAR(50) DEFAULT 'Chưa xác định'",
                    'is_boom_risk'         => "TINYINT(1) DEFAULT 0",
                    'boom_note'            => "VARCHAR(255) NULL",
                    'scan_version'         => "INT DEFAULT 1",
                    'last_scanned_msg_id'  => "INT NULL AFTER last_scanned_at"
                ];
                foreach ($needed as $col => $def) {
                    if (!in_array($col, $cols)) {
                        @$this->db->exec("ALTER TABLE customer_profiles ADD COLUMN $col $def");
                    }
                }
            } catch (Throwable $e) {}
        }
    }

    public function getByConversationId($conversationId) {
        try {
            $stmt = $this->db->prepare("SELECT * FROM customer_profiles WHERE conversation_id = :conversation_id LIMIT 1");
            $stmt->execute([':conversation_id' => $conversationId]);
            $profile = $stmt->fetch();
        } catch (Throwable $e) {
            $profile = false;
        }

        if (!$profile) {
            // Khởi tạo hồ sơ mặc định nếu chưa có
            $customerName = 'Khách Hàng';
            try {
                $convStmt = $this->db->prepare("SELECT sender_name FROM conversations WHERE id = :id");
                $convStmt->execute([':id' => $conversationId]);
                $conv = $convStmt->fetch();
                if (!empty($conv['sender_name'])) {
                    $customerName = $conv['sender_name'];
                }
            } catch (Throwable $e) {}

            $inserted = false;
            // Thử chèn đầy đủ cột
            try {
                $insertStmt = $this->db->prepare("
                    INSERT INTO customer_profiles (conversation_id, customer_name, real_name, phone, address, body_measurements, customer_needs, recent_purchases, notes, conversation_summary, from_date, to_date, last_scanned_at)
                    VALUES (:cid, :cname, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, CURDATE(), CURDATE(), NOW())
                ");
                $insertStmt->execute([':cid' => $conversationId, ':cname' => $customerName]);
                $inserted = true;
            } catch (Throwable $e1) {
                // Fallback nếu bảng chưa có các cột nâng cao
                try {
                    $insertStmt = $this->db->prepare("INSERT INTO customer_profiles (conversation_id, customer_name) VALUES (:cid, :cname)");
                    $insertStmt->execute([':cid' => $conversationId, ':cname' => $customerName]);
                    $inserted = true;
                } catch (Throwable $e2) {}
            }

            if ($inserted) {
                try {
                    $stmt = $this->db->prepare("SELECT * FROM customer_profiles WHERE conversation_id = :conversation_id LIMIT 1");
                    $stmt->execute([':conversation_id' => $conversationId]);
                    $profile = $stmt->fetch();
                } catch (Throwable $e) {}
            }

            if (!$profile) {
                return [
                    'conversation_id'        => $conversationId,
                    'customer_name'          => $customerName,
                    'real_name'              => null,
                    'phone'                  => null,
                    'address'                => null,
                    'body_measurements'      => null,
                    'customer_needs'         => null,
                    'recent_purchases'       => null,
                    'notes'                  => null,
                    'conversation_summary'   => null,
                    'from_date_formatted'    => date('d/m/Y'),
                    'to_date_formatted'      => date('d/m/Y'),
                    'last_scanned_formatted' => date('H:i - d/m/Y'),
                    'last_scanned_msg_id'    => 0
                ];
            }
        }

        // Đảm bảo tương thích ngược: Chuẩn hóa body_measurements, loại bỏ giá trị mặc định 'Chưa xác định'
        if (!empty($profile['body_measurements']) && trim($profile['body_measurements']) === 'Chưa xác định') {
            $profile['body_measurements'] = null;
        }
        if (empty($profile['body_measurements']) && !empty($profile['preferred_size']) && trim($profile['preferred_size']) !== 'Chưa xác định') {
            $profile['body_measurements'] = $profile['preferred_size'];
        }
        if (empty($profile['body_measurements'])) {
            $profile['body_measurements'] = null;
        }

        // Lấy ngày bắt đầu nhắn tin đầu tiên và ngày nhắn tin gần nhất từ messages
        $fromDate = $profile['from_date'] ?? null;
        $toDate = $profile['to_date'] ?? null;
        if (empty($fromDate) || empty($toDate)) {
            try {
                $dateStmt = $this->db->prepare("
                    SELECT DATE(MIN(created_at)) as min_date, DATE(MAX(created_at)) as max_date 
                    FROM messages 
                    WHERE conversation_id = :cid
                ");
                $dateStmt->execute([':cid' => $conversationId]);
                $dateRange = $dateStmt->fetch();
                if (!$fromDate) $fromDate = $dateRange['min_date'] ?? date('Y-m-d');
                if (!$toDate) $toDate = $dateRange['max_date'] ?? date('Y-m-d');
            } catch (Throwable $e) {
                if (!$fromDate) $fromDate = date('Y-m-d');
                if (!$toDate) $toDate = date('Y-m-d');
            }
        }

        $profile['from_date_formatted'] = date('d/m/Y', strtotime($fromDate));
        $profile['to_date_formatted'] = date('d/m/Y', strtotime($toDate));

        $scannedTime = !empty($profile['last_scanned_at']) ? strtotime($profile['last_scanned_at']) : time();
        $profile['last_scanned_formatted'] = date('H:i - d/m/Y', $scannedTime);
        return $profile;
    }

    public function updateManual($conversationId, $field, $value) {
        $allowedFields = ['customer_name', 'real_name', 'phone', 'address', 'body_measurements', 'customer_needs', 'recent_purchases', 'notes', 'conversation_summary', 'from_date', 'to_date', 'preferred_size'];
        if (!in_array($field, $allowedFields)) {
            return false;
        }

        try {
            $stmt = $this->db->prepare("UPDATE customer_profiles SET {$field} = :value, last_scanned_at = NOW() WHERE conversation_id = :cid");
            return $stmt->execute([':value' => $value, ':cid' => $conversationId]);
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * Cập nhật toàn bộ 8 trường hồ sơ CRM
     */
    public function updateCrmProfile($conversationId, array $data) {
        $stmt = $this->db->prepare("
            UPDATE customer_profiles SET
                real_name = :real_name,
                phone = :phone,
                address = :address,
                body_measurements = :body_measurements,
                customer_needs = :customer_needs,
                recent_purchases = :recent_purchases,
                notes = :notes,
                conversation_summary = :conversation_summary,
                to_date = CURDATE(),
                last_scanned_at = NOW()
            WHERE conversation_id = :cid
        ");
        return $stmt->execute([
            ':real_name'            => !empty($data['real_name']) ? trim($data['real_name']) : null,
            ':phone'                => !empty($data['phone']) ? trim($data['phone']) : null,
            ':address'              => !empty($data['address']) ? trim($data['address']) : null,
            ':body_measurements'    => !empty($data['body_measurements']) ? trim($data['body_measurements']) : null,
            ':customer_needs'       => !empty($data['customer_needs']) ? trim($data['customer_needs']) : null,
            ':recent_purchases'     => !empty($data['recent_purchases']) ? trim($data['recent_purchases']) : null,
            ':notes'                => !empty($data['notes']) ? trim($data['notes']) : null,
            ':conversation_summary' => !empty($data['conversation_summary']) ? trim($data['conversation_summary']) : null,
            ':cid'                  => $conversationId
        ]);
    }

    /**
     * Cập nhật thông tin trích xuất từ Gemini AI (chỉ cập nhật những trường AI tìm thấy và không ghi đè dữ liệu người dùng đã nhập)
     */
    public function saveAiExtractedProfile($conversationId, array $aiData, $lastScannedMsgId = null) {
        $current = $this->getByConversationId($conversationId);
        
        $fieldsToUpdate = [];
        $params = [':cid' => $conversationId];

        $mapping = [
            'real_name'            => 'real_name',
            'phone'                => 'phone',
            'address'              => 'address',
            'body_measurements'    => 'body_measurements',
            'customer_needs'       => 'customer_needs',
            'recent_purchases'     => 'recent_purchases',
            'notes'                => 'notes',
            'conversation_summary' => 'conversation_summary'
        ];

        foreach ($mapping as $key => $col) {
            if (isset($aiData[$key]) && $aiData[$key] !== null && trim($aiData[$key]) !== '') {
                $fieldsToUpdate[] = "{$col} = :{$key}";
                $params[":{$key}"] = trim($aiData[$key]);
            }
        }

        if (!empty($lastScannedMsgId)) {
            $fieldsToUpdate[] = "last_scanned_msg_id = :last_msg_id";
            $params[':last_msg_id'] = (int)$lastScannedMsgId;
        }

        if (empty($fieldsToUpdate)) {
            // Không có trường nào mới từ AI, chỉ cập nhật thời gian quét
            $this->db->prepare("UPDATE customer_profiles SET last_scanned_at = NOW() WHERE conversation_id = :cid")->execute([':cid' => $conversationId]);
            return $this->getByConversationId($conversationId);
        }

        $fieldsToUpdate[] = "to_date = CURDATE()";
        $fieldsToUpdate[] = "last_scanned_at = NOW()";
        $sql = "UPDATE customer_profiles SET " . implode(', ', $fieldsToUpdate) . " WHERE conversation_id = :cid";
        
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return $this->getByConversationId($conversationId);
    }

    /**
     * UC3.3: Thuật toán Agent quét dữ liệu hội thoại (Text Mining / Entity Extraction Simulation)
     * - Phân tích nội dung tin nhắn để bóc tách Size (S, M, L, XL)
     * - Kiểm tra lịch sử từ khóa nghi vấn rủi ro (boom, không nhận, hoàn hàng)
     * - Tăng scan_version từ v1.0 -> v2.0
     */
    public function scanAgentData($conversationId) {
        // Lấy tất cả tin nhắn trong cuộc trò chuyện
        $stmt = $this->db->prepare("SELECT content, sender_type FROM messages WHERE conversation_id = :cid ORDER BY id ASC");
        $stmt->execute([':cid' => $conversationId]);
        $messages = $stmt->fetchAll();

        $allText = '';
        foreach ($messages as $m) {
            $allText .= ' ' . mb_strtolower($m['content'], 'UTF-8');
        }

        // Lấy thông tin hiện tại của hồ sơ
        $currentProfile = $this->getByConversationId($conversationId);
        $detectedSize = $currentProfile['preferred_size'] ?? 'Chưa xác định';
        $recentPurchase = $currentProfile['recent_purchases'] ?? 'Chưa có thông tin';

        // 1. Bóc tách kích thước thường mặc (Preferred Size) từ nội dung tin nhắn
        if (preg_match('/\b(size\s*[smlx]{1,2}|size\s*\d{2})\b/iu', $allText, $match)) {
            $detectedSize = 'Size ' . strtoupper(str_ireplace('size', '', trim($match[0])));
        }

        // 2. Bóc tách sản phẩm thảo luận từ danh mục sản phẩm nếu có
        try {
            $prodStmt = $this->db->query("SELECT name FROM products ORDER BY id DESC LIMIT 50");
            if ($prodStmt) {
                $products = $prodStmt->fetchAll();
                foreach ($products as $p) {
                    if (mb_stripos($allText, $p['name'], 0, 'UTF-8') !== false) {
                        $recentPurchase = $p['name'];
                        break;
                    }
                }
            }
        } catch (Exception $e) {
            // Bỏ qua nếu bảng products chưa có dữ liệu
        }

        // 3. Phân tích rủi ro đặt hàng dựa trên từ khóa nghi vấn thực tế
        $isBoom = 0;
        $boomNote = null;
        $riskKeywords = ['boom', 'bùng', 'bom hàng', 'không nhận', 'hủy đơn', 'trả hàng', 'hoàn hàng'];
        foreach ($riskKeywords as $kw) {
            if (mb_stripos($allText, $kw, 0, 'UTF-8') !== false) {
                $isBoom = 1;
                $boomNote = 'Phát hiện tín hiệu rủi ro: Khách nhắc tới từ khóa "' . $kw . '"';
                break;
            }
        }

        // Cập nhật profile và tăng phiên bản
        $updateStmt = $this->db->prepare("
            UPDATE customer_profiles 
            SET preferred_size = :size,
                recent_purchases = :recent,
                is_boom_risk = :is_boom,
                boom_note = :boom_note,
                scan_version = scan_version + 1,
                last_scanned_at = NOW()
            WHERE conversation_id = :cid
        ");
        $updateStmt->execute([
            ':size'      => $detectedSize,
            ':recent'    => $recentPurchase,
            ':is_boom'   => $isBoom,
            ':boom_note' => $boomNote,
            ':cid'       => $conversationId
        ]);

        return $this->getByConversationId($conversationId);
    }
}
