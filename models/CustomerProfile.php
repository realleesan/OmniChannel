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

        // Tự động kiểm tra và bổ sung các trường CRM thực tế nếu chưa có (Self-healing schema)
        static $checkedCrmSchema = false;
        if (!$checkedCrmSchema) {
            $checkedCrmSchema = true;
            try {
                $cols = $this->db->query("DESCRIBE customer_profiles")->fetchAll(PDO::FETCH_COLUMN);
                $needed = [
                    'real_name'            => "VARCHAR(150) NULL AFTER customer_name",
                    'phone'                => "VARCHAR(50) NULL AFTER real_name",
                    'address'              => "VARCHAR(255) NULL AFTER phone",
                    'customer_needs'       => "TEXT NULL AFTER address",
                    'conversation_summary' => "TEXT NULL AFTER customer_needs",
                    'from_date'            => "DATE NULL AFTER conversation_summary",
                    'to_date'              => "DATE NULL AFTER from_date",
                    'scan_version'         => "INT DEFAULT 1",
                    'is_boom_risk'         => "TINYINT(1) DEFAULT 0",
                    'preferred_size'       => "VARCHAR(50) DEFAULT 'Chưa xác định'",
                    'recent_purchases'     => "TEXT NULL"
                ];
                foreach ($needed as $col => $def) {
                    if (!in_array($col, $cols)) {
                        @$this->db->exec("ALTER TABLE customer_profiles ADD COLUMN $col $def");
                    }
                }
            } catch (Exception $e) {}
        }
    }

    public function getByConversationId($conversationId) {
        $stmt = $this->db->prepare("SELECT * FROM customer_profiles WHERE conversation_id = :conversation_id LIMIT 1");
        $stmt->execute([':conversation_id' => $conversationId]);
        $profile = $stmt->fetch();

        if (!$profile) {
            // Khởi tạo hồ sơ mặc định nếu chưa có
            $convStmt = $this->db->prepare("SELECT sender_name FROM conversations WHERE id = :id");
            $convStmt->execute([':id' => $conversationId]);
            $conv = $convStmt->fetch();
            $customerName = $conv['sender_name'] ?? 'Khách Hàng';

            try {
                $insertStmt = $this->db->prepare("
                    INSERT INTO customer_profiles (conversation_id, customer_name, real_name, phone, address, customer_needs, conversation_summary, from_date, to_date, last_scanned_at)
                    VALUES (:cid, :cname, NULL, NULL, NULL, NULL, NULL, CURDATE(), CURDATE(), NOW())
                ");
                $insertStmt->execute([':cid' => $conversationId, ':cname' => $customerName]);
            } catch (Exception $e) {
                // Fallback nếu bảng chưa có các cột nâng cao
                try {
                    $insertStmt = $this->db->prepare("INSERT INTO customer_profiles (conversation_id, customer_name) VALUES (:cid, :cname)");
                    $insertStmt->execute([':cid' => $conversationId, ':cname' => $customerName]);
                } catch (Exception $e2) {}
            }
            $stmt->execute([':conversation_id' => $conversationId]);
            $profile = $stmt->fetch();
            if (!$profile) {
                return [
                    'conversation_id'      => $conversationId,
                    'customer_name'        => $customerName,
                    'from_date_formatted'  => date('d/m/Y'),
                    'to_date_formatted'    => date('d/m/Y'),
                    'last_scanned_formatted' => date('H:i - d/m/Y')
                ];
            }
        }

        // Lấy ngày bắt đầu nhắn tin đầu tiên và ngày nhắn tin gần nhất từ messages
        $dateStmt = $this->db->prepare("
            SELECT DATE(MIN(created_at)) as min_date, DATE(MAX(created_at)) as max_date 
            FROM messages 
            WHERE conversation_id = :cid
        ");
        $dateStmt->execute([':cid' => $conversationId]);
        $dateRange = $dateStmt->fetch();

        $fromDate = !empty($profile['from_date']) ? $profile['from_date'] : ($dateRange['min_date'] ?? date('Y-m-d'));
        $toDate = !empty($profile['to_date']) ? $profile['to_date'] : ($dateRange['max_date'] ?? date('Y-m-d'));

        $profile['from_date_formatted'] = date('d/m/Y', $fromDate ? strtotime($fromDate) : time());
        $profile['to_date_formatted'] = date('d/m/Y', $toDate ? strtotime($toDate) : time());

        $scannedTime = !empty($profile['last_scanned_at']) ? strtotime($profile['last_scanned_at']) : time();
        $profile['last_scanned_formatted'] = date('H:i - d/m/Y', $scannedTime);
        return $profile;
    }

    public function updateManual($conversationId, $field, $value) {
        $allowedFields = ['customer_name', 'real_name', 'phone', 'address', 'customer_needs', 'conversation_summary', 'from_date', 'to_date'];
        if (!in_array($field, $allowedFields)) {
            return false;
        }

        $stmt = $this->db->prepare("UPDATE customer_profiles SET {$field} = :value, last_scanned_at = NOW() WHERE conversation_id = :cid");
        return $stmt->execute([':value' => $value, ':cid' => $conversationId]);
    }

    /**
     * Cập nhật toàn bộ hồ sơ CRM
     */
    public function updateCrmProfile($conversationId, array $data) {
        $stmt = $this->db->prepare("
            UPDATE customer_profiles SET
                real_name = :real_name,
                phone = :phone,
                address = :address,
                customer_needs = :customer_needs,
                conversation_summary = :conversation_summary,
                to_date = CURDATE(),
                last_scanned_at = NOW()
            WHERE conversation_id = :cid
        ");
        return $stmt->execute([
            ':real_name'            => !empty($data['real_name']) ? trim($data['real_name']) : null,
            ':phone'                => !empty($data['phone']) ? trim($data['phone']) : null,
            ':address'              => !empty($data['address']) ? trim($data['address']) : null,
            ':customer_needs'       => !empty($data['customer_needs']) ? trim($data['customer_needs']) : null,
            ':conversation_summary' => !empty($data['conversation_summary']) ? trim($data['conversation_summary']) : null,
            ':cid'                  => $conversationId
        ]);
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
