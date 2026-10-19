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

            $insertStmt = $this->db->prepare("
                INSERT INTO customer_profiles (conversation_id, customer_name, preferred_size, recent_purchases, is_boom_risk, boom_note, scan_version, last_scanned_at)
                VALUES (:cid, :cname, 'Chưa xác định', 'Chưa có đơn hàng cũ', 0, NULL, 1, NOW())
            ");
            $insertStmt->execute([':cid' => $conversationId, ':cname' => $customerName]);
            return $this->getByConversationId($conversationId);
        }

        $scanVer = !empty($profile['scan_version']) ? (float)$profile['scan_version'] : 1.0;
        $profile['scan_version_label'] = 'v' . number_format($scanVer, 1);
        $scannedTime = !empty($profile['last_scanned_at']) ? strtotime($profile['last_scanned_at']) : time();
        $profile['last_scanned_formatted'] = date('H:i - d/m', $scannedTime);
        return $profile;
    }

    public function updateManual($conversationId, $field, $value) {
        $allowedFields = ['customer_name', 'preferred_size', 'recent_purchases', 'is_boom_risk', 'boom_note'];
        if (!in_array($field, $allowedFields)) {
            return false;
        }

        $stmt = $this->db->prepare("UPDATE customer_profiles SET {$field} = :value WHERE conversation_id = :cid");
        return $stmt->execute([':value' => $value, ':cid' => $conversationId]);
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
