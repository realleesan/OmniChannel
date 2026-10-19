<?php
/**
 * VIEW: chat/workspace.php
 * Màn hình Không gian Chat tập trung (Unified Chat Workspace 3 Phân vùng)
 */

require_once __DIR__ . '/../../config/constants.php';
require_once __DIR__ . '/../../controllers/AuthController.php';
require_once __DIR__ . '/../../controllers/ChatController.php';

requireLogin();

$authController = new AuthController();
$currentUser = $authController->getCurrentUser();
if (!$currentUser) {
    header('Location: ' . BASE_URL . '/views/auth/login.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workspace - Hệ thống Quản lý Hội thoại Đa kênh</title>
    <link rel="stylesheet" href="../../public/css/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>

<!-- ========================================================
     HEADER CỐ ĐỊNH
     ======================================================== -->
<header class="app-header">
    <div class="brand-section">
        <div class="brand-logo"><i class="fa-solid fa-network-wired" style="color:white;font-size:18px;"></i></div>
        <div>
            <div class="brand-title">HỆ THỐNG QUẢN LÝ HỘI THOẠI ĐA KÊNH</div>
            <div class="brand-subtitle">Omnichannel Unified Agent Workspace</div>
        </div>
    </div>

    <div class="header-actions">
        <!-- Nút gạt chuyển trạng thái ca trực -->
        <div class="shift-status-pill" id="shiftStatusPill">
            <span class="status-dot <?= $currentUser['status'] === 'ONLINE' ? 'online' : '' ?>" id="shiftDot"></span>
            <select class="shift-select" id="shiftSelect" onchange="handleShiftChange(this.value)">
                <option value="ONLINE" <?= $currentUser['status'] === 'ONLINE' ? 'selected' : '' ?>>Đang trực tuyến</option>
                <option value="OFFLINE" <?= $currentUser['status'] === 'OFFLINE' ? 'selected' : '' ?>>Rời ca trực</option>
            </select>
        </div>

        <!-- Thông tin nhân viên -->
        <div class="user-profile-badge">
            <div class="user-avatar-circle"><?= mb_substr($currentUser['fullname'], 0, 1, 'UTF-8') ?></div>
            <div class="user-meta-name">NV: <?= htmlspecialchars($currentUser['fullname']) ?></div>
            <a href="?logout=1" class="btn-logout" title="Đăng xuất" onclick="return confirm('Bạn có chắc muốn đăng xuất và rời ca trực?');">
                <i class="fa-solid fa-right-from-bracket"></i>
            </a>
        </div>
    </div>
</header>

<?php
if (isset($_GET['logout'])) {
    $authController->logout();
    header('Location: ' . BASE_URL . '/views/auth/login.php');
    exit;
}
?>

<!-- ========================================================
     3-ZONE UNIFIED WORKSPACE CONTAINER
     ======================================================== -->
<div class="workspace-container">

    <!-- ====================================================
         PHÂN VÙNG 1: SIDEBAR TRÁI (Tiếp nhận & Chia ca)
         ==================================================== -->
    <aside class="zone-sidebar-left">
        <div class="sidebar-controls">
            <!-- Ô tìm kiếm hội thoại -->
            <div class="search-box-wrapper">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input type="text" id="searchInput" class="search-input" placeholder="Tìm theo tên khách, SĐT, tin nhắn..." oninput="handleSearch(this.value)">
            </div>

            <!-- UC2.2: 2 Tab lọc Tất cả vs Của tôi -->
            <div class="filter-tabs-row">
                <button type="button" class="tab-btn active" id="tabAll" onclick="switchTab('all')">Tất cả</button>
                <button type="button" class="tab-btn" id="tabMine" onclick="switchTab('mine')">Của tôi</button>
            </div>

            <!-- UC1.2: Nút chip lọc Chưa trả lời -->
            <button type="button" class="chip-unreplied-filter" id="chipUnreplied" onclick="toggleUnrepliedFilter()">
                <i class="fa-regular fa-circle-dot"></i> Chưa trả lời
            </button>
        </div>

        <!-- Danh sách thẻ cuộc hội thoại -->
        <div class="conversations-list" id="conversationsContainer">
            <div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px;">
                <i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách hội thoại...
            </div>
        </div>
    </aside>

    <!-- ====================================================
         PHÂN VÙNG 2: KHUNG CHAT TRUNG TÂM (Phản hồi & Khóa View-Only)
         ==================================================== -->
    <main class="zone-chat-center">
        <!-- Header khung chat hội thoại đang chọn -->
        <div class="chat-center-header" id="chatHeader" style="display:none;">
            <div class="chat-partner-info">
                <div class="partner-avatar" id="activeAvatar">?</div>
                <div>
                    <div class="partner-name" id="activeSenderName">Khách Hàng</div>
                    <div class="partner-meta">
                        <span id="activeChannelBadge"><i class="fa-solid fa-comments"></i> Webchat</span>
                        <span>•</span>
                        <span id="activeTagBadge" class="card-tag-badge">Đang tư vấn</span>
                    </div>
                </div>
            </div>
            <div id="activeLockIndicator"></div>
        </div>

        <!-- Khu vực tin nhắn cuộn -->
        <div class="chat-messages-viewport" id="messagesViewport">
            <div style="text-align:center;margin:auto;color:#94a3b8;font-size:14px;">
                <i class="fa-regular fa-comments" style="font-size:48px;margin-bottom:12px;display:block;opacity:0.5;"></i>
                Chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu tư vấn
            </div>
        </div>

        <!-- UC2.2: Banner màu xám Khóa View-Only khi khách thuộc quyền nhân viên khác -->
        <div class="view-only-lock-banner" id="viewOnlyLockBanner" style="display:none;">
            <i class="fa-solid fa-lock"></i>
            <span id="viewOnlyLockText">
                Chế độ Chỉ xem (View-only) – Hội thoại đang được phụ trách bởi nhân viên khác. Bạn không có quyền gửi tin nhắn.
            </span>
        </div>

        <!-- Khung nhập liệu tin nhắn (Ẩn khi bị khóa View-Only) -->
        <div class="chat-input-container" id="chatInputArea" style="display:none;">
            <!-- Gợi ý template khi gõ phím tắt -->
            <div class="template-shortcut-preview" id="shortcutPreviewBar">
                <span id="shortcutPreviewText"><i class="fa-regular fa-lightbulb"></i> Gợi ý: Gõ <strong>/</strong> để chọn mẫu câu trả lời nhanh</span>
                <button type="button" style="background:none;border:none;cursor:pointer;color:#4f46e5;font-weight:700;" onclick="applyShortcutDirectly()">
                    Điền ngay <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>

            <div class="chat-input-wrapper">
                <textarea id="chatInput" class="chat-textarea" rows="2" placeholder="Nhập tin nhắn tư vấn... (Gõ / để dùng mẫu trả lời nhanh, Enter để gửi)" onkeydown="handleChatKeyDown(event)" onkeyup="handleShortcutDetect(event)"></textarea>

                <div class="input-actions-group">
                    <!-- UC3.1: Ghim đính kèm ảnh -->
                    <input type="file" id="attachmentInput" accept="image/*" style="display:none;" onchange="handleAttachmentUpload(this)">
                    <button type="button" class="icon-action-btn" title="Đính kèm ảnh sản phẩm / bảng size" onclick="document.getElementById('attachmentInput').click()">
                        <i class="fa-solid fa-paperclip"></i>
                    </button>

                    <!-- UC3.2: Popup Thêm mẫu tin nhắn nhanh -->
                    <button type="button" class="icon-action-btn" title="Tạo thêm mẫu tin nhắn nhanh" onclick="openTemplateModal()">
                        <i class="fa-solid fa-plus-circle"></i>
                    </button>

                    <!-- Nút gửi tin nhắn -->
                    <button type="button" class="btn-send-message" id="btnSendMessage" onclick="sendMessage()">
                        <span>Gửi</span>
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    </main>

    <!-- ====================================================
         PHÂN VÙNG 3: SIDEBAR PHẢI (Hồ sơ Agent & Gắn nhãn)
         ==================================================== -->
    <aside class="zone-sidebar-right" id="rightSidebar" style="display:none;">
        <!-- Thẻ hồ sơ khách hàng -->
        <div class="profile-card-widget">
            <div class="profile-header-meta">
                <span class="profile-title">Thẻ Hồ Sơ Khách Hàng</span>
                <span class="profile-version-chip" id="scanVersionBadge">v1.0</span>
            </div>

            <div class="profile-info-group">
                <div class="profile-field-row">
                    <span class="field-label">Tên khách hàng:</span>
                    <div class="field-value-wrap">
                        <span id="profileCustomerName">Đang tải...</span>
                        <i class="fa-solid fa-pen-to-square btn-inline-edit" title="Sửa tên" onclick="editFieldPrompt('customer_name', 'Tên khách hàng')"></i>
                    </div>
                </div>

                <div class="profile-field-row">
                    <span class="field-label">Size thường mặc:</span>
                    <div class="field-value-wrap">
                        <span id="profilePreferredSize">Chưa xác định</span>
                        <i class="fa-solid fa-pen-to-square btn-inline-edit" title="Sửa size" onclick="editFieldPrompt('preferred_size', 'Kích cỡ thường mặc')"></i>
                    </div>
                </div>

                <div class="profile-field-row">
                    <span class="field-label">Đơn hàng mua gần nhất:</span>
                    <div class="field-value-wrap">
                        <span id="profileRecentPurchases" style="font-size:12.5px;font-weight:500;color:#475569;">Chưa có đơn cũ</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- UC3.3: Huy hiệu Đỏ cảnh báo Boom Hàng -->
        <div class="boom-risk-warning-badge" id="boomRiskBadge" style="display:none;">
            <i class="fa-solid fa-triangle-exclamation boom-icon"></i>
            <div>
                <div class="boom-text-title">CẢNH BÁO RỦI RO ĐẶT HÀNG</div>
                <div class="boom-text-desc" id="boomRiskNote">Lịch sử: Từng từ chối nhận hàng. Đề nghị xác nhận kỹ thông tin đơn trước khi gửi.</div>
            </div>
        </div>

        <!-- UC3.3: Nút Quét lại dữ liệu Agent -->
        <button type="button" class="btn-rescan-agent" id="btnRescanAgent" onclick="triggerAgentScan()">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>QUÉT DỮ LIỆU TỰ ĐỘNG</span>
        </button>

        <!-- UC3.4: Bộ chọn Gắn nhãn trạng thái -->
        <div class="tag-selector-widget">
            <span class="profile-title">Gắn Nhãn Hội Thoại</span>
            <div class="tag-options-list">
                <label class="tag-radio-label">
                    <input type="radio" name="convTagRadio" value="DANG_TU_VAN" onchange="handleTagChange(this.value)">
                    <span class="tag-color-indicator" style="background:#10B981;"></span>
                    <span>Đang tư vấn</span>
                </label>

                <label class="tag-radio-label">
                    <input type="radio" name="convTagRadio" value="DA_CHOT" onchange="handleTagChange(this.value)">
                    <span class="tag-color-indicator" style="background:#3B82F6;"></span>
                    <span>Đã chốt đơn</span>
                </label>

                <label class="tag-radio-label">
                    <input type="radio" name="convTagRadio" value="CHO_CHUYEN_KHOAN" onchange="handleTagChange(this.value)">
                    <span class="tag-color-indicator" style="background:#F59E0B;"></span>
                    <span>Chờ chuyển khoản</span>
                </label>

                <label class="tag-radio-label">
                    <input type="radio" name="convTagRadio" value="BOOM_HANG" onchange="handleTagChange(this.value)">
                    <span class="tag-color-indicator" style="background:#EF4444;"></span>
                    <span>Rủi ro hoàn hàng</span>
                </label>
            </div>
        </div>
    </aside>

</div>

<!-- ========================================================
     MODAL POPUP THÊM MẪU TIN NHẮN (UC3.2)
     ======================================================== -->
<div class="modal-overlay" id="templateModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">Tạo Mẫu Tin Nhắn Nhanh Mới</h3>
            <button type="button" class="modal-close-btn" onclick="closeTemplateModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Phím tắt (bắt đầu bằng /)</label>
                <input type="text" id="tplShortcut" class="form-input" placeholder="Ví dụ: /size, /stk, /sale">
            </div>

            <div class="form-group">
                <label class="form-label">Tiêu đề gợi nhớ</label>
                <input type="text" id="tplTitle" class="form-input" placeholder="Ví dụ: Bảng chọn size đầm">
            </div>

            <div class="form-group">
                <label class="form-label">Nội dung mẫu tin</label>
                <textarea id="tplContent" class="form-textarea" rows="4" placeholder="Nhập nội dung... Bấm các nút biến bên dưới để chèn tự động"></textarea>
            </div>

            <div class="variable-insert-bar">
                <span>Chèn biến động:</span>
                <button type="button" class="chip-var-btn" onclick="insertVariable('[ten_sp]')">+ Tên SP</button>
                <button type="button" class="chip-var-btn" onclick="insertVariable('[ma_sp]')">+ Mã SP</button>
                <button type="button" class="chip-var-btn" onclick="insertVariable('[gia]')">+ Giá</button>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tab-btn" onclick="closeTemplateModal()">Hủy</button>
            <button type="button" class="btn-send-message" onclick="saveNewTemplate()">Lưu Mẫu Tin</button>
        </div>
    </div>
</div>

<script>
    // Cấu hình biến môi trường từ PHP sang Javascript
    window.APP_CONFIG = {
        CURRENT_USER_ID: <?= (int)$currentUser['id'] ?>,
        CURRENT_USERNAME: '<?= addslashes($currentUser['username']) ?>',
        CURRENT_FULLNAME: '<?= addslashes($currentUser['fullname']) ?>',
        CURRENT_STATUS: '<?= addslashes($currentUser['status']) ?>',
        BASE_URL: '<?= addslashes(BASE_URL) ?>'
    };
</script>
<script src="../../public/js/workspace.js"></script>

</body>
</html>
