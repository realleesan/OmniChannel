<?php
/**
 * CONTROLLER: TemplateController
 * Quản lý CRUD mẫu tin nhắn, kiểm tra phím tắt duy nhất và giải phóng biến động
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/Template.php';

class TemplateController {
    private Template $templateModel;

    public function __construct() {
        $this->templateModel = new Template();
    }

    public function getList() {
        return $this->templateModel->getAll();
    }

    public function checkShortcut($shortcut, $excludeId = null) {
        return $this->templateModel->checkShortcutExists($shortcut, $excludeId);
    }

    public function create($shortcut, $title, $content, $userId, $variablesJson = null) {
        $shortcut = trim($shortcut);
        $title = trim($title);
        $content = trim($content);

        if (empty($shortcut) || empty($content)) {
            return ['success' => false, 'message' => 'Phím tắt và nội dung không được để trống'];
        }

        try {
            $this->templateModel->create($shortcut, $title, $content, $userId, $variablesJson);
            return ['success' => true, 'message' => 'Tạo mẫu tin nhắn thành công'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function update($id, $shortcut, $title, $content, $variablesJson = null) {
        $id = (int)$id;
        $shortcut = trim($shortcut);
        $title = trim($title);
        $content = trim($content);

        if (!$id || empty($shortcut) || empty($content)) {
            return ['success' => false, 'message' => 'Dữ liệu cập nhật không hợp lệ'];
        }

        try {
            $this->templateModel->update($id, $shortcut, $title, $content, $variablesJson);
            return ['success' => true, 'message' => 'Cập nhật mẫu tin nhắn thành công'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    public function delete($id) {
        $id = (int)$id;
        if (!$id) {
            return ['success' => false, 'message' => 'ID không hợp lệ'];
        }

        try {
            $this->templateModel->delete($id);
            return ['success' => true, 'message' => 'Xóa mẫu tin nhắn thành công'];
        } catch (Exception $e) {
            return ['success' => false, 'message' => 'Lỗi xóa mẫu tin: ' . $e->getMessage()];
        }
    }

    public function resolveShortcut($shortcut, $rowData = null) {
        $shortcut = '/' . ltrim(trim($shortcut), '/');
        $tpl = $this->templateModel->findByShortcut($shortcut);

        if (!$tpl) {
            return [
                'success' => false,
                'message' => 'Không tìm thấy mẫu tin với phím tắt: ' . $shortcut
            ];
        }

        $compiledContent = $this->templateModel->renderContent($tpl['content'], $rowData);

        return [
            'success'          => true,
            'template'         => $tpl,
            'compiled_content' => $compiledContent
        ];
    }
}
