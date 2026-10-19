<?php
/**
 * MODEL: Product
 * Quản lý danh mục sản phẩm, giá bán phục vụ thế chỗ biến động trong template
 */

require_once __DIR__ . '/../config/database.php';

class Product {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function getAll() {
        $stmt = $this->db->query("SELECT * FROM products ORDER BY id ASC");
        return $stmt->fetchAll();
    }

    public function findByCode($code) {
        $stmt = $this->db->prepare("SELECT * FROM products WHERE product_code = :code LIMIT 1");
        $stmt->execute([':code' => strtoupper(trim($code))]);
        return $stmt->fetch();
    }

    public function search($keyword) {
        $stmt = $this->db->prepare("SELECT * FROM products WHERE product_code LIKE :kw OR name LIKE :kw LIMIT 10");
        $stmt->execute([':kw' => '%' . trim($keyword) . '%']);
        return $stmt->fetchAll();
    }
}
