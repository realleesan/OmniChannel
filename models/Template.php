<?php
/**
 * MODEL: Template
 * Quản lý mẫu câu trả lời nhanh (Canned Responses) với phím tắt duy nhất và biến động từ Google Sheet
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
            ORDER BY t.id DESC
        ");
        return $stmt->fetchAll();
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT * FROM templates WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => (int)$id]);
        return $stmt->fetch();
    }

    public function findByShortcut($shortcut) {
        $shortcut = '/' . ltrim(trim($shortcut), '/');
        $stmt = $this->db->prepare("SELECT * FROM templates WHERE shortcut = :shortcut LIMIT 1");
        $stmt->execute([':shortcut' => $shortcut]);
        return $stmt->fetch();
    }

    public function checkShortcutExists($shortcut, $excludeId = null) {
        $shortcut = '/' . ltrim(trim($shortcut), '/');
        if ($excludeId) {
            $stmt = $this->db->prepare("SELECT id FROM templates WHERE shortcut = :shortcut AND id != :id LIMIT 1");
            $stmt->execute([':shortcut' => $shortcut, ':id' => (int)$excludeId]);
        } else {
            $stmt = $this->db->prepare("SELECT id FROM templates WHERE shortcut = :shortcut LIMIT 1");
            $stmt->execute([':shortcut' => $shortcut]);
        }
        return (bool)$stmt->fetch();
    }

    public function create($shortcut, $title, $content, $userId, $variablesJson = null, $sheetName = null) {
        $shortcut = '/' . ltrim(trim($shortcut), '/');
        
        if ($this->checkShortcutExists($shortcut)) {
            throw new Exception("Phím tắt '{$shortcut}' đã được sử dụng bởi mẫu tin khác");
        }

        $stmt = $this->db->prepare("
            INSERT INTO templates (shortcut, title, content, variables_json, sheet_name, created_by_user_id, created_at)
            VALUES (:shortcut, :title, :content, :variables_json, :sheet_name, :created_by_user_id, NOW())
        ");
        return $stmt->execute([
            ':shortcut'            => $shortcut,
            ':title'               => trim($title),
            ':content'             => trim($content),
            ':variables_json'      => $variablesJson,
            ':sheet_name'          => !empty($sheetName) ? trim($sheetName) : null,
            ':created_by_user_id'  => $userId
        ]);
    }

    public function update($id, $shortcut, $title, $content, $variablesJson = null, $sheetName = null) {
        $shortcut = '/' . ltrim(trim($shortcut), '/');

        if ($this->checkShortcutExists($shortcut, $id)) {
            throw new Exception("Phím tắt '{$shortcut}' đã được sử dụng bởi mẫu tin khác");
        }

        $stmt = $this->db->prepare("
            UPDATE templates 
            SET shortcut = :shortcut, title = :title, content = :content, variables_json = :variables_json, sheet_name = :sheet_name
            WHERE id = :id
        ");
        return $stmt->execute([
            ':shortcut'       => $shortcut,
            ':title'          => trim($title),
            ':content'        => trim($content),
            ':variables_json' => $variablesJson,
            ':sheet_name'     => !empty($sheetName) ? trim($sheetName) : null,
            ':id'             => (int)$id
        ]);
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM templates WHERE id = :id");
        return $stmt->execute([':id' => (int)$id]);
    }

    /**
     * Thay thế biến động từ dữ liệu Google Sheet hoặc Product tĩnh
     * @param string $rawContent Nội dung chứa [biến]
     * @param array|null $rowData Mảng dữ liệu 1 dòng từ Google Sheet
     * @return string
     */
    public function renderContent($rawContent, $rowData = null) {
        if (!empty($rowData) && is_array($rowData)) {
            $replacements = [];
            foreach ($rowData as $key => $val) {
                $replacements['[' . trim($key) . ']'] = (string)$val;
            }
            return str_replace(array_keys($replacements), array_values($replacements), $rawContent);
        }

        // Fallback: Tìm sản phẩm tĩnh từ bảng products
        $productModel = new Product();
        $all = $productModel->getAll();
        $product = $all[0] ?? null;

        if ($product) {
            $formattedPrice = number_format($product['price'], 0, ',', '.') . 'đ';
            $replacements = [
                '[ten_sp]' => $product['name'],
                '[ma_sp]'  => $product['product_code'],
                '[gia]'    => $formattedPrice
            ];
            return str_replace(array_keys($replacements), array_values($replacements), $rawContent);
        }

        return $rawContent;
    }
}
