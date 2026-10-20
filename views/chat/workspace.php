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
    <title>OmniChat - Bàn làm việc tư vấn viên</title>
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
            <div class="brand-title">OmniChat</div>
        </div>
    </div>

    <div class="header-actions">
        <!-- Nút gạt trạng thái ca trực 1 chạm (Quick Shift Toggle) -->
        <div class="shift-toggle-btn <?= $currentUser['status'] === 'ONLINE' ? 'is-online' : 'is-offline' ?>" 
             id="shiftToggleBtn" 
             onclick="toggleShiftStatus()"
             title="Bấm để chuyển đổi ca trực">
            <span class="status-dot <?= $currentUser['status'] === 'ONLINE' ? 'online' : '' ?>" id="shiftDot"></span>
            <span class="shift-text" id="shiftText"><?= $currentUser['status'] === 'ONLINE' ? 'Sẵn sàng nhận khách' : 'Hết ca' ?></span>
            <div class="shift-switch-track">
                <div class="shift-switch-thumb"></div>
            </div>
        </div>

        <!-- Thông tin nhân viên -->
        <div class="user-profile-badge">
            <?php if (!empty($currentUser['avatar']) && filter_var($currentUser['avatar'], FILTER_VALIDATE_URL)): ?>
                <img src="<?= htmlspecialchars($currentUser['avatar']) ?>" class="user-avatar-circle" style="object-fit:cover;border:1.5px solid #C7D2FE;width:34px;height:34px;border-radius:50%;" alt="Avatar">
            <?php else: ?>
                <div class="user-avatar-circle"><?= mb_substr($currentUser['fullname'], 0, 1, 'UTF-8') ?></div>
            <?php endif; ?>
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
            <!-- Ô tìm kiếm hội thoại (Zalo Style: Tên khách & Tin nhắn) -->
            <div class="search-box-wrapper" style="display:flex;align-items:center;gap:6px;">
                <div style="position:relative;flex:1;">
                    <i class="fa-solid fa-magnifying-glass search-icon"></i>
                    <input type="text" id="searchInput" class="search-input" placeholder="Tìm theo tên khách, nội dung..." 
                           onfocus="enterSearchMode()" 
                           oninput="handleZaloSearch(this.value)"
                           onkeydown="if(event.key==='Escape') exitSearchMode()">
                    <button type="button" class="btn-clear-search" id="btnClearSearch" onclick="clearZaloSearch()" style="display:none;" title="Xóa tìm kiếm">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <button type="button" class="btn-close-search" id="btnCloseSearch" onclick="exitSearchMode()" title="Đóng tìm kiếm">Đóng</button>
            </div>

            <!-- Khối bộ lọc thông thường (Ẩn khi đang ở Search Mode) -->
            <div id="sidebarNormalControls">
                <!-- Segmented Tabs: Tất cả | Của tôi | Chưa đọc (kèm dropdown v) -->
                <div class="filter-tabs-row" id="filterTabsRow">
                    <button type="button" class="tab-btn" id="tabAll" onclick="switchMainTab('all')">
                        Tất cả
                    </button>
                    <button type="button" class="tab-btn active" id="tabMine" onclick="switchMainTab('mine')">
                        Của tôi
                    </button>
                    <div class="tab-dropdown-container" id="unreadDropdownContainer">
                        <div class="tab-btn tab-with-dropdown" id="tabUnread" style="padding:0;">
                            <span class="tab-unread-label-area" onclick="triggerUnreadTabClick()" title="Lọc các tin nhắn chưa đọc">
                                <span id="unreadTabLabel">Chưa đọc</span>
                            </span>
                            <span class="tab-unread-caret-btn" onclick="toggleUnreadDropdown(event)" title="Chọn phạm vi chưa đọc">
                                <i class="fa-solid fa-chevron-down tab-caret"></i>
                            </span>
                        </div>
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
                <div class="sub-filter-row" id="subFilterRow">
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
                            <div class="dropdown-action-item" onclick="openManageLabelsModal()">
                                <i class="fa-solid fa-gear"></i>
                                <span>Quản lý nhãn</span>
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
        </div>

        <!-- GIAO DIỆN TÌM KIẾM CHUYÊN DỤNG (ZALO STYLE) -->
        <div class="zalo-search-panel" id="zaloSearchPanel">
            <div class="zalo-search-tabs-row">
                <button type="button" class="zalo-search-tab-btn active" id="searchSubTabAll" onclick="switchSearchSubTab('all')">Tất cả</button>
                <button type="button" class="zalo-search-tab-btn" id="searchSubTabCustomers" onclick="switchSearchSubTab('customers')">Khách hàng</button>
                <button type="button" class="zalo-search-tab-btn" id="searchSubTabMessages" onclick="switchSearchSubTab('messages')">Tin nhắn</button>
            </div>
            <div class="zalo-search-results-container" id="zaloSearchResultsContainer">
                <div style="text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                    Nhập tên khách hàng hoặc từ khóa tin nhắn để tìm kiếm
                </div>
            </div>
        </div>

        <!-- Danh sách thẻ cuộc hội thoại (Respond.io Style - Ẩn khi đang ở Search Mode) -->
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
                <div class="lock-banner-title">CHẾ ĐỘ CHỈ XEM</div>
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
                    <!-- UC3.1: Ghim đính kèm ảnh (Hỗ trợ chọn nhiều ảnh) -->
                    <input type="file" id="attachmentInput" accept="image/*" multiple style="display:none;" onchange="handleAttachmentUpload(this)">
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
                </div>
            </div>
        </div>

        <!-- Thuộc tính bóc tách thông tin khách hàng (Customer Attributes CRM) -->
        <div class="profile-section-widget">
            <div class="section-widget-title">
                <i class="fa-solid fa-user-check"></i> Thông Tin Khách Hàng
            </div>

            <!-- Tên thật khách hàng -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label"><i class="fa-solid fa-signature"></i> Tên thật:</span>
                    <button type="button" class="btn-edit-inline crm-edit-btn" onclick="editFieldPrompt('real_name', 'Tên thật khách hàng')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                </div>
                <div class="attr-value-text" id="crmRealName">Chưa có thông tin</div>
            </div>

            <!-- Số điện thoại -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label"><i class="fa-solid fa-phone"></i> Số điện thoại:</span>
                    <button type="button" class="btn-edit-inline crm-edit-btn" onclick="editFieldPrompt('phone', 'Số điện thoại')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                </div>
                <div class="attr-value-text" id="crmPhone">Chưa có thông tin</div>
            </div>

            <!-- Địa chỉ nhận hàng -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label"><i class="fa-solid fa-location-dot"></i> Địa chỉ:</span>
                    <button type="button" class="btn-edit-inline crm-edit-btn" onclick="editFieldPrompt('address', 'Địa chỉ giao hàng')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                </div>
                <div class="attr-value-text" id="crmAddress">Chưa có thông tin</div>
            </div>

            <!-- Sản phẩm quan tâm -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label"><i class="fa-solid fa-bag-shopping"></i> Sản phẩm quan tâm:</span>
                    <button type="button" class="btn-edit-inline crm-edit-btn" onclick="editFieldPrompt('customer_needs', 'Sản phẩm quan tâm')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                </div>
                <div class="attr-value-text" id="crmCustomerNeeds">Chưa có thông tin</div>
            </div>

            <!-- Tóm tắt trao đổi -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label"><i class="fa-solid fa-comment-dots"></i> Tóm tắt trao đổi:</span>
                    <button type="button" class="btn-edit-inline crm-edit-btn" onclick="editFieldPrompt('conversation_summary', 'Tóm tắt nội dung trao đổi')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                </div>
                <div class="attr-value-text" id="crmSummary">Chưa có tóm tắt</div>
            </div>

            <!-- Mốc thời gian ghi nhận dữ liệu -->
            <div class="attr-footer-time">
                <i class="fa-regular fa-calendar-days"></i>
                <span>Dữ liệu từ:</span>
                <strong id="crmDateRange">--/--/---- đến --/--/----</strong>
            </div>
        </div>

        <!-- Nút Cập nhật hồ sơ -->
        <button type="button" class="btn-update-profile" id="btnUpdateProfile" onclick="handleUpdateCustomerProfile()">
            <i class="fa-solid fa-arrows-rotate"></i>
            <span>CẬP NHẬT HỒ SƠ</span>
        </button>

        <!-- Quản lý Nhãn Phân Loại (Custom Labels - Chip Toggle Đa Chọn) -->
        <div class="profile-section-widget">
            <div class="section-widget-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span><i class="fa-solid fa-tags"></i> Nhãn Phân Loại</span>
                <button type="button" class="btn-edit-inline crm-edit-btn" onclick="openManageLabelsModal()">
                    <i class="fa-solid fa-gear"></i> Quản lý nhãn
                </button>
            </div>
            <div class="chips-selector-grid" id="profileLabelsList">
                <!-- Render các chip nhãn tương tác trực tiếp -->
            </div>
        </div>
    </aside>

</div>

<!-- ========================================================
     MODAL POPUP QUẢN LÝ NHÃN (DANH SÁCH, SỬA, XÓA, NÚT THÊM)
     ======================================================== -->
<div class="modal-overlay" id="modalManageLabels" style="display:none;">
    <div class="modal-content" style="max-width: 520px;">
        <div class="modal-header">
            <h3 class="modal-title"><i class="fa-solid fa-tags" style="color:var(--primary);"></i> Quản Lý Nhãn Phân Loại</h3>
            <button type="button" class="modal-close-btn" onclick="closeManageLabelsModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding:16px;">
            <div id="labelManageListContainer" class="label-manage-list">
                <!-- Danh sách nhãn nạp động -->
            </div>
        </div>
        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
            <button type="button" class="tab-btn" onclick="closeManageLabelsModal()">Đóng</button>
            <button type="button" class="btn-send-message" onclick="openCreateLabelFromManage()">
                <i class="fa-solid fa-plus"></i> Thêm nhãn mới
            </button>
        </div>
    </div>
</div>

<!-- ========================================================
     MODAL POPUP TẠO NHÃN MỚI (BẢNG MÀU TÙY Ý)
     ======================================================== -->
<div class="modal-overlay" id="modalCreateLabel" style="display:none;">
    <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
            <h3 class="modal-title"><i class="fa-solid fa-circle-plus" style="color:var(--primary);"></i> Tạo Nhãn Mới</h3>
            <button type="button" class="modal-close-btn" onclick="closeCreateLabelModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Tên nhãn phân loại</label>
                <input type="text" id="newLabelName" class="form-input" placeholder="Ví dụ: Khách mới, Khách VIP, Chờ gọi lại...">
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

                <!-- Bộ chọn màu tự do (Kéo chọn màu tùy ý) -->
                <div class="custom-color-picker-row">
                    <input type="color" id="newLabelColorPicker" class="color-picker-input-circle" value="#2563EB" oninput="syncColorFromPicker(this.value)">
                    <div style="flex:1;">
                        <div style="font-size:12px;font-weight:600;color:#334155;">Chọn màu tùy ý từ bảng màu</div>
                        <div style="font-size:11px;color:#94a3b8;">Kéo thanh trượt hoặc bảng màu để chọn</div>
                    </div>
                    <span class="color-hex-badge" id="colorHexDisplay">#2563EB</span>
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
        CURRENT_AVATAR: '<?= addslashes($currentUser['avatar'] ?? '') ?>',
        CURRENT_STATUS: '<?= addslashes($currentUser['status']) ?>',
        BASE_URL: '<?= addslashes(BASE_URL) ?>',
        RENDER_GATEWAY_URL: '<?= addslashes(RENDER_GATEWAY_URL) ?>'
    };
</script>
<script src="../../public/js/workspace.js?v=<?= time() ?>"></script>

</body>
</html>
