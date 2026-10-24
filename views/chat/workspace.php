<?php
/**
 * VIEW: chat/workspace.php
 * Màn hình Không gian Chat tập trung (Unified Chat Workspace 3 Phân vùng)
 */

require_once __DIR__ . '/../../config/constants.php';
require_once __DIR__ . '/../../controllers/AuthController.php';
require_once __DIR__ . '/../../controllers/ChatController.php';

$authController = new AuthController();

// Xử lý đăng xuất TRƯỚC TIÊN (Trước khi gửi bất kỳ thẻ HTML nào!)
if (isset($_GET['logout'])) {
    $authController->logout();
    header('Location: ' . BASE_URL . '/views/auth/login.php');
    exit;
}

requireLogin();

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
    <meta name="referrer" content="no-referrer">
    <title>OmniChat - Bàn làm việc tư vấn viên</title>
    <link rel="stylesheet" href="../../public/css/style.css?v=<?= time() ?>">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>

<!-- ========================================================
     HEADER CỐ ĐỊNH
     ======================================================== -->
<header class="app-header">
    <div class="brand-section">
        <div>
            <div class="brand-title">OmniChat</div>
        </div>
    </div>

    <div class="header-actions">
        <!-- Nút mở Modal Google Sheets (Tích hợp bảng tính) -->
        <button type="button" class="topbar-action-btn" id="btnOpenGSheetModal" onclick="openGoogleSheetModal()" title="Bảng tính Google Sheets">
            <i class="fa-solid fa-file-excel" style="color:#10B981;font-size:16px;"></i>
            <span>Google Sheets</span>
            <span class="gsheet-sync-dot" id="gsheetSyncDot" style="display:none;" title="Có dữ liệu mới cần đồng bộ"></span>
        </button>

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
            <a href="../auth/logout.php" class="btn-logout" title="Đăng xuất (Kết thúc ca trực)" onclick="return confirm('Bạn có chắc muốn đăng xuất và rời ca trực?');">
                <i class="fa-solid fa-right-from-bracket"></i>
            </a>
        </div>
    </div>
</header>

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
        <div class="chat-input-container" id="chatInputArea" style="display:none;position:relative;">
            <!-- Autocomplete Suggestion Popup khi gõ phím tắt / (Phase 4) -->
            <div class="template-suggest-popup" id="templateSuggestPopup" style="display:none;">
                <div class="suggest-popup-header">
                    <div class="suggest-header-title">
                        <span>Mẫu Trả Lời Nhanh</span>
                    </div>
                    <button type="button" class="btn-close-suggest" onclick="closeShortcutSuggestPopup()">&times;</button>
                </div>

                <!-- Danh sách gợi ý template -->
                <div class="suggest-items-list" id="suggestTemplatesList"></div>

                <!-- Phân vùng chọn dòng Google Sheet khi template có biến [id] / [sản phẩm]... -->
                <div class="suggest-sheet-picker" id="suggestSheetPicker" style="display:none;">
                    <div class="suggest-sheet-picker-header">
                        <span><i class="fa-solid fa-file-excel" style="color:#10B981;"></i> Chọn sản phẩm từ Google Sheet để điền dữ liệu:</span>
                        <button type="button" class="btn-cancel-picker" onclick="hideSheetRowPicker()">Quay lại danh sách</button>
                    </div>
                    <div class="suggest-sheet-rows-list" id="suggestSheetRowsList"></div>
                </div>
            </div>

            <div class="chat-input-wrapper">
                <!-- Thanh preview các ảnh đính kèm từ template hoặc chọn thủ công -->
                <div class="chat-attached-previews" id="chatAttachedPreviews" style="display:none;"></div>
                <textarea id="chatInput" class="chat-textarea" rows="2" placeholder="Nhập tin nhắn tư vấn... (Gõ / để dùng mẫu trả lời nhanh, Enter để gửi)" onkeydown="handleChatKeyDown(event)" onkeyup="handleShortcutDetect(event)"></textarea>

                <div class="input-actions-group">
                    <!-- UC3.1: Ghim đính kèm ảnh (Hỗ trợ chọn nhiều ảnh) -->
                    <input type="file" id="attachmentInput" accept="image/*" multiple style="display:none;" onchange="handleAttachmentUpload(this)">
                    <button type="button" class="icon-action-btn" title="Đính kèm ảnh sản phẩm / bảng size" onclick="document.getElementById('attachmentInput').click()">
                        <i class="fa-solid fa-paperclip"></i>
                    </button>

                    <!-- UC3.2: Popup Quản lý & Tạo mẫu tin nhắn nhanh -->
                    <button type="button" class="icon-action-btn" title="Quản lý mẫu tin nhắn nhanh" onclick="openManageTemplatesModal()">
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
        <!-- Thuộc tính bóc tách thông tin khách hàng (Customer Attributes CRM) -->
        <div class="profile-section-widget">
            <div class="section-widget-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>THÔNG TIN KHÁCH HÀNG</span>
                <button type="button" class="btn-edit-inline crm-edit-btn" id="btnEditCustomerProfile" onclick="openEditCustomerProfileModal()">
                    <i class="fa-solid fa-pen-to-square"></i> Sửa
                </button>
            </div>

            <!-- 1. Họ và tên -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Họ và tên:</span>
                </div>
                <div class="attr-value-text" id="crmRealName">Chưa có thông tin</div>
            </div>

            <!-- 2. Số điện thoại -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Số điện thoại:</span>
                </div>
                <div class="attr-value-text" id="crmPhone">Chưa có thông tin</div>
            </div>

            <!-- 3. Địa chỉ -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Địa chỉ:</span>
                </div>
                <div class="attr-value-text" id="crmAddress">Chưa có thông tin</div>
            </div>

            <!-- 4. Số đo -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Số đo:</span>
                </div>
                <div class="attr-value-text" id="crmBodyMeasurements">Chưa có thông tin</div>
            </div>

            <!-- 5. Sản phẩm quan tâm -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Sản phẩm quan tâm:</span>
                </div>
                <div class="attr-value-text" id="crmCustomerNeeds">Chưa có thông tin</div>
            </div>

            <!-- 6. Đơn hàng từng mua -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Đơn hàng từng mua:</span>
                </div>
                <div class="attr-value-text" id="crmRecentPurchases">Chưa có thông tin</div>
            </div>

            <!-- 7. Ghi chú -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Ghi chú:</span>
                </div>
                <div class="attr-value-text" id="crmNotes">Chưa có thông tin</div>
            </div>

            <!-- 8. Tóm tắt hội thoại -->
            <div class="attribute-item-box">
                <div class="attr-header">
                    <span class="attr-label">Tóm tắt hội thoại:</span>
                </div>
                <div class="attr-value-text" id="crmSummary">Chưa có tóm tắt</div>
            </div>

            <!-- Mốc thời gian ghi nhận dữ liệu -->
            <div class="attr-footer-time">
                <span>Dữ liệu từ:</span>
                <strong id="crmDateRange">--/--/---- đến --/--/----</strong>
            </div>
        </div>

        <!-- Nút Cập nhật hồ sơ -->
        <button type="button" class="btn-update-profile" id="btnUpdateProfile" onclick="handleUpdateCustomerProfile()">
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

<!-- ========================================================
     MODAL POPUP TÍCH HỢP GOOGLE SHEETS (PHASE 2)
     Tab 1: Cấu hình liên kết (Chỉ Admin)
     Tab 2: Bảng dữ liệu Sheet (CHẾ ĐỘ CHỈ XEM 100%)
     ======================================================== -->
<div class="modal-overlay" id="modalGoogleSheet" style="display:none;">
    <div class="modal-content modal-content-wide">
        <div class="modal-header">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="background:#ECFDF5;color:#10B981;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;">
                    <i class="fa-solid fa-file-excel"></i>
                </div>
                <div>
                    <h3 class="modal-title" style="margin:0;font-size:16px;">Tích Hợp Google Sheets</h3>
                    <div style="font-size:11.5px;color:#64748B;" id="gsheetHeaderSubtitle">Bảng dữ liệu & Trích xuất biến động mẫu tin</div>
                </div>
            </div>
            <button type="button" class="modal-close-btn" onclick="closeGoogleSheetModal()">&times;</button>
        </div>

        <!-- Thanh chuyển đổi 2 Tab -->
        <div class="modal-subtabs-nav">
            <button type="button" class="modal-subtab-btn active" id="btnTabGSheetConfig" onclick="switchGSheetTab('config')">
                <i class="fa-solid fa-sliders"></i> Cấu hình kết nối
            </button>
            <button type="button" class="modal-subtab-btn" id="btnTabGSheetData" onclick="switchGSheetTab('data')">
                <i class="fa-solid fa-table"></i> Bảng dữ liệu
            </button>
        </div>

        <!-- Banner cảnh báo khi Google Sheet có dữ liệu mới -->
        <div class="gsheet-alert-banner" id="gsheetChangeAlertBanner" style="display:none;">
            <div style="display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-triangle-exclamation" style="color:#D97706;font-size:16px;"></i>
                <span>Phát hiện dữ liệu trên Google Sheet có cập nhật mới. Bấm "Đồng bộ ngay" để cập nhật vào hệ thống!</span>
            </div>
            <?php if (strtolower($currentUser['username']) === 'admin'): ?>
                <button type="button" class="btn-alert-sync" onclick="syncGoogleSheetNow()">
                    <i class="fa-solid fa-arrows-rotate"></i> Đồng bộ ngay
                </button>
            <?php endif; ?>
        </div>

        <div class="modal-body" style="padding:18px 20px;">
            <!-- TAB 1: CẤU HÌNH LIÊN KẾT (CHỈ ADMIN SỬA ĐƯỢC) -->
            <div id="paneGSheetConfig" class="modal-tab-pane">
                <?php if (strtolower($currentUser['username']) !== 'admin'): ?>
                    <div class="viewonly-notice-box">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Chế độ xem: Bạn đang đăng nhập bằng tài khoản Nhân viên. Chỉ Admin mới có quyền chỉnh sửa cấu hình liên kết và thực hiện đồng bộ.</span>
                    </div>
                <?php endif; ?>

                <div class="form-group">
                    <label class="form-label">Link Google Sheet (Trang tính gốc)</label>
                    <input type="url" id="gsheetUrlInput" class="form-input" placeholder="https://docs.google.com/spreadsheets/d/.../edit" <?= strtolower($currentUser['username']) !== 'admin' ? 'disabled' : '' ?>>
                </div>

                <div class="form-group">
                    <label class="form-label">URL Web App của Google Apps Script <span style="color:#EF4444;">*</span></label>
                    <input type="url" id="gsheetScriptUrlInput" class="form-input" placeholder="https://script.google.com/macros/s/.../exec" <?= strtolower($currentUser['username']) !== 'admin' ? 'disabled' : '' ?>>
                    <div style="font-size:11.5px;color:#64748B;margin-top:2px;">URL ứng dụng web được triển khai từ Apps Script của trang tính (quyền truy cập: Bất kỳ ai).</div>
                </div>

                <!-- Trạng thái kết nối hiện tại & Danh sách biến theo từng bảng tính -->
                <div class="gsheet-status-box" id="gsheetStatusBox" style="display:none;margin-top:16px;">
                    <div class="status-box-row" style="margin-bottom:10px;">
                        <span>Lần đồng bộ cuối: <strong id="gsheetLastSyncTime">--:--</strong></span>
                    </div>
                    <div style="font-size:11px;font-weight:700;color:#64748B;margin-bottom:8px;text-transform:uppercase;">Danh sách biến cột phân theo từng bảng tính:</div>
                    <div id="gsheetDetectedColsList">
                        <!-- Render từng bảng tính kèm chip biến tương ứng -->
                    </div>
                </div>
            </div>

            <!-- TAB 2: BẢNG DỮ LIỆU SHEET (CHẾ ĐỘ CHỈ XEM 100%) -->
            <div id="paneGSheetData" class="modal-tab-pane" style="display:none;">
                <!-- Thanh chuyển đổi danh sách các trang tính (Multi-sheet Tabs) -->
                <div class="sheet-tabs-nav-bar" id="sheetTabsNavBar" style="display:none;margin-bottom:12px;">
                    <div class="sheet-tabs-list" id="sheetTabsListContainer">
                        <!-- Render các tab: [ 📄 SanPham (8) ] [ 📄 TonKho (87) ] ... -->
                    </div>
                </div>

                <div class="sheet-table-scroll-container" id="sheetTableContainer">
                    <div style="text-align:center;padding:50px 20px;color:#94A3B8;font-size:13px;">
                        <i class="fa-solid fa-table-cells" style="font-size:28px;margin-bottom:10px;display:block;opacity:0.4;"></i>
                        Chưa có dữ liệu bảng tính. Bấm "Cấu hình kết nối" và thực hiện đồng bộ.
                    </div>
                </div>
            </div>
        </div>

        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
            <button type="button" class="tab-btn" onclick="closeGoogleSheetModal()">Đóng</button>
            
            <!-- Nút điều khiển khi đang ở Tab 1: Cấu hình kết nối -->
            <div id="footerConfigButtons" style="display:flex;gap:8px;">
                <?php if (strtolower($currentUser['username']) === 'admin'): ?>
                    <button type="button" class="tab-btn" id="btnSaveGSheetConfig" onclick="saveGoogleSheetConfig()" style="background:#F1F5F9;border:1px solid #CBD5E1;font-weight:700;">
                        <i class="fa-solid fa-floppy-disk"></i> Lưu cấu hình
                    </button>
                    <button type="button" class="btn-send-message" id="btnSyncGSheetModal" onclick="syncGoogleSheetNow()" style="background:linear-gradient(135deg, #10B981, #059669);">
                        <i class="fa-solid fa-arrows-rotate"></i> Đồng bộ ngay
                    </button>
                <?php endif; ?>
            </div>

            <!-- Nút điều khiển khi đang ở Tab 2: Bảng dữ liệu -->
            <div id="footerDataButtons" style="display:none;gap:8px;">
                <button type="button" class="tab-btn" id="btnRefreshSheetData" onclick="loadGoogleSheetData(true)" style="background:#F1F5F9;border:1px solid #CBD5E1;font-weight:700;">
                    <i class="fa-solid fa-arrows-rotate"></i> Làm mới
                </button>
                <?php if (strtolower($currentUser['username']) === 'admin'): ?>
                    <button type="button" class="btn-send-message" id="btnSyncFromDataTab" onclick="syncGoogleSheetNow()" style="background:linear-gradient(135deg, #10B981, #059669);">
                        <i class="fa-solid fa-arrows-rotate"></i> Đồng bộ từ Sheet
                    </button>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- Form & Iframe ẩn đồng bộ Google Sheet (Miễn nhiễm 100% với OpenResty 403) -->
<form id="hiddenGSheetSyncForm" method="POST" action="test_sheet.php" target="hiddenGSheetSyncIframe" style="display:none;">
    <input type="hidden" name="direct_save" id="hiddenGSheetActionSave" value="0">
    <input type="hidden" name="direct_sync_client" id="hiddenGSheetActionSync" value="0">
    <input type="hidden" name="script_url" id="hiddenGSheetScriptUrl">
    <input type="hidden" name="sheet_url" id="hiddenGSheetSheetUrl">
    <input type="hidden" name="sheet_name" id="hiddenGSheetSheetName">
    <input type="hidden" name="client_json" id="hiddenGSheetClientJson">
</form>
<iframe name="hiddenGSheetSyncIframe" id="hiddenGSheetSyncIframe" style="display:none;"></iframe>

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
                <label class="form-label">Tên nhãn phân loại <span style="color:#EF4444;">*</span></label>
                <input type="text" id="newLabelName" class="form-input" placeholder="Ví dụ: Khách mới, Khách VIP, Chờ gọi lại..." oninput="handleValidateNewLabelName(this.value)">
                <div class="shortcut-invalid-text" id="newLabelDuplicateError" style="display:none; color:#EF4444; font-size:12px; margin-top:4px; align-items:center; gap:6px;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span id="newLabelDuplicateErrorText">Tên nhãn này đã tồn tại trong hệ thống!</span>
                </div>
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
     MODAL POPUP QUẢN LÝ TEMPLATE (PHASE 3)
     Danh sách mẫu tin, Inline Editing Sửa/Lưu/Hủy, Xóa, Nút Thêm
     ======================================================== -->
<div class="modal-overlay" id="modalManageTemplates" style="display:none;">
    <div class="modal-content" style="max-width: 680px; width: 95%;">
        <div class="modal-header">
            <h3 class="modal-title" style="margin:0;font-size:16px;">Quản Lý Mẫu Tin Nhắn Nhanh</h3>
            <button type="button" class="modal-close-btn" onclick="closeManageTemplatesModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding:16px 20px;">
            <div id="templateManageListContainer" class="template-manage-list">
                <!-- Danh sách template render động -->
            </div>
        </div>
        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
            <button type="button" class="tab-btn" onclick="closeManageTemplatesModal()">Đóng</button>
            <button type="button" class="btn-send-message" onclick="openCreateTemplateFromManage()">
                <i class="fa-solid fa-plus"></i> Tạo mẫu tin nhắn mới
            </button>
        </div>
    </div>
</div>

<!-- ========================================================
     MODAL POPUP TẠO MẪU TIN NHẮN MỚI (KÈM KÉO THẢ BIẾN GOOGLE SHEET)
     ======================================================== -->
<div class="modal-overlay" id="modalCreateTemplate" style="display:none;">
    <div class="modal-content" style="max-width: 580px; width: 95%;">
        <div class="modal-header">
            <h3 class="modal-title" id="modalCreateTemplateTitle" style="margin:0;font-size:16px;">Tạo mẫu tin nhắn mới</h3>
            <button type="button" class="modal-close-btn" onclick="closeCreateTemplateModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding:18px 20px;">
            <div class="form-group">
                <label class="form-label">Tiêu đề gợi nhớ <span style="color:#EF4444;">*</span></label>
                <input type="text" id="newTplTitle" class="form-input" placeholder="Ví dụ: Báo giá sản phẩm theo ID" oninput="clearCreateTemplateFieldError('newTplTitle')">
                <div class="shortcut-invalid-text" id="newTplTitleError" style="display:none;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span id="newTplTitleErrorText">Tiêu đề gợi nhớ không được để trống (tối đa 100 ký tự).</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Viết tắt <span style="color:#EF4444;">*</span></label>
                <input type="text" id="newTplShortcut" class="form-input" placeholder="Ví dụ: sp hoặc id" 
                       oninput="handleCreateTemplateInputChange(); clearCreateTemplateFieldError('newTplShortcut');"
                       ondragover="handleVarDragOver(event, this)"
                       ondragleave="handleVarDragLeave(this)"
                       ondrop="handleVarDrop(event, 'newTplShortcut')">
                <div class="shortcut-invalid-text" id="newShortcutInvalidMsg" style="display:none;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span id="newShortcutInvalidText">Viết tắt không được để trống (tối đa 50 ký tự).</span>
                </div>
                <div style="font-size:11.5px;color:#64748B;margin-top:2px;">Nhập từ khóa viết tắt để gọi nhanh mẫu tin khi chat.</div>
            </div>

            <div class="form-group">
                <label class="form-label">Nội dung mẫu tin <span style="color:#EF4444;">*</span></label>
                <textarea id="newTplContent" class="form-textarea" rows="4" 
                          placeholder="Ví dụ: Sản phẩm [Tên sản phẩm] có giá [Giá bán] ạ... Kéo thả hoặc click các biến bên dưới để chèn tự động."
                          oninput="handleCreateTemplateInputChange(); clearCreateTemplateFieldError('newTplContent');"
                          ondragover="handleVarDragOver(event, this)"
                          ondragleave="handleVarDragLeave(this)"
                          ondrop="handleVarDrop(event, 'newTplContent')"></textarea>
                <div class="shortcut-invalid-text" id="newTplContentError" style="display:none;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span id="newTplContentErrorText">Nội dung mẫu tin không được để trống.</span>
                </div>
            </div>

            <!-- Khu vực chèn biến động từ Google Sheet (hiển thị từng trang tính với từng biến) -->
            <div class="form-group">
                <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
                    <span>Chèn biến động từ Google Sheet:</span>
                    <span style="font-size:11px;font-weight:600;color:#94A3B8;">Kéo thả hoặc click để chèn</span>
                </label>
                <div class="draggable-vars-container" id="tplCreateVarChipsContainer" style="display:flex;flex-direction:column;gap:10px;">
                    <!-- Nạp động danh sách biến phân theo từng trang tính -->
                </div>
            </div>
        </div>
        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
            <button type="button" class="tab-btn" onclick="closeCreateTemplateModal()">Hủy</button>
            <button type="button" class="btn-send-message" id="btnSubmitNewTemplate" onclick="saveNewTemplateRecord()">
                <i class="fa-solid fa-floppy-disk"></i> Lưu Mẫu Tin
            </button>
        </div>
    </div>
</div>

<!-- Modal Hỏi Chọn Bảng Tính Khi Biến Trùng Nhiều Bảng -->
<div class="modal-overlay" id="modalChooseSheetForVar" style="display:none;z-index:100100;">
    <div class="modal-content" style="max-width: 420px; width: 90%;">
        <div class="modal-header">
            <h3 class="modal-title" style="margin:0;font-size:15px;" id="modalChooseSheetTitle">Chọn Bảng Tính</h3>
            <button type="button" class="modal-close-btn" onclick="closeChooseSheetModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding:16px;">
            <p style="font-size:13px;color:#334155;margin-top:0;margin-bottom:12px;" id="modalChooseSheetDesc">
                Biến này tồn tại ở nhiều bảng tính. Vui lòng chọn bảng tính bạn muốn áp dụng:
            </p>
            <div id="modalChooseSheetButtonsList" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
    </div>
</div>

<!-- Modal Chỉnh Sửa Hồ Sơ Khách Hàng (8 trường chuẩn) -->
<div class="modal-overlay" id="modalEditCustomerProfile" style="display:none;z-index:100100;">
    <div class="modal-content" style="max-width: 520px; width: 94%; border-radius: 14px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); overflow: hidden;">
        <div class="modal-header" style="padding: 16px 22px; border-bottom: 1px solid #E2E8F0; background: #FFFFFF;">
            <h3 class="modal-title" style="margin:0; font-size:16px; font-weight:700; color:#0F172A; display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-pen-to-square" style="color:var(--primary); font-size:15px;"></i> Chỉnh Sửa Thông Tin Khách Hàng
            </h3>
            <button type="button" class="modal-close-btn" onclick="closeEditCustomerProfileModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding: 18px 22px; max-height: 72vh; overflow-y: auto;">
            <form id="formEditCustomerProfile" onsubmit="event.preventDefault(); handleSaveCustomerProfileModal();" style="display:flex; flex-direction:column; gap:12px;">
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155;">Họ và tên (2–100 ký tự):</label>
                    <input type="text" class="form-input" id="modalInputRealName" maxlength="100" placeholder="Ví dụ: Nguyễn Văn An" oninput="clearCrmFieldError('modalInputRealName')" onblur="formatRealNameInput(this)">
                    <div class="crm-field-error" id="errModalInputRealName" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155;">Số điện thoại (10 chữ số, bắt đầu số 0):</label>
                    <input type="text" class="form-input" id="modalInputPhone" maxlength="10" placeholder="Ví dụ: 0914960029" oninput="clearCrmFieldError('modalInputPhone')">
                    <div class="crm-field-error" id="errModalInputPhone" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155;">Địa chỉ (tối đa 300 ký tự):</label>
                    <input type="text" class="form-input" id="modalInputAddress" maxlength="300" placeholder="Ví dụ: 12/3A Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM" oninput="clearCrmFieldError('modalInputAddress')">
                    <div class="crm-field-error" id="errModalInputAddress" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155;">Số đo (tối đa 100 ký tự):</label>
                    <input type="text" class="form-input" id="modalInputBodyMeasurements" maxlength="100" placeholder="Ví dụ: Size M, Chiều cao 160cm, Cân nặng 50kg" oninput="clearCrmFieldError('modalInputBodyMeasurements')">
                    <div class="crm-field-error" id="errModalInputBodyMeasurements" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155;">Sản phẩm quan tâm (tối đa 300 ký tự):</label>
                    <textarea class="form-textarea" id="modalInputCustomerNeeds" rows="2" maxlength="300" placeholder="Ví dụ: Đầm hoa nhí SP002 size M màu đỏ" oninput="clearCrmFieldError('modalInputCustomerNeeds')"></textarea>
                    <div class="crm-field-error" id="errModalInputCustomerNeeds" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155;">Đơn hàng từng mua (tối đa 300 ký tự):</label>
                    <textarea class="form-textarea" id="modalInputRecentPurchases" rows="2" maxlength="300" placeholder="Ví dụ: Đã chốt áo sơ mi SP005 ngày 20/10" oninput="clearCrmFieldError('modalInputRecentPurchases')"></textarea>
                    <div class="crm-field-error" id="errModalInputRecentPurchases" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155; display:flex; justify-content:space-between; align-items:center;">
                        <span>Ghi chú (tối đa 500 ký tự):</span>
                        <span id="charCountNotes" style="font-size:11.5px; color:#64748B; font-weight:normal;">0/500</span>
                    </label>
                    <textarea class="form-textarea" id="modalInputNotes" rows="2" maxlength="500" placeholder="Ghi chú thêm về sở thích, tính cách khách..." oninput="updateCrmCharCount('modalInputNotes', 'charCountNotes', 500); clearCrmFieldError('modalInputNotes');"></textarea>
                    <div class="crm-field-error" id="errModalInputNotes" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-weight:600; color:#334155; display:flex; justify-content:space-between; align-items:center;">
                        <span>Tóm tắt hội thoại (tối đa 500 ký tự):</span>
                        <span id="charCountSummary" style="font-size:11.5px; color:#64748B; font-weight:normal;">0/500</span>
                    </label>
                    <textarea class="form-textarea" id="modalInputSummary" rows="2" maxlength="500" placeholder="Tóm tắt ngắn nội dung cuộc trò chuyện..." oninput="updateCrmCharCount('modalInputSummary', 'charCountSummary', 500); clearCrmFieldError('modalInputSummary');"></textarea>
                    <div class="crm-field-error" id="errModalInputSummary" style="display:none; color:#EF4444; font-size:12px; margin-top:4px;"></div>
                </div>
            </form>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; padding:14px 22px; border-top: 1px solid #E2E8F0; background:#FAFBFD;">
            <button type="button" class="tab-btn" onclick="closeEditCustomerProfileModal()" style="padding: 8px 18px; border-radius: 8px; font-weight:600;">Hủy</button>
            <button type="button" class="btn-send-message" id="btnSaveCustomerProfileModal" onclick="handleSaveCustomerProfileModal()" style="padding: 8px 22px; border-radius: 8px; font-weight:700;">
                Lưu Thay Đổi
            </button>
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
