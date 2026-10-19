<?php
/**
 * MODEL: Template
 * Quản lý mẫu câu trả lời nhanh (Canned Responses) với phím tắt và biến động
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/Product.php';

class Template {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function getAll() {
        $stmt = $this->db->query("
            SELECT t.*, u.fullname AS creator_name 
            FROM templates t
            LEFT JOIN users u ON t.created_by_user_id = u.id
            ORDER BY t.shortcut ASC
        ");
        return $stmt->fetchAll();
    }

    public function findByShortcut($shortcut) {
        $stmt = $this->db->prepare("SELECT * FROM templates WHERE shortcut = :shortcut LIMIT 1");
        $stmt->execute([':shortcut' => trim($shortcut)]);
        return $stmt->fetch();
    }

    public function create($shortcut, $title, $content, $userId) {
        // Chuẩn hóa shortcut luôn bắt đầu bằng dấu gạch chéo '/'
        $shortcut = '/' . ltrim(trim($shortcut), '/');
        
        $stmt = $this->db->prepare("
            INSERT INTO templates (shortcut, title, content, created_by_user_id, created_at)
            VALUES (:shortcut, :title, :content, :created_by_user_id, NOW())
        ");
        return $stmt->execute([
            ':shortcut'            => $shortcut,
            ':title'               => trim($title),
            ':content'             => trim($content),
            ':created_by_user_id'  => $userId
        ]);
    }

    /**
     * Thay thế các biến động [ten_sp], [ma_sp], [gia] bằng dữ liệu thực từ bảng products
     */
    public function renderContent($rawContent, $productCode = 'SP01') {
        $productModel = new Product();
        $product = $productModel->findByCode($productCode);

        if (!$product) {
            // Mặc định lấy sản phẩm đầu tiên nếu không khớp mã
            $all = $productModel->getAll();
            $product = $all[0] ?? [
                'name'         => 'Sản phẩm Mẫu',
                'product_code' => 'SP01',
                'price'        => 350000
            ];
        }

        $formattedPrice = number_format($product['price'], 0, ',', '.') . 'đ';

        $replacements = [
            '[ten_sp]' => $product['name'],
            '[ma_sp]'  => $product['product_code'],
            '[gia]'    => $formattedPrice
        ];

        return str_replace(array_keys($replacements), array_values($replacements), $rawContent);
    }
}
