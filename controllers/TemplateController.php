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
        $rawShortcut = trim($shortcut);
        $cleanShortcut = '/' . ltrim($rawShortcut, '/');

        // 1. Tìm chính xác phím tắt
        $tpl = $this->templateModel->findByShortcut($cleanShortcut);

        // 2. Nếu không tìm thấy chính xác, phân tích cú pháp có tham số (ví dụ: "/sp 3" hoặc "/id=3" hoặc "3")
        $paramVal = null;
        if (!$tpl) {
            $allTemplates = $this->templateModel->getAll();

            // Tách theo khoảng trắng "/sp 3" -> command="/sp", param="3"
            $parts = preg_split('/\s+/', $cleanShortcut, 2);
            $baseCmd = $parts[0] ?? '';
            $potentialParam = $parts[1] ?? '';

            foreach ($allTemplates as $t) {
                $tShort = trim($t['shortcut']);
                $tClean = '/' . ltrim($tShort, '/');

                // Trường hợp 2.1: Template shortcut có biến dạng "/sp [id]" hoặc "/sp [ma]"
                if (preg_match('/^(\/[^\s\[]+)\s*\[([^\]]+)\]$/i', $tClean, $matches)) {
                    $cmd = $matches[1];
                    if (strcasecmp($cmd, $baseCmd) === 0 && !empty($potentialParam)) {
                        $tpl = $t;
                        $paramVal = $potentialParam;
                        break;
                    }
                }

                // Trường hợp 2.2: Template shortcut dạng "/id=[id]"
                if (preg_match('/^(\/[^=\[]+=)\s*\[([^\]]+)\]$/i', $tClean, $matches)) {
                    $prefix = $matches[1];
                    if (stripos($cleanShortcut, $prefix) === 0) {
                        $tpl = $t;
                        $paramVal = substr($cleanShortcut, strlen($prefix));
                        break;
                    }
                }

                // Trường hợp 2.3: Template shortcut thuần "/sp", gõ "/sp 3"
                if (strcasecmp($tClean, $baseCmd) === 0 && !empty($potentialParam)) {
                    $tpl = $t;
                    $paramVal = $potentialParam;
                    break;
                }

                // Trường hợp 2.4: Template shortcut chỉ ghi tên biến "[id]" hoặc "/[id]"
                if (preg_match('/^\/?\[([^\]]+)\]$/i', $tClean)) {
                    $tpl = $t;
                    $paramVal = ltrim($cleanShortcut, '/');
                    break;
                }
            }
        }

        if (!$tpl) {
            return [
                'success' => false,
                'message' => 'Không tìm thấy mẫu tin với phím tắt: ' . $rawShortcut
            ];
        }

        // 3. Nếu chưa có rowData nhưng có paramVal, tra cứu dòng tương ứng trong bảng google_sheet_rows
        if (empty($rowData) && !empty($paramVal)) {
            try {
                $db = Database::getConnection();
                $stmt = $db->prepare("SELECT row_data_json FROM google_sheet_rows ORDER BY id DESC LIMIT 1000");
                $stmt->execute();
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($rows as $r) {
                    $data = json_decode($r['row_data_json'], true);
                    if (!is_array($data)) continue;

                    // Tìm xem có trường id / id_sp / ma / stt nào khớp với paramVal không
                    $matched = false;
                    foreach ($data as $k => $v) {
                        $lk = mb_strtolower(trim($k), 'UTF-8');
                        if (($lk === 'id' || $lk === 'mã' || $lk === 'ma' || $lk === 'stt' || $lk === 'code') && strcasecmp(trim((string)$v), trim((string)$paramVal)) === 0) {
                            $matched = true;
                            break;
                        }
                    }

                    // Nếu không có cột ID, tìm so khớp giá trị bất kỳ
                    if (!$matched) {
                        foreach ($data as $k => $v) {
                            if (strcasecmp(trim((string)$v), trim((string)$paramVal)) === 0) {
                                $matched = true;
                                break;
                            }
                        }
                    }

                    if ($matched) {
                        $rowData = $data;
                        break;
                    }
                }
            } catch (Exception $e) {
                error_log('Lỗi tra cứu google_sheet_rows: ' . $e->getMessage());
            }
        }

        $compiledContent = $this->templateModel->renderContent($tpl['content'], $rowData);

        return [
            'success'          => true,
            'template'         => $tpl,
            'compiled_content' => $compiledContent,
            'row_data'         => $rowData
        ];
    }
}
