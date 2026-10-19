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
         PHÂN VÙNG 1: SIDEBAR TRÁI (Tiếp nhận & Bộ lọc Respond.io)
         ==================================================== -->
    <aside class="zone-sidebar-left">
        <div class="sidebar-controls">
            <!-- Ô tìm kiếm hội thoại (chỉ tìm theo tên khách & nội dung) -->
            <div class="search-box-wrapper">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input type="text" id="searchInput" class="search-input" placeholder="Tìm theo tên khách, nội dung..." oninput="handleSearch(this.value)">
                <button type="button" class="btn-clear-search" id="btnClearSearch" onclick="clearSearch()" style="display:none;" title="Xóa tìm kiếm">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Segmented Tabs: Tất cả | Của tôi | Chưa đọc (kèm dropdown v) -->
            <div class="filter-tabs-row">
                <button type="button" class="tab-btn" id="tabAll" onclick="switchMainTab('all')">
                    Tất cả
                </button>
                <button type="button" class="tab-btn active" id="tabMine" onclick="switchMainTab('mine')">
                    Của tôi
                </button>
                <div class="tab-dropdown-container" id="unreadDropdownContainer">
                    <button type="button" class="tab-btn tab-with-dropdown" id="tabUnread" onclick="toggleUnreadDropdown(event)">
                        <span id="unreadTabLabel">Chưa đọc</span>
                        <i class="fa-solid fa-chevron-down tab-caret"></i>
                    </button>
                    <div class="tab-dropdown-menu" id="unreadDropdownMenu">
                        <div class="dropdown-item active" id="unreadOptAll" onclick="selectUnreadScope('all')">
                            <i class="fa-solid fa-layer-group"></i>
                            <span>Tất cả</span>
                        </div>
                        <div class="dropdown-item" id="unreadOptMine" onclick="selectUnreadScope('mine')">
                            <i class="fa-solid fa-user-check"></i>
                            <span>Của tôi</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sub Filter Row: Dropdown Phân loại & Dropdown Kênh -->
            <div class="sub-filter-row">
                <!-- Dropdown Phân loại (Labels) -->
                <div class="filter-dropdown-container" id="labelDropdownContainer">
                    <button type="button" class="filter-dropdown-btn" id="btnFilterLabel" onclick="toggleLabelDropdown(event)">
                        <i class="fa-solid fa-tags"></i>
                        <span id="currentLabelName">Phân loại</span>
                        <i class="fa-solid fa-chevron-down caret-mini"></i>
                    </button>
                    <div class="filter-dropdown-menu" id="labelDropdownMenu">
                        <div class="dropdown-header-title">Lọc theo nhãn</div>
                        <div class="dropdown-item active" id="labelOptAll" onclick="selectLabelFilter(0, 'Phân loại')">
                            <span class="label-color-dot" style="background:#64748B;"></span>
                            <span>Tất cả nhãn</span>
                        </div>
                        <div id="labelsListContainer">
                            <!-- Nạp danh sách nhãn tự động -->
                        </div>
                        <div class="dropdown-divider"></div>
                        <div class="dropdown-action-item" onclick="openCreateLabelModal()">
                            <i class="fa-solid fa-plus"></i>
                            <span>Tạo nhãn mới</span>
                        </div>
                    </div>
                </div>

                <!-- Dropdown Kênh (Webchat, Zalo, Facebook) -->
                <div class="filter-dropdown-container" id="channelDropdownContainer">
                    <button type="button" class="filter-dropdown-btn" id="btnFilterChannel" onclick="toggleChannelDropdown(event)">
                        <i class="fa-solid fa-filter"></i>
                        <span id="currentChannelName">Kênh</span>
                        <i class="fa-solid fa-chevron-down caret-mini"></i>
                    </button>
                    <div class="filter-dropdown-menu" id="channelDropdownMenu">
                        <div class="dropdown-item active" id="channelOptAll" onclick="selectChannelFilter('', 'Kênh')">
                            <i class="fa-solid fa-border-all"></i>
                            <span>Tất cả kênh</span>
                        </div>
                        <div class="dropdown-item" id="channelOptWebchat" onclick="selectChannelFilter('WEBCHAT', 'Webchat')">
                            <i class="fa-solid fa-globe" style="color:#10B981;"></i>
                            <span>Webchat</span>
                        </div>
                        <div class="dropdown-item" id="channelOptZalo" onclick="selectChannelFilter('ZALO', 'Zalo')">
                            <i class="fa-solid fa-comment-dots" style="color:#0068FF;"></i>
                            <span>Zalo</span>
                        </div>
                        <div class="dropdown-item" id="channelOptFb" onclick="selectChannelFilter('FACEBOOK', 'Facebook')">
                            <i class="fa-brands fa-facebook-messenger" style="color:#0084FF;"></i>
                            <span>Facebook</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Danh sách thẻ cuộc hội thoại (Respond.io Style) -->
        <div class="conversations-list" id="conversationsContainer">
            <div class="conversations-loading">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>Đang tải danh sách hội thoại...</span>
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
                <div class="partner-avatar-wrapper">
                    <div class="partner-avatar" id="activeAvatar">?</div>
                    <span class="partner-channel-mini-badge" id="activeAvatarChannelIcon"><i class="fa-solid fa-comments"></i></span>
                </div>
                <div class="partner-meta-block">
                    <div class="partner-name-row">
                        <span class="partner-name" id="activeSenderName">Khách Hàng</span>
                        <span id="activeTagBadge" class="card-tag-badge" style="display:none;"></span>
                    </div>
                    <div class="partner-submeta-row">
                        <span class="partner-assignee-text" id="activeAssigneeText">Phụ trách: Chưa gán</span>
                    </div>
                </div>
            </div>
            <div class="chat-header-actions" id="activeLockIndicator"></div>
        </div>

        <!-- UC2.2: Banner Khóa View-Only khi khách thuộc quyền nhân viên khác -->
        <div class="view-only-lock-banner" id="viewOnlyLockBanner" style="display:none;">
            <div class="lock-banner-icon"><i class="fa-solid fa-shield-halved"></i></div>
            <div class="lock-banner-body">
                <div class="lock-banner-title">CHẾ ĐỘ CHỈ XEM (VIEW-ONLY)</div>
                <div class="lock-banner-desc" id="viewOnlyLockText">
                    Hội thoại đang được phụ trách bởi nhân viên khác. Bạn không có quyền gửi tin nhắn.
                </div>
            </div>
        </div>

        <!-- Khu vực tin nhắn cuộn -->
        <div class="chat-messages-viewport" id="messagesViewport">
            <div class="chat-empty-state" id="chatEmptyState">
                <div class="empty-icon-circle">
                    <i class="fa-regular fa-comments"></i>
                </div>
                <h3>Chọn cuộc trò chuyện để bắt đầu</h3>
                <p>Tin nhắn đa kênh được tự động đồng bộ theo thời gian thực</p>
            </div>
        </div>

        <!-- Khung nhập liệu tin nhắn (Ẩn khi bị khóa View-Only) -->
        <div class="chat-input-container" id="chatInputArea" style="display:none;">
            <!-- Autocomplete Popup khi gõ phím tắt / -->
            <div class="template-shortcut-preview" id="shortcutPreviewBar">
                <span id="shortcutPreviewText"><i class="fa-solid fa-bolt"></i> Gợi ý: Gõ <strong>/</strong> để chọn mẫu câu trả lời nhanh</span>
                <button type="button" class="btn-apply-shortcut" onclick="applyShortcutDirectly()">
                    <span>Điền mẫu</span> <i class="fa-solid fa-arrow-turn-down"></i>
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
                        <i class="fa-solid fa-bolt"></i>
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
         PHÂN VÙNG 3: SIDEBAR PHẢI (TÓM TẮT THÔNG TIN & CRM - Respond.io Style)
         ==================================================== -->
    <aside class="zone-sidebar-right" id="rightSidebar" style="display:none;">
        <div class="sidebar-right-header">
            <div class="sidebar-right-title">
                <i class="fa-solid fa-id-card-clip"></i>
                <span>Tóm Tắt Khách Hàng</span>
            </div>
            <span class="profile-version-chip" id="scanVersionBadge">
                <i class="fa-solid fa-wand-magic-sparkles"></i> v1.0
            </span>
        </div>

        <!-- Thẻ đại diện danh tính khách hàng -->
        <div class="customer-profile-card">
            <div class="partner-avatar-wrapper avatar-wrapper-large">
                <div class="customer-avatar-large" id="rightCustomerAvatar">?</div>
                <span class="partner-channel-mini-badge badge-channel-large" id="rightAvatarChannelIcon">
                    <i class="fa-solid fa-comments"></i>
                </span>
            </div>
            <div class="customer-primary-meta">
                <div class="customer-name-heading">
                    <span id="profileCustomerName">Đang tải...</span>
                    <button type="button" class="btn-edit-icon" title="Chỉnh sửa tên khách hàng" onclick="editFieldPrompt('customer_name', 'Tên khách hàng')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
                <div class="customer-channel-subtext" id="rightChannelSubtext">#1</div>
            </div>
        </div>

        <!-- UC3.3: Thẻ Cảnh báo Rủi ro Bùng hàng -->
        <div class="boom-risk-warning-badge" id="boomRiskBadge" style="display:none;">
            <div class="boom-badge-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div class="boom-badge-content">
                <div class="boom-text-title">CẢNH BÁO RỦI RO BÙNG HÀNG</div>
                <div class="boom-text-desc" id="boomRiskNote">
                    Phát hiện lịch sử từ chối nhận hàng. Đề nghị yêu cầu đặt cọc trước khi giao!
                </div>
            </div>
        </div>

        <div class="safe-customer-badge" id="safeCustomerBadge" style="display:none;">
            <i class="fa-solid fa-circle-check"></i>
            <span>Khách hàng uy tín - Chưa ghi nhận rủi ro hoàn đơn</span>
        </div>

        <!-- Thuộc tính bóc tách thông tin khách hàng (Customer Attributes) -->
        <div class="profile-section-widget">
            <div class="section-widget-title">
                <i class="fa-solid fa-sliders"></i> Thông Tin Bóc Tách
            </div>

            <!-- Size thường mặc -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label"><i class="fa-solid fa-shirt"></i> Size thường mặc:</span>
                    <button type="button" class="btn-edit-inline" onclick="editFieldPrompt('preferred_size', 'Kích cỡ thường mặc')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                </div>
                <div class="attr-value-pill" id="profilePreferredSize">Chưa xác định</div>
                <div class="quick-size-row">
                    <span class="quick-size-hint">Chọn nhanh:</span>
                    <button type="button" class="size-chip-btn" onclick="quickSetSize('S')">S</button>
                    <button type="button" class="size-chip-btn" onclick="quickSetSize('M')">M</button>
                    <button type="button" class="size-chip-btn" onclick="quickSetSize('L')">L</button>
                    <button type="button" class="size-chip-btn" onclick="quickSetSize('XL')">XL</button>
                </div>
            </div>

            <!-- Sản phẩm quan tâm / Mua gần nhất -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label"><i class="fa-solid fa-bag-shopping"></i> Mua gần nhất:</span>
                    <button type="button" class="btn-edit-inline" onclick="editFieldPrompt('recent_purchases', 'Sản phẩm mua gần nhất')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                </div>
                <div class="attr-value-text" id="profileRecentPurchases">Chưa có thông tin đơn cũ</div>
            </div>

            <!-- Thời gian cập nhật gần nhất -->
            <div class="attr-footer-time">
                <span>Cập nhật lần cuối:</span>
                <strong id="profileLastUpdated">Vừa xong</strong>
            </div>
        </div>

        <!-- Quản lý Nhãn Hội Thoại Tùy Biến (Custom Labels Widget) -->
        <div class="profile-section-widget">
            <div class="section-widget-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span><i class="fa-solid fa-tags"></i> Nhãn Hội Thoại</span>
                <button type="button" class="btn-edit-inline" onclick="toggleAssignLabelDropdown(event)">
                    <i class="fa-solid fa-plus"></i> Gán nhãn
                </button>
            </div>
            <div class="assigned-labels-container" id="profileLabelsList">
                <span class="no-labels-text">Chưa gắn nhãn</span>
            </div>
            <!-- Popover dropdown gán nhãn cho hội thoại hiện tại -->
            <div class="assign-label-popover" id="assignLabelPopover" style="display:none;">
                <div class="popover-title">Chọn nhãn cho hội thoại:</div>
                <div class="popover-labels-list" id="popoverLabelsList"></div>
            </div>
        </div>

        <!-- UC3.3: Nút Kích hoạt Agent Quét Lại -->
        <button type="button" class="btn-rescan-agent" id="btnRescanAgent" onclick="triggerAgentScan()">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>QUÉT LẠI HỒ SƠ (AI AGENT)</span>
        </button>

        <!-- UC3.4: Bộ chọn Gắn nhãn trạng thái tiến độ -->
        <div class="tag-selector-widget">
            <div class="section-widget-title">
                <i class="fa-solid fa-chart-line"></i> Tiến Độ Tư Vấn
            </div>
            <div class="tag-options-list">
                <label class="tag-radio-label tag-opt-consulting">
                    <input type="radio" name="convTagRadio" value="DANG_TU_VAN" onchange="handleTagChange(this.value)">
                    <span class="tag-indicator-dot"></span>
                    <span class="tag-label-text">Đang tư vấn</span>
                    <i class="fa-solid fa-check tag-check-icon"></i>
                </label>

                <label class="tag-radio-label tag-opt-closed">
                    <input type="radio" name="convTagRadio" value="DA_CHOT" onchange="handleTagChange(this.value)">
                    <span class="tag-indicator-dot"></span>
                    <span class="tag-label-text">Đã chốt đơn</span>
                    <i class="fa-solid fa-check tag-check-icon"></i>
                </label>

                <label class="tag-radio-label tag-opt-pending">
                    <input type="radio" name="convTagRadio" value="CHO_CHUYEN_KHOAN" onchange="handleTagChange(this.value)">
                    <span class="tag-indicator-dot"></span>
                    <span class="tag-label-text">Chờ chuyển khoản</span>
                    <i class="fa-solid fa-check tag-check-icon"></i>
                </label>

                <label class="tag-radio-label tag-opt-boom">
                    <input type="radio" name="convTagRadio" value="BOOM_HANG" onchange="handleTagChange(this.value)">
                    <span class="tag-indicator-dot"></span>
                    <span class="tag-label-text">Rủi ro hoàn hàng</span>
                    <i class="fa-solid fa-check tag-check-icon"></i>
                </label>
            </div>
        </div>
    </aside>

</div>

<!-- ========================================================
     MODAL POPUP TẠO NHÃN MỚI
     ======================================================== -->
<div class="modal-overlay" id="modalCreateLabel" style="display:none;">
    <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
            <h3 class="modal-title"><i class="fa-solid fa-tag" style="color:#2563EB;"></i> Tạo Nhãn Mới</h3>
            <button type="button" class="modal-close-btn" onclick="closeCreateLabelModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Tên nhãn phân loại</label>
                <input type="text" id="newLabelName" class="form-input" placeholder="Ví dụ: New Lead, Khách VIP, Chờ gọi lại...">
            </div>

            <div class="form-group">
                <label class="form-label">Màu sắc nhận diện</label>
                <div class="color-palette-grid">
                    <button type="button" class="color-swatch active" style="background:#2563EB;" onclick="selectLabelColor(this, '#2563EB')"></button>
                    <button type="button" class="color-swatch" style="background:#10B981;" onclick="selectLabelColor(this, '#10B981')"></button>
                    <button type="button" class="color-swatch" style="background:#F59E0B;" onclick="selectLabelColor(this, '#F59E0B')"></button>
                    <button type="button" class="color-swatch" style="background:#EF4444;" onclick="selectLabelColor(this, '#EF4444')"></button>
                    <button type="button" class="color-swatch" style="background:#8B5CF6;" onclick="selectLabelColor(this, '#8B5CF6')"></button>
                    <button type="button" class="color-swatch" style="background:#EC4899;" onclick="selectLabelColor(this, '#EC4899')"></button>
                    <button type="button" class="color-swatch" style="background:#0F172A;" onclick="selectLabelColor(this, '#0F172A')"></button>
                    <button type="button" class="color-swatch" style="background:#06B6D4;" onclick="selectLabelColor(this, '#06B6D4')"></button>
                </div>
                <input type="hidden" id="newLabelColor" value="#2563EB">
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tab-btn" onclick="closeCreateLabelModal()">Hủy</button>
            <button type="button" class="btn-send-message" onclick="saveNewLabel()">Tạo Nhãn</button>
        </div>
    </div>
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
        BASE_URL: '<?= addslashes(BASE_URL) ?>',
        RENDER_GATEWAY_URL: '<?= addslashes(RENDER_GATEWAY_URL) ?>'
    };
</script>
<script src="../../public/js/workspace.js?v=<?= time() ?>"></script>

</body>
</html>
