<?php
/**
 * CONTROLLER: TemplateController
 * Quản lý mẫu tin nhắn nhanh, phím tắt /1 và điền tự động dữ liệu sản phẩm
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/Template.php';
require_once __DIR__ . '/../models/Product.php';

class TemplateController {
    private Template $templateModel;
    private Product $productModel;

    public function __construct() {
        $this->templateModel = new Template();
        $this->productModel = new Product();
    }

    public function getList() {
        return $this->templateModel->getAll();
    }

    public function resolveShortcut($shortcut, $productCode = 'SP01') {
        $shortcut = '/' . ltrim(trim($shortcut), '/');
        $tpl = $this->templateModel->findByShortcut($shortcut);

        if (!$tpl) {
            return [
                'success' => false,
                'message' => 'Không tìm thấy mẫu tin với phím tắt: ' . $shortcut
            ];
        }

        $compiledContent = $this->templateModel->renderContent($tpl['content'], $productCode);

        return [
            'success'          => true,
            'template'         => $tpl,
            'compiled_content' => $compiledContent
        ];
    }

    public function create($shortcut, $title, $content, $userId) {
        if (empty($shortcut) || empty($content)) {
            return ['success' => false, 'message' => 'Phím tắt và nội dung không được để trống'];
        }

        try {
            $this->templateModel->create($shortcut, $title, $content, $userId);
            return ['success' => true, 'message' => 'Tạo mẫu tin nhắn thành công'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Lỗi: Phím tắt đã tồn tại hoặc CSDL gặp sự cố'];
        }
    }
}
