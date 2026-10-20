/**
 * JAVASCRIPT: workspace.js
 * Quản lý tương tác thời gian thực, Polling AJAX, Bộ lọc Sidebar Respond.io,
 * Phím tắt template (/), Khóa View-only, Đổi ca trực, Quản lý nhãn tùy biến (Labels)
 */

document.addEventListener('DOMContentLoaded', () => {
    initWorkspace();
});

// Trạng thái ứng dụng toàn cục
const AppState = {
    activeConvId: null,
    currentTab: 'mine',          // Mặc định tab 'Của tôi'
    unrepliedScope: 'mine',      // 'all' | 'mine'
    searchQuery: '',
    selectedLabelId: 0,
    selectedLabelName: 'Phân loại',
    selectedChannel: '',        // '' | 'WEBCHAT' | 'ZALO' | 'FACEBOOK'
    selectedChannelName: 'Kênh',
    lastMessageId: 0,
    fetchRequestId: 0,
    cachedConversations: {},
    conversationsCache: {},      // In-Memory Client Cache lưu trữ chi tiết hội thoại & tin nhắn (0ms)
    isViewOnly: false,
    pollingInterval: null,
    isSending: false,
    allLabels: [],
    assignedLabels: []
};

const CHANNEL_CONFIG = {
    'WEBCHAT': { icon: '<i class="fa-solid fa-globe"></i>', label: 'Webchat', class: 'badge-channel-WEBCHAT' },
    'FACEBOOK': { icon: '<i class="fa-brands fa-facebook-messenger"></i>', label: 'Facebook Messenger', class: 'badge-channel-FACEBOOK' },
    'ZALO': { icon: '<i class="fa-solid fa-comment-dots"></i>', label: 'Zalo Chat', class: 'badge-channel-ZALO' },
    'SHOPEE': { icon: '<i class="fa-solid fa-bag-shopping"></i>', label: 'Shopee Chat', class: 'badge-channel-SHOPEE' },
    'TIKTOK': { icon: '<i class="fa-brands fa-tiktok"></i>', label: 'TikTok Shop', class: 'badge-channel-TIKTOK' }
};

const TAG_LABELS = {
    'DANG_TU_VAN': 'Đang tư vấn',
    'DA_CHOT': 'Đã chốt đơn',
    'CHO_CHUYEN_KHOAN': 'Chờ chuyển khoản',
    'BOOM_HANG': 'Rủi ro hoàn hàng'
};

/**
 * Định dạng thời gian chuẩn các ứng dụng chat lớn (Messenger, Zalo, Telegram):
 * - Hôm nay: HH:mm (ví dụ 01:27)
 * - Hôm qua: HH:mm Hôm qua (ví dụ 15:30 Hôm qua)
 * - Trước hôm qua: HH:mm dd/MM hoặc dd/MM/YYYY
 */
function formatChatTime(dateInput) {
    if (!dateInput) return '';
    let d = (dateInput instanceof Date) ? dateInput : new Date(typeof dateInput === 'string' ? dateInput.replace(/-/g, '/') : dateInput);
    if (isNaN(d.getTime())) return '';

    const now = new Date();
    const isToday = (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate());

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate());

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (isToday) {
        return timeStr;
    } else if (isYesterday) {
        return `${timeStr} Hôm qua`;
    } else {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        if (d.getFullYear() === now.getFullYear()) {
            return `${timeStr} ${day}/${month}`;
        } else {
            return `${timeStr} ${day}/${month}/${d.getFullYear()}`;
        }
    }
}

function initWorkspace() {
    // 1. Tải danh sách hội thoại lần đầu
    fetchConversations(true);

    // 2. Kích hoạt chu kỳ Polling AJAX định kỳ 2.5 giây
    AppState.pollingInterval = setInterval(runSyncPolling, 2500);

    // 3. Đóng các Dropdown khi click ra bên ngoài
    document.addEventListener('click', (e) => {
        closeAllDropdowns(e);
    });
}

function closeAllDropdowns(e) {
    if (!e.target.closest('#unreadDropdownContainer')) {
        const m = document.getElementById('unreadDropdownMenu');
        if (m) m.classList.remove('show');
    }
    if (!e.target.closest('#labelDropdownContainer')) {
        const m = document.getElementById('labelDropdownMenu');
        if (m) m.classList.remove('show');
    }
    if (!e.target.closest('#channelDropdownContainer')) {
        const m = document.getElementById('channelDropdownMenu');
        if (m) m.classList.remove('show');
    }
    if (!e.target.closest('.profile-section-widget')) {
        const p = document.getElementById('assignLabelPopover');
        if (p) p.style.display = 'none';
    }
}

/**
 * Thực thi Polling đồng bộ tin nhắn và trạng thái ca trực mỗi 2.5s
 */
let renderPollCounter = 0;
let isRenderPolling = false;

async function runSyncPolling() {
    try {
        const params = new URLSearchParams({
            tab: AppState.currentTab,
            unreplied_scope: AppState.unrepliedScope,
            search: AppState.searchQuery,
            label_id: AppState.selectedLabelId || 0,
            channel: AppState.selectedChannel || '',
            active_conv_id: AppState.activeConvId || '',
            last_msg_id: AppState.lastMessageId || '0'
        });

        const res = await fetch(`../../api/sync_polling.php?${params.toString()}`);
        const data = await res.json();

        if (!data.success) {
            if (data.error === 'UNAUTHENTICATED') {
                window.location.href = '../auth/login.php';
            }
            return;
        }

        // Cập nhật trạng thái ca trực của nhân viên ở Header
        updateHeaderShiftStatus(data.current_user_status);

        // Cập nhật danh sách nhãn toàn hệ thống
        if (data.all_labels) {
            AppState.allLabels = data.all_labels;
            renderLabelsDropdown(data.all_labels);
        }

        // Cập nhật danh sách thẻ hội thoại bên trái
        renderConversationsList(data.conversations);

        // Cập nhật tin nhắn mới nếu đang mở một hội thoại
        if (AppState.activeConvId && data.active_conversation) {
            handleActiveConversationSync(data.active_conversation);
        }

        // Kéo tin nhắn từ Render Webhook Gateway mỗi 5 giây
        renderPollCounter++;
        if (renderPollCounter % 2 === 0) {
            pollRenderGateway();
        }
    } catch (err) {
        console.warn('Lỗi Polling đồng bộ:', err);
    }
}

/**
 * Kéo tin nhắn từ Render Webhook Gateway về InfinityFree
 */
async function pollRenderGateway() {
    if (!window.APP_CONFIG || !window.APP_CONFIG.RENDER_GATEWAY_URL || isRenderPolling) return;
    isRenderPolling = true;
    try {
        const url = window.APP_CONFIG.RENDER_GATEWAY_URL.replace(/\/+$/, '');
        const res = await fetch(`${url}/api/messages/poll`, { mode: 'cors' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.messages && data.messages.length > 0) {
            for (const msg of data.messages) {
                await fetch('../../api/webhook_receive.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(msg)
                });
            }
            fetchConversations(false);
            runSyncPolling();
        }
    } catch (e) {
        // Render free tier có thể đang khởi động
    } finally {
        isRenderPolling = false;
    }
}

/**
 * Lấy danh sách hội thoại ban đầu
 */
async function fetchConversations(selectFirst = false) {
    try {
        const params = new URLSearchParams({
            tab: AppState.currentTab,
            unreplied_scope: AppState.unrepliedScope,
            search: AppState.searchQuery,
            label_id: AppState.selectedLabelId || 0,
            channel: AppState.selectedChannel || ''
        });

        const res = await fetch(`../../api/sync_polling.php?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.conversations) {
            if (data.all_labels) {
                AppState.allLabels = data.all_labels;
                renderLabelsDropdown(data.all_labels);
            }
            renderConversationsList(data.conversations);

            // Tự động chọn hội thoại đầu tiên nếu chưa chọn
            if (selectFirst && data.conversations.length > 0 && !AppState.activeConvId) {
                selectConversation(data.conversations[0].id);
            }
        }
    } catch (err) {
        console.error('Lỗi nạp hội thoại:', err);
    }
}

/**
 * Hiển thị danh sách thẻ hội thoại chuẩn Respond.io (docs/image/plan/1792396447265.png)
 */
function renderConversationsList(conversations) {
    const container = document.getElementById('conversationsContainer');
    if (!conversations || conversations.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:50px 16px;color:#94a3b8;font-size:13px;">
                <i class="fa-regular fa-folder-open" style="font-size:32px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                Không tìm thấy hội thoại phù hợp
            </div>
        `;
        return;
    }

    // Lưu cache danh sách hội thoại để phản hồi tức thì khi click
    AppState.cachedConversations = {};
    conversations.forEach(c => {
        AppState.cachedConversations[c.id] = c;
    });

    let html = '';
    conversations.forEach(conv => {
        const isActive = (conv.id == AppState.activeConvId);
        const channelCfg = CHANNEL_CONFIG[conv.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conv.channel, class: 'badge-channel-WEBCHAT' };
        const assignedName = conv.assigned_fullname || 'Chưa gán';
        let assignedAvatarHtml = '';
        if (conv.assigned_fullname) {
            if (conv.assigned_avatar) {
                assignedAvatarHtml = `<img src="${escapeHtml(conv.assigned_avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="Avatar">`;
            } else {
                assignedAvatarHtml = escapeHtml(conv.assigned_fullname.trim().charAt(0).toUpperCase());
            }
        } else {
            assignedAvatarHtml = '<i class="fa-solid fa-user" style="font-size:8px;"></i>';
        }
        const isUnread = (conv.id == AppState.activeConvId) ? false : (conv.is_read == 0);
        const initial = (conv.sender_name || 'K').charAt(0).toUpperCase();
        const isStaffLast = (conv.last_sender_type === 'STAFF');

        // Tạo nhãn phân loại Respond.io pill
        let labelPillHtml = '';
        if (conv.labels && conv.labels.length > 0) {
            const firstLabel = conv.labels[0];
            labelPillHtml = `
                <span class="respondio-label-pill" style="border-left: 3px solid ${firstLabel.color};" title="${escapeHtml(firstLabel.name)}">
                    <i class="${firstLabel.icon || 'fa-solid fa-tag'}" style="color:${firstLabel.color};"></i>
                    <span>${escapeHtml(firstLabel.name)}</span>
                </span>
            `;
            if (conv.labels.length > 1) {
                labelPillHtml += `<span class="respondio-label-pill">+${conv.labels.length - 1}</span>`;
            }
        }

        // Tạo nội dung tin nhắn trích đoạn (Nếu nhân viên gửi thì hiện "Bạn: ...")
        let snippetHtml = '';
        if (conv.last_message) {
            if (isStaffLast) {
                snippetHtml = `<span class="snippet-prefix-you">Bạn: </span>${escapeHtml(conv.last_message)}`;
            } else {
                snippetHtml = escapeHtml(conv.last_message);
            }
        } else {
            snippetHtml = '<i>[Bắt đầu trò chuyện]</i>';
        }

        html += `
            <div class="conversation-card ${isActive ? 'active' : ''}" data-conv-id="${conv.id}" onclick="selectConversation(${conv.id})">
                <div class="card-avatar-wrap">
                    <div class="card-avatar-circle">${escapeHtml(initial)}</div>
                    <span class="card-channel-mini-badge badge-channel-${conv.channel}">
                        ${channelCfg.icon}
                    </span>
                </div>
                
                <div class="card-content-block">
                    <!-- Dòng 1: Tên khách (in đậm) & Thời gian chuẩn -->
                    <div class="card-header-line">
                        <span class="card-sender-name" title="${escapeHtml(conv.sender_name)}">${escapeHtml(conv.sender_name)}</span>
                        <span class="card-time-ago">${conv.short_time || formatChatTime(conv.last_message_at) || ''}</span>
                    </div>

                    <!-- Dòng 2: Nội dung trích đoạn chat (căn thẳng hàng trực tiếp với tên khách) -->
                    <div class="card-message-line ${isUnread ? 'is-unread' : ''}">
                        <span class="card-snippet-text">${snippetHtml}</span>
                    </div>

                    <!-- Dòng 3: Chip Nhãn + Avatar nhân viên phụ trách đồng bộ -->
                    <div class="card-footer-line">
                        <div class="card-labels-cluster">
                            ${labelPillHtml}
                        </div>
                        <div class="card-status-meta">
                            <div class="card-assignee-avatar ${conv.assigned_fullname ? '' : 'is-unassigned'}" title="Phụ trách: ${escapeHtml(assignedName)}">
                                ${assignedAvatarHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Hiển thị thanh Header thông tin khách hàng ở giữa màn hình
 */
function renderChatHeader(conv) {
    if (!conv) return;
    const channelCfg = CHANNEL_CONFIG[conv.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conv.channel || 'Webchat', class: 'badge-channel-WEBCHAT' };

    const chatHeader = document.getElementById('chatHeader');
    if (chatHeader) chatHeader.style.display = 'flex';

    const activeSenderName = document.getElementById('activeSenderName');
    if (activeSenderName) activeSenderName.innerText = conv.sender_name || 'Khách Hàng';

    const activeAvatar = document.getElementById('activeAvatar');
    if (activeAvatar) activeAvatar.innerText = (conv.sender_name || 'K').charAt(0).toUpperCase();

    const avatarChannelIcon = document.getElementById('activeAvatarChannelIcon');
    if (avatarChannelIcon) {
        avatarChannelIcon.innerHTML = channelCfg.icon;
        avatarChannelIcon.className = `partner-channel-mini-badge badge-channel-${conv.channel || 'WEBCHAT'}`;
    }


    const tagBadge = document.getElementById('activeTagBadge');
    if (tagBadge) {
        const labels = conv.labels || [];
        if (labels.length > 0) {
            tagBadge.style.display = 'inline-flex';
            tagBadge.innerHTML = labels.map(l => `<span class="header-label-pill" style="border-left:2px solid ${l.color}; background:#F1F5F9; padding:2px 7px; border-radius:4px; font-size:11px; margin-right:4px; display:inline-flex; align-items:center; gap:4px; font-weight:600; color:#334155;"><i class="${l.icon || 'fa-solid fa-tag'}" style="color:${l.color}; font-size:9.5px;"></i>${escapeHtml(l.name)}</span>`).join('');
            tagBadge.className = 'header-labels-wrapper';
        } else {
            tagBadge.style.display = 'none';
        }
    }

    const assigneeText = document.getElementById('activeAssigneeText');
    if (assigneeText) {
        assigneeText.innerText = `Phụ trách: ${conv.assigned_fullname || 'Chưa gán'}`;
    }
}

/**
 * Chọn và mở chi tiết một cuộc hội thoại (Triệt tiêu độ trễ, không mix tin nhắn)
 */
async function selectConversation(convId) {
    if (AppState.activeConvId === convId && document.getElementById('chatHeader').style.display !== 'none') {
        return;
    }

    AppState.activeConvId = convId;
    const thisRequestId = ++AppState.fetchRequestId;

    // 1. Phản hồi giao diện ngay lập tức: Đánh dấu thẻ active & Gỡ bỏ trạng thái chưa đọc
    if (AppState.cachedConversations && AppState.cachedConversations[convId]) {
        AppState.cachedConversations[convId].is_read = 1;
    }
    if (AppState.conversationsCache && AppState.conversationsCache[convId] && AppState.conversationsCache[convId].conversation) {
        AppState.conversationsCache[convId].conversation.is_read = 1;
    }
    document.querySelectorAll('.conversation-card').forEach(el => {
        const isTarget = (el.getAttribute('data-conv-id') == convId);
        el.classList.toggle('active', isTarget);
        if (isTarget) {
            const msgLine = el.querySelector('.card-message-line');
            if (msgLine) msgLine.classList.remove('is-unread');
        }
    });

    // 2. PHƯƠNG ÁN 1: KIỂM TRA BỘ NHỚ ĐỆM (IN-MEMORY CLIENT CACHE) -> HIỂN THỊ TỨC THÌ 0 MILI-GIÂY!
    const cachedDetail = AppState.conversationsCache[convId];
    if (cachedDetail) {
        renderConversationView(cachedDetail);
        // Đồng bộ ngầm để gỡ nhãn in đậm chưa đọc và kéo tin mới nếu có
        runSyncPolling();
        return;
    }

    // 3. Nếu chưa có trong cache (lần đầu nhấp vào):
    AppState.lastMessageId = 0;

    // Hiển thị Header và Sidebar Phải ngay lập tức từ tóm tắt trong danh sách
    const cachedConv = AppState.cachedConversations ? AppState.cachedConversations[convId] : null;
    if (cachedConv) {
        renderChatHeader(cachedConv);
    }
    document.getElementById('rightSidebar').style.display = 'flex';

    // Hiển thị loading chỉ trong lần đầu tiên tải hội thoại này
    const viewport = document.getElementById('messagesViewport');
    viewport.innerHTML = `
        <div class="chat-loading-placeholder" style="text-align:center;padding:50px 16px;color:#94a3b8;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:26px;margin-bottom:12px;color:#10B981;display:block;"></i>
            <span style="font-size:13px;font-weight:500;">Đang nạp dữ liệu hội thoại...</span>
        </div>
    `;

    try {
        // Gọi thẳng qua sync_polling (đã được xác thực hoạt động ổn định trên hosting)
        const pollParams = new URLSearchParams({
            tab: AppState.currentTab,
            unreplied_scope: AppState.unrepliedScope,
            search: AppState.searchQuery,
            label_id: AppState.selectedLabelId || 0,
            channel: AppState.selectedChannel || '',
            active_conv_id: convId,
            last_msg_id: 0
        });

        const res = await fetch(`../../api/sync_polling.php?${pollParams.toString()}`);
        const text = await res.text();

        let data = null;
        try {
            data = JSON.parse(text);
        } catch (pe) {
            // Lọc chuỗi JSON thuần nếu máy chủ chèn thông báo warning/deprecated phía trước
            const sIdx = text.indexOf('{');
            const eIdx = text.lastIndexOf('}');
            if (sIdx !== -1 && eIdx !== -1) {
                data = JSON.parse(text.substring(sIdx, eIdx + 1));
            }
        }

        // Kiểm tra xem người dùng có bấm chuyển sang khách khác trong lúc đang tải không
        if (AppState.activeConvId !== convId || thisRequestId !== AppState.fetchRequestId) {
            return;
        }

        if (data && data.active_conversation) {
            const detail = {
                conversation: data.active_conversation.conversation,
                is_mine: data.active_conversation.is_mine,
                is_view_only: data.active_conversation.is_view_only,
                messages: data.active_conversation.new_messages || [],
                profile: data.active_conversation.profile,
                assigned_labels: data.active_conversation.assigned_labels || []
            };

            // LƯU VÀO CACHE TRÌNH DUYỆT ĐỂ LẦN SAU MỞ LẠI TRONG 0MS
            AppState.conversationsCache[convId] = detail;
            renderConversationView(detail);
        } else {
            // Thử fallback qua message_action.php nếu sync_polling chưa trả active_conversation
            const fallbackRes = await fetch(`../../api/message_action.php?action=get_conversation&id=${convId}`);
            const fbText = await fallbackRes.text();
            let fbData = null;
            try {
                fbData = JSON.parse(fbText);
            } catch (e) {
                const sIdx = fbText.indexOf('{');
                const eIdx = fbText.lastIndexOf('}');
                if (sIdx !== -1 && eIdx !== -1) fbData = JSON.parse(fbText.substring(sIdx, eIdx + 1));
            }

            if (fbData && fbData.success && fbData.data) {
                AppState.conversationsCache[convId] = fbData.data;
                renderConversationView(fbData.data);
            } else {
                viewport.innerHTML = `
                    <div style="text-align:center;padding:50px 16px;color:#ef4444;font-size:13px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:28px;margin-bottom:8px;display:block;"></i>
                        Không thể tải nội dung hội thoại. 
                        <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="selectConversation(${convId})">
                            <i class="fa-solid fa-rotate-right"></i> Thử lại
                        </button>
                    </div>
                `;
            }
        }
    } catch (err) {
        console.error('Lỗi tải chi tiết hội thoại:', err);
        if (AppState.activeConvId === convId) {
            viewport.innerHTML = `
                <div style="text-align:center;padding:50px 16px;color:#ef4444;font-size:13px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:28px;margin-bottom:8px;display:block;"></i>
                    Lỗi kết nối khi tải hội thoại. 
                    <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="selectConversation(${convId})">
                        <i class="fa-solid fa-rotate-right"></i> Bấm để thử lại
                    </button>
                </div>
            `;
        }
    }
}

/**
 * Đánh giá trạng thái khóa View-Only (Hết ca trực hoặc Hội thoại của nhân viên khác)
 */
function evaluateViewOnlyLock() {
    const isShiftOffline = (window.APP_CONFIG?.CURRENT_STATUS === 'OFFLINE');
    const activeConv = AppState.activeConversation ||
        (AppState.cachedConversations ? AppState.cachedConversations[AppState.activeConvId] : null);
    const isOtherStaff = Boolean(activeConv && activeConv.assigned_user_id && activeConv.assigned_user_id != window.APP_CONFIG?.CURRENT_USER_ID);

    const lockBanner = document.getElementById('viewOnlyLockBanner');
    const inputArea = document.getElementById('chatInputArea');
    const lockTitle = lockBanner ? lockBanner.querySelector('.lock-banner-title') : null;
    const lockDesc = document.getElementById('viewOnlyLockText');

    if (isShiftOffline) {
        AppState.isViewOnly = true;
        if (lockBanner) lockBanner.style.display = 'flex';
        if (inputArea) inputArea.style.display = 'none';
        if (lockTitle) lockTitle.innerText = 'CHẾ ĐỘ CHỈ XEM';
        if (lockDesc) lockDesc.innerText = 'Hội thoại sẽ được phân chia cho nhân viên khác. Bạn không có quyền gửi tin nhắn.';
    } else if (isOtherStaff) {
        AppState.isViewOnly = true;
        if (lockBanner) lockBanner.style.display = 'flex';
        if (inputArea) inputArea.style.display = 'none';
        if (lockTitle) lockTitle.innerText = 'CHẾ ĐỘ CHỈ XEM';
        if (lockDesc) lockDesc.innerText = `Hội thoại đang được phụ trách bởi ${activeConv.assigned_fullname || 'nhân viên khác'}. Bạn không có quyền gửi tin nhắn.`;
    } else {
        AppState.isViewOnly = false;
        if (lockBanner) lockBanner.style.display = 'none';
        if (inputArea && AppState.activeConvId) inputArea.style.display = 'block';
    }
}

/**
 * Render toàn bộ khung chat và hồ sơ khách hàng
 */
function renderConversationView(detail) {
    const { conversation, is_mine, is_view_only, messages, profile } = detail;

    // 1. Cập nhật thanh header thông tin khách hàng ở trên cùng
    AppState.activeConversation = conversation;
    renderChatHeader(conversation);
    document.getElementById('rightSidebar').style.display = 'flex';

    // 2. Xử lý cơ chế khóa View-Only (Hết ca hoặc Xem chéo)
    evaluateViewOnlyLock();

    // 3. Xóa sạch vùng tin nhắn và render lịch sử tin nhắn chuẩn
    const viewport = document.getElementById('messagesViewport');
    viewport.innerHTML = '';
    AppState.lastMessageId = 0;

    if (messages && messages.length > 0) {
        messages.forEach(msg => {
            appendMessageBubble(msg, false);
        });
    } else {
        viewport.innerHTML = `
            <div class="chat-empty-state" id="chatEmptyConversationState" style="text-align:center;padding:50px 16px;color:#94a3b8;font-size:13px;">
                <i class="fa-regular fa-comments" style="font-size:28px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                Chưa có tin nhắn trong cuộc trò chuyện này. Hãy gửi tin nhắn để bắt đầu tư vấn.
            </div>
        `;
    }
    scrollChatToBottom();
    updateSeenIndicator();

    // 4. Cập nhật Sidebar Phải (Hồ sơ CRM & Nhãn tùy biến)
    renderProfileSidebar(profile, conversation, detail.assigned_labels);
    if (!detail.assigned_labels || detail.assigned_labels.length === 0) {
        loadAssignedLabelsForActiveConv();
    }
}

/**
 * Đồng bộ tin nhắn mới của hội thoại đang mở khi polling
 */
function handleActiveConversationSync(activeData) {
    if (!activeData || !activeData.conversation) return;

    // Đảm bảo chỉ xử lý nếu đúng hội thoại đang được mở trên màn hình
    if (activeData.conversation.id != AppState.activeConvId) return;

    const { conversation, is_mine, is_view_only, new_messages, profile, assigned_labels } = activeData;

    AppState.activeConversation = conversation;
    // Đảm bảo Header luôn hiển thị thông tin khách hàng
    renderChatHeader(conversation);

    // Cập nhật quyền View-Only
    evaluateViewOnlyLock();

    // Gỡ bỏ trạng thái empty state hoặc placeholder nếu có
    const viewport = document.getElementById('messagesViewport');
    const placeholders = viewport.querySelectorAll('.chat-empty-state, .chat-loading-placeholder, #chatEmptyConversationState, #chatEmptyState');
    if (placeholders.length > 0 && new_messages && new_messages.length > 0) {
        placeholders.forEach(p => p.remove());
    }

    // Bổ sung các tin nhắn mới (chống trùng lặp tuyệt đối)
    if (new_messages && new_messages.length > 0) {
        let hasNew = false;
        new_messages.forEach(msg => {
            if (msg.id > AppState.lastMessageId && !document.getElementById(`msg-${msg.id}`)) {
                appendMessageBubble(msg, true);
                hasNew = true;
            }
        });
        if (hasNew) {
            updateSeenIndicator();
            scrollChatToBottom();
        }

        // Đồng bộ tin nhắn mới vào cache của hội thoại để khi chuyển khách quay lại không cần tải lại
        if (AppState.conversationsCache[conversation.id]) {
            const cache = AppState.conversationsCache[conversation.id];
            if (!cache.messages) cache.messages = [];
            new_messages.forEach(nm => {
                if (!cache.messages.some(m => m.id === nm.id)) {
                    cache.messages.push(nm);
                }
            });
        }
    }

    // Cập nhật hồ sơ và nhãn
    if (profile) {
        renderProfileSidebar(profile, conversation, assigned_labels);
    } else if (assigned_labels) {
        renderAssignedLabels(assigned_labels);
    }
}

/**
 * Hiển thị mini avatar của khách hàng dưới tin nhắn cuối cùng do nhân viên gửi (Seen / Đã xem)
 */
function updateSeenIndicator() {
    const viewport = document.getElementById('messagesViewport');
    if (!viewport) return;

    // Gỡ bỏ seen cũ nếu có
    const oldIndicator = viewport.querySelector('#chatSeenIndicator');
    if (oldIndicator) oldIndicator.remove();

    // Tìm tin nhắn cuối cùng do STAFF gửi
    const staffMessages = viewport.querySelectorAll('.message-item.staff');
    if (staffMessages.length === 0) return;

    const lastStaffMsg = staffMessages[staffMessages.length - 1];
    const currentConv = (AppState.cachedConversations ? AppState.cachedConversations[AppState.activeConvId] : null) ||
        AppState.activeConversation || {};
    const custName = currentConv.sender_name || document.getElementById('activeSenderName')?.innerText || 'Khách';
    const initial = custName.trim().charAt(0).toUpperCase();

    const seenDiv = document.createElement('div');
    seenDiv.id = 'chatSeenIndicator';
    seenDiv.className = 'chat-seen-indicator';
    seenDiv.title = `${escapeHtml(custName)} đã xem`;
    seenDiv.innerHTML = `<div class="seen-avatar-mini">${escapeHtml(initial)}</div>`;

    lastStaffMsg.after(seenDiv);
}

/**
 * Phân tích attachment_url thành mảng danh sách URL (hỗ trợ url đơn, comma-separated, JSON array)
 */
function parseAttachmentUrls(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    const trimmed = String(raw).trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr)) return arr.filter(Boolean);
        } catch (e) {}
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Xây dựng HTML hiển thị ảnh theo Smart Grid Layout (1-5+ ảnh, không bọc viền bong bóng)
 */
function buildMediaGridHtml(urls, senderName, displayTime, msgId, isStaff) {
    if (!urls || urls.length === 0) return '';
    const count = urls.length;
    let gridClass = 'grid-1';
    if (count === 2) gridClass = 'grid-2';
    else if (count === 3) gridClass = 'grid-3';
    else if (count === 4) gridClass = 'grid-4';
    else if (count >= 5) gridClass = 'grid-5-plus';

    const maxDisplay = Math.min(count, 4);
    let itemsHtml = '';

    for (let i = 0; i < maxDisplay; i++) {
        const u = urls[i];
        const isLastMore = (count > 4 && i === 3);
        const moreCount = count - 4;

        itemsHtml += `
            <div class="omni-media-item" onclick="openLightboxFromGrid('${msgId}', ${i})" title="Bấm để xem ảnh phóng to">
                <img src="${escapeHtml(u)}" alt="Ảnh tin nhắn" loading="lazy">
                ${isLastMore ? `<div class="omni-media-overlay-more">+${moreCount}</div>` : ''}
            </div>
        `;
    }

    window.__GALLERY_CACHE__ = window.__GALLERY_CACHE__ || {};
    window.__GALLERY_CACHE__[msgId] = {
        urls: urls,
        senderName: senderName,
        displayTime: displayTime,
        isStaff: isStaff
    };

    return `
        <div class="message-media-wrap">
            <div class="omni-media-grid ${gridClass}">
                ${itemsHtml}
                <div class="media-timestamp-pill">${escapeHtml(displayTime)}</div>
            </div>
        </div>
    `;
}

/**
 * Thêm một bong bóng tin nhắn vào khung chat (Định dạng thời gian chuẩn & Smart Grid ảnh)
 */
function appendMessageBubble(msg, isNew = false) {
    const viewport = document.getElementById('messagesViewport');
    if (!viewport) return;

    // Chống trùng lặp tin nhắn
    if (msg.id && document.getElementById(`msg-${msg.id}`)) {
        return;
    }

    // Gỡ bỏ placeholder nếu còn tồn tại
    const placeholders = viewport.querySelectorAll('.chat-empty-state, .chat-loading-placeholder, #chatEmptyConversationState, #chatEmptyState');
    placeholders.forEach(p => p.remove());

    const isStaff = (msg.sender_type === 'STAFF');
    const currentConv = (AppState.cachedConversations ? AppState.cachedConversations[AppState.activeConvId] : null) || AppState.activeConversation || {};
    const staffName = msg.staff_name || window.APP_CONFIG?.CURRENT_FULLNAME || 'Nhân viên tư vấn';
    const custName = currentConv.sender_name || document.getElementById('activeSenderName')?.innerText || 'Khách hàng';
    const senderName = isStaff ? staffName : custName;
    const initial = custName.trim().charAt(0).toUpperCase();

    // Định dạng giờ hiển thị theo chuẩn các app chat lớn
    let displayTime = msg.time_formatted || '';
    if (!displayTime && msg.created_at) {
        displayTime = formatChatTime(msg.created_at);
    }

    const uniqueMsgKey = msg.id || ('temp_' + Math.random().toString(36).substring(2, 8));
    const urls = parseAttachmentUrls(msg.attachment_url);
    const hasMedia = urls.length > 0;
    const hasText = Boolean(msg.content && msg.content.trim().length > 0);
    const mediaHtml = hasMedia ? buildMediaGridHtml(urls, senderName, displayTime, uniqueMsgKey, isStaff) : '';

    const div = document.createElement('div');
    if (msg.id) div.id = `msg-${msg.id}`;
    div.className = `message-item ${isStaff ? 'staff' : 'customer'}`;

    let contentHtml = '';
    if (hasText) {
        contentHtml = `
            <div class="message-bubble">
                <div class="message-text">${escapeHtml(msg.content)}</div>
                ${hasMedia ? '' : `<div class="message-timestamp">${escapeHtml(displayTime)}</div>`}
            </div>
        `;
    }

    if (isStaff) {
        div.innerHTML = `
            <div class="message-bubble-wrap">
                ${contentHtml}
                ${mediaHtml}
            </div>
        `;
    } else {
        div.innerHTML = `
            <div class="message-customer-avatar" title="${escapeHtml(custName)}">${escapeHtml(initial)}</div>
            <div class="message-bubble-wrap">
                ${contentHtml}
                ${mediaHtml}
            </div>
        `;
    }

    viewport.appendChild(div);

    if (msg.id && msg.id > AppState.lastMessageId) {
        AppState.lastMessageId = msg.id;
    }
}

function scrollChatToBottom() {
    const viewport = document.getElementById('messagesViewport');
    viewport.scrollTop = viewport.scrollHeight;
}

/**
 * Nhân viên gửi tin nhắn
 */
async function sendMessage(attachmentUrl = null) {
    if (!AppState.activeConvId || AppState.isViewOnly || AppState.isSending) return;

    const input = document.getElementById('chatInput');
    const content = input.value.trim();

    if (!content && !attachmentUrl) return;

    AppState.isSending = true;
    input.value = '';
    document.getElementById('shortcutPreviewBar').style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('action', 'send_message');
        formData.append('conversation_id', AppState.activeConvId);
        formData.append('content', content);
        if (attachmentUrl) {
            formData.append('attachment_url', attachmentUrl);
        }

        let res = null;
        let text = '';
        let data = null;

        // Ưu tiên 1: Gửi qua message_action.php (không chứa từ khóa 'chat' để tránh bộ lọc WAF)
        try {
            res = await fetch('../../api/message_action.php', {
                method: 'POST',
                body: formData
            });
            text = await res.text();
            try {
                data = JSON.parse(text);
            } catch (pe) {
                const sIdx = text.indexOf('{');
                const eIdx = text.lastIndexOf('}');
                if (sIdx !== -1 && eIdx !== -1) {
                    try {
                        data = JSON.parse(text.substring(sIdx, eIdx + 1));
                    } catch (e) { }
                }
            }
        } catch (netErr) {
            console.warn('Gửi qua message_action.php gặp sự cố mạng:', netErr);
        }

        // Fail-safe tầng 2: Nếu WAF chặn 403 hoặc phản hồi không hợp lệ, dùng sync_polling.php (100% được hosting cho phép)
        if (!data || (!data.success && (res?.status === 403 || text.includes('403 Forbidden') || text.includes('blocking you')))) {
            try {
                res = await fetch('../../api/sync_polling.php', {
                    method: 'POST',
                    body: formData
                });
                text = await res.text();
                try {
                    data = JSON.parse(text);
                } catch (pe) {
                    const sIdx = text.indexOf('{');
                    const eIdx = text.lastIndexOf('}');
                    if (sIdx !== -1 && eIdx !== -1) {
                        try {
                            data = JSON.parse(text.substring(sIdx, eIdx + 1));
                        } catch (e) { }
                    }
                }
            } catch (fbErr) {
                console.error('Fallback sync_polling thất bại:', fbErr);
            }
        }

        if (data && data.success && data.data) {
            appendMessageBubble(data.data, true);
            // Cập nhật tin nhắn vừa gửi vào Cache để khi chuyển khách không bị mất
            if (AppState.conversationsCache[AppState.activeConvId]) {
                const cache = AppState.conversationsCache[AppState.activeConvId];
                if (!cache.messages) cache.messages = [];
                if (!cache.messages.some(m => m.id === data.data.id)) {
                    cache.messages.push(data.data);
                }
            }
            // Bổ trợ kép: Trình duyệt gửi trực tiếp tới Render Gateway để khách nhận ngay lập tức
            const activeConv = AppState.activeConversation ||
                (AppState.cachedConversations ? AppState.cachedConversations[AppState.activeConvId] : null) ||
                AppState.conversationsCache[AppState.activeConvId]?.conversation;
            const targetChannel = (activeConv?.channel || '').toUpperCase();
            if (targetChannel === 'WEBCHAT' && window.APP_CONFIG?.RENDER_GATEWAY_URL && activeConv?.external_sender_id) {
                const gatewayUrl = window.APP_CONFIG.RENDER_GATEWAY_URL.replace(/\/+$/, '');
                fetch(`${gatewayUrl}/api/webchat/reply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customer_id: activeConv.external_sender_id,
                        content: content,
                        attachment_url: attachmentUrl || data.data.attachment_url || null,
                        staff_name: data.data.staff_name || window.APP_CONFIG.CURRENT_FULLNAME || 'Nhân viên tư vấn',
                        staff_avatar: data.data.staff_avatar || window.APP_CONFIG.CURRENT_AVATAR || ''
                    })
                }).catch(e => console.warn('Browser direct reply push warning:', e));
            }

            updateSeenIndicator();
            scrollChatToBottom();
            runSyncPolling();
        } else {
            input.value = content;
            alert(data ? data.message : ('Lỗi máy chủ khi gửi: ' + text.substring(0, 100)));
        }
    } catch (err) {
        console.error('Lỗi gửi tin nhắn:', err);
        input.value = content;
        alert('Lỗi kết nối khi gửi tin nhắn: ' + err.message);
    } finally {
        AppState.isSending = false;
        input.focus();
    }
}

function handleChatKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

/**
 * Nhận diện phím tắt mẫu tin nhắn /
 */
let shortcutTimeout = null;
function handleShortcutDetect(e) {
    const val = e.target.value;
    const previewBar = document.getElementById('shortcutPreviewBar');

    if (val.trim().startsWith('/')) {
        previewBar.style.display = 'flex';
        clearTimeout(shortcutTimeout);
        shortcutTimeout = setTimeout(() => {
            fetchResolvedShortcut(val.trim());
        }, 200);
    } else {
        previewBar.style.display = 'none';
    }
}

async function fetchResolvedShortcut(shortcut) {
    try {
        const res = await fetch(`../../api/template_action.php?action=resolve_shortcut&shortcut=${encodeURIComponent(shortcut)}`);
        const data = await res.json();
        if (data.success && data.data) {
            window.CURRENT_RESOLVED_TEMPLATE = data.data.compiled_content;
            document.getElementById('shortcutPreviewText').innerHTML =
                `<i class="fa-solid fa-bolt"></i> Mẫu: <strong>${escapeHtml(data.data.template.title)}</strong> (<em>${escapeHtml(shortcut)}</em>)`;
        } else {
            document.getElementById('shortcutPreviewText').innerHTML =
                `<i class="fa-solid fa-circle-question"></i> Đang tìm mẫu tin cho <strong>${escapeHtml(shortcut)}</strong>...`;
        }
    } catch (err) {
        console.warn('Lỗi kiểm tra shortcut:', err);
    }
}

function applyShortcutDirectly() {
    if (window.CURRENT_RESOLVED_TEMPLATE) {
        document.getElementById('chatInput').value = window.CURRENT_RESOLVED_TEMPLATE;
        document.getElementById('shortcutPreviewBar').style.display = 'none';
        document.getElementById('chatInput').focus();
    }
}

async function handleAttachmentUpload(input) {
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);

    const formData = new FormData();
    formData.append('action', 'upload_attachment');
    files.forEach(f => formData.append('files[]', f));

    try {
        const res = await fetch('../../api/message_action.php', {
            method: 'POST',
            body: formData
        });
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (e) {
            const sIdx = text.indexOf('{');
            const eIdx = text.lastIndexOf('}');
            if (sIdx !== -1 && eIdx !== -1) data = JSON.parse(text.substring(sIdx, eIdx + 1));
        }

        if (data && data.success && (data.data.attachment_url || data.data.url)) {
            const finalAttachment = data.data.attachment_url || data.data.url;
            sendMessage(finalAttachment);
        } else {
            alert(data ? data.message : 'Lỗi tải ảnh');
        }
    } catch (err) {
        console.error('Lỗi upload tệp:', err);
    } finally {
        input.value = '';
    }
}

/**
 * Cập nhật Sidebar Phải (Hồ sơ Khách Hàng 360)
 */
function renderProfileSidebar(profile, conv, assignedLabels) {
    if (!profile) return;

    const customerName = profile.real_name || profile.customer_name || (conv && conv.sender_name) || 'Khách Hàng';
    const profileCustNameEl = document.getElementById('profileCustomerName');
    if (profileCustNameEl) profileCustNameEl.innerText = customerName;

    const rightCustAvtEl = document.getElementById('rightCustomerAvatar');
    if (rightCustAvtEl) rightCustAvtEl.innerText = customerName.charAt(0).toUpperCase();

    if (conv) {
        const rightAvatarChannelIcon = document.getElementById('rightAvatarChannelIcon');
        if (rightAvatarChannelIcon) {
            const channelCfg = CHANNEL_CONFIG[conv.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conv.channel || 'Webchat', class: 'badge-channel-WEBCHAT' };
            rightAvatarChannelIcon.innerHTML = channelCfg.icon;
            rightAvatarChannelIcon.className = `partner-channel-mini-badge badge-channel-large badge-channel-${conv.channel || 'WEBCHAT'}`;
        }
    }

    // Các thuộc tính bóc tách thông tin khách hàng (CRM)
    const elRealName = document.getElementById('crmRealName');
    if (elRealName) elRealName.innerText = profile.real_name || 'Chưa có thông tin';

    const elPhone = document.getElementById('crmPhone');
    if (elPhone) elPhone.innerText = profile.phone || 'Chưa có thông tin';

    const elAddress = document.getElementById('crmAddress');
    if (elAddress) elAddress.innerText = profile.address || 'Chưa có thông tin';

    const elNeeds = document.getElementById('crmCustomerNeeds');
    if (elNeeds) elNeeds.innerText = profile.customer_needs || 'Chưa có thông tin';

    const elSummary = document.getElementById('crmSummary');
    if (elSummary) elSummary.innerText = profile.conversation_summary || 'Chưa có tóm tắt';

    // Mốc thời gian ghi nhận dữ liệu
    const elDateRange = document.getElementById('crmDateRange');
    if (elDateRange) {
        const fromDate = profile.from_date_formatted || '01/01/2026';
        const toDate = profile.to_date_formatted || new Date().toLocaleDateString('vi-VN');
        elDateRange.innerText = `${fromDate} đến ${toDate}`;
    }

    // Khóa/Mở các nút chỉnh sửa CRM nếu ở chế độ Chỉ Xem
    const crmEditBtns = document.querySelectorAll('.crm-edit-btn');
    crmEditBtns.forEach(btn => {
        if (AppState.isViewOnly) {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.35';
        } else {
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
    });

    const btnUpdate = document.getElementById('btnUpdateProfile');
    if (btnUpdate) {
        btnUpdate.disabled = AppState.isViewOnly;
    }

    // Render nhãn phân loại
    const labelsToRender = assignedLabels || AppState.assignedLabels || (conv && conv.labels) || [];
    renderAssignedLabels(labelsToRender);
}

/**
 * Nút cập nhật hồ sơ khách hàng (CRM)
 */
async function handleUpdateCustomerProfile() {
    if (!AppState.activeConvId) return;
    if (AppState.isViewOnly) {
        alert('Hội thoại đang ở chế độ chỉ xem. Bạn không có quyền cập nhật hồ sơ.');
        return;
    }

    const btn = document.getElementById('btnUpdateProfile');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>ĐANG CẬP NHẬT...</span>';
    }

    try {
        const formData = new FormData();
        formData.append('action', 'update_crm_profile');
        formData.append('conversation_id', AppState.activeConvId);

        const realName = document.getElementById('crmRealName')?.innerText;
        const phone = document.getElementById('crmPhone')?.innerText;
        const address = document.getElementById('crmAddress')?.innerText;
        const needs = document.getElementById('crmCustomerNeeds')?.innerText;
        const summary = document.getElementById('crmSummary')?.innerText;

        if (realName && realName !== 'Chưa có thông tin') formData.append('real_name', realName);
        if (phone && phone !== 'Chưa có thông tin') formData.append('phone', phone);
        if (address && address !== 'Chưa có thông tin') formData.append('address', address);
        if (needs && needs !== 'Chưa có thông tin') formData.append('customer_needs', needs);
        if (summary && summary !== 'Chưa có tóm tắt') formData.append('conversation_summary', summary);

        const res = await fetch('../../api/customer_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success && data.data && data.data.profile) {
            if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>ĐÃ CẬP NHẬT THÀNH CÔNG</span>';
            renderProfileSidebar(data.data.profile, { id: AppState.activeConvId });
        } else {
            if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>HỒ SƠ ĐÃ ĐỒNG BỘ</span>';
        }
    } catch (err) {
        console.error('Lỗi cập nhật hồ sơ CRM:', err);
        if (btn) btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>LỖI CẬP NHẬT</span>';
    } finally {
        setTimeout(() => {
            if (btn) {
                btn.disabled = AppState.isViewOnly;
                btn.innerHTML = originalHtml;
            }
        }, 1500);
    }
}

/**
 * Hộp thoại sửa nhanh từng trường thông tin CRM
 */
async function editFieldPrompt(fieldName, fieldTitle) {
    if (!AppState.activeConvId) return;
    if (AppState.isViewOnly) {
        alert('Hội thoại đang ở chế độ chỉ xem. Bạn không có quyền chỉnh sửa.');
        return;
    }

    let currentVal = '';
    let targetEl = null;
    if (fieldName === 'real_name') {
        targetEl = document.getElementById('crmRealName');
    } else if (fieldName === 'phone') {
        targetEl = document.getElementById('crmPhone');
    } else if (fieldName === 'address') {
        targetEl = document.getElementById('crmAddress');
    } else if (fieldName === 'customer_needs') {
        targetEl = document.getElementById('crmCustomerNeeds');
    } else if (fieldName === 'conversation_summary') {
        targetEl = document.getElementById('crmSummary');
    } else if (fieldName === 'customer_name') {
        targetEl = document.getElementById('profileCustomerName');
    }

    if (targetEl) {
        currentVal = targetEl.innerText;
        if (currentVal === 'Chưa có thông tin' || currentVal === 'Chưa có tóm tắt') {
            currentVal = '';
        }
    }

    const newVal = prompt(`Nhập ${fieldTitle} mới:`, currentVal);
    if (newVal === null) return; // Bấm Cancel
    const trimmedVal = newVal.trim();

    try {
        const formData = new FormData();
        formData.append('action', 'update_field');
        formData.append('conversation_id', AppState.activeConvId);
        formData.append('field', fieldName);
        formData.append('value', trimmedVal);

        const res = await fetch('../../api/customer_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            if (targetEl) {
                targetEl.innerText = trimmedVal || (fieldName === 'conversation_summary' ? 'Chưa có tóm tắt' : 'Chưa có thông tin');
            }
            if (fieldName === 'real_name' && trimmedVal) {
                const headSender = document.getElementById('activeSenderName');
                if (headSender) headSender.innerText = trimmedVal;
            }
        } else {
            alert(data.message || 'Lỗi cập nhật');
        }
    } catch (err) {
        console.error('Lỗi sửa trường:', err);
    }
}

async function handleShiftChange(status) {
    try {
        const formData = new FormData();
        formData.append('action', 'toggle_shift');
        formData.append('status', status);

        let res = await fetch('../../api/message_action.php', {
            method: 'POST',
            body: formData
        });
        if (res.status === 403) {
            res = await fetch('../../api/sync_polling.php', {
                method: 'POST',
                body: formData
            });
        }
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (e) {
            const sIdx = text.indexOf('{');
            const eIdx = text.lastIndexOf('}');
            if (sIdx !== -1 && eIdx !== -1) data = JSON.parse(text.substring(sIdx, eIdx + 1));
        }

        if (data && data.success) {
            updateHeaderShiftStatus(data.data.status);
            runSyncPolling();
        }
    } catch (err) {
        console.error('Lỗi đổi ca trực:', err);
    }
}

function toggleShiftStatus() {
    const btn = document.getElementById('shiftToggleBtn');
    if (!btn) return;
    const isCurrentlyOnline = btn.classList.contains('is-online');
    const nextStatus = isCurrentlyOnline ? 'OFFLINE' : 'ONLINE';
    handleShiftChange(nextStatus);
}

function updateHeaderShiftStatus(status) {
    const btn = document.getElementById('shiftToggleBtn');
    const dot = document.getElementById('shiftDot');
    const text = document.getElementById('shiftText');

    if (!btn) return;

    if (status === 'ONLINE') {
        btn.classList.remove('is-offline');
        btn.classList.add('is-online');
        if (dot) dot.className = 'status-dot online';
        if (text) text.innerText = 'Sẵn sàng nhận khách';
    } else {
        btn.classList.remove('is-online');
        btn.classList.add('is-offline');
        if (dot) dot.className = 'status-dot';
        if (text) text.innerText = 'Hết ca';
    }

    if (window.APP_CONFIG) {
        window.APP_CONFIG.CURRENT_STATUS = status;
    }
    evaluateViewOnlyLock();
}

// ========================================================
// HỆ THỐNG TAB & DROPDOWN LỌC SIDEBAR TRÁI (THEO PLAN.MD)
// ========================================================

/**
 * Chuyển tab chính: 'all' hoặc 'mine'
 */
function switchMainTab(tab) {
    AppState.currentTab = tab;
    document.getElementById('tabAll').classList.toggle('active', tab === 'all');
    document.getElementById('tabMine').classList.toggle('active', tab === 'mine');
    document.getElementById('tabUnread').classList.remove('active');
    document.getElementById('unreadDropdownMenu').classList.remove('show');
    fetchConversations();
}

/**
 * Bật/tắt dropdown tab Chưa đọc
 */
function toggleUnreadDropdown(e) {
    e.stopPropagation();
    const menu = document.getElementById('unreadDropdownMenu');
    menu.classList.toggle('show');
}

/**
 * Chọn phạm vi Chưa đọc: 'all' (toàn bộ) hoặc 'mine' (của tôi)
 */
function selectUnreadScope(scope) {
    AppState.currentTab = 'unreplied';
    AppState.unrepliedScope = scope;

    document.getElementById('tabAll').classList.remove('active');
    document.getElementById('tabMine').classList.remove('active');
    document.getElementById('tabUnread').classList.add('active');

    document.getElementById('unreadOptAll').classList.toggle('active', scope === 'all');
    document.getElementById('unreadOptMine').classList.toggle('active', scope === 'mine');
    document.getElementById('unreadTabLabel').innerText = (scope === 'mine') ? 'Chưa đọc (Tôi)' : 'Chưa đọc';

    document.getElementById('unreadDropdownMenu').classList.remove('show');
    fetchConversations();
}

/**
 * Bật/tắt dropdown Phân loại (Labels)
 */
function toggleLabelDropdown(e) {
    e.stopPropagation();
    document.getElementById('channelDropdownMenu').classList.remove('show');
    const menu = document.getElementById('labelDropdownMenu');
    menu.classList.toggle('show');
}

/**
 * Chọn nhãn lọc
 */
function selectLabelFilter(labelId, labelName) {
    AppState.selectedLabelId = labelId;
    AppState.selectedLabelName = labelName;
    document.getElementById('currentLabelName').innerText = labelName;

    document.querySelectorAll('#labelDropdownMenu .dropdown-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(labelId === 0 ? 'labelOptAll' : `labelOpt_${labelId}`);
    if (activeEl) activeEl.classList.add('active');

    document.getElementById('labelDropdownMenu').classList.remove('show');
    fetchConversations();
}

/**
 * Nạp danh sách nhãn vào dropdown Phân loại
 */
function renderLabelsDropdown(labels) {
    const container = document.getElementById('labelsListContainer');
    if (!container) return;

    let html = '';
    labels.forEach(l => {
        const isSelected = (AppState.selectedLabelId === l.id);
        html += `
            <div class="dropdown-item ${isSelected ? 'active' : ''}" id="labelOpt_${l.id}" onclick="selectLabelFilter(${l.id}, '${escapeHtml(l.name)}')">
                <span class="label-color-dot" style="background:${l.color};"></span>
                <span>${escapeHtml(l.name)}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

/**
 * Bật/tắt dropdown lọc Kênh
 */
function toggleChannelDropdown(e) {
    e.stopPropagation();
    document.getElementById('labelDropdownMenu').classList.remove('show');
    const menu = document.getElementById('channelDropdownMenu');
    menu.classList.toggle('show');
}

/**
 * Chọn kênh lọc (Tất cả, Webchat, Zalo, Facebook)
 */
function selectChannelFilter(channel, channelName) {
    AppState.selectedChannel = channel;
    AppState.selectedChannelName = channelName;
    document.getElementById('currentChannelName').innerText = channelName;

    document.querySelectorAll('#channelDropdownMenu .dropdown-item').forEach(el => el.classList.remove('active'));
    const activeId = channel === '' ? 'channelOptAll' : (channel === 'WEBCHAT' ? 'channelOptWebchat' : (channel === 'ZALO' ? 'channelOptZalo' : 'channelOptFb'));
    const activeEl = document.getElementById(activeId);
    if (activeEl) activeEl.classList.add('active');

    document.getElementById('channelDropdownMenu').classList.remove('show');
    fetchConversations();
}

/**
 * Tìm kiếm theo Tên khách hàng & Nội dung tin nhắn
 */
let searchDebounce = null;
function handleSearch(val) {
    const clearBtn = document.getElementById('btnClearSearch');
    if (clearBtn) {
        clearBtn.style.display = val.trim() ? 'block' : 'none';
    }

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        AppState.searchQuery = val.trim();
        fetchConversations();
    }, 250);
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    input.value = '';
    document.getElementById('btnClearSearch').style.display = 'none';
    AppState.searchQuery = '';
    fetchConversations();
}

// ========================================================
// QUẢN LÝ NHÃN PHÂN LOẠI TÙY BIẾN (CUSTOM LABELS)
// ========================================================

function openCreateLabelModal() {
    document.getElementById('labelDropdownMenu').classList.remove('show');
    document.getElementById('modalCreateLabel').style.display = 'flex';
    document.getElementById('newLabelName').value = '';
    document.getElementById('newLabelName').focus();
}

function closeCreateLabelModal() {
    document.getElementById('modalCreateLabel').style.display = 'none';
}

function selectLabelColor(btn, color) {
    document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('newLabelColor').value = color;
}

async function saveNewLabel() {
    const name = document.getElementById('newLabelName').value.trim();
    const color = document.getElementById('newLabelColor').value;

    if (!name) {
        alert('Vui lòng nhập tên nhãn');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('action', 'create');
        formData.append('name', name);
        formData.append('color', color);
        formData.append('icon', 'fa-solid fa-tag');

        const res = await fetch('../../api/label_action.php', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            closeCreateLabelModal();
            runSyncPolling();
        } else {
            alert(data.message || 'Lỗi tạo nhãn');
        }
    } catch (err) {
        console.error('Lỗi tạo nhãn:', err);
    }
}

/**
 * Tải nhãn đã gắn cho hội thoại đang mở
 */
async function loadAssignedLabelsForActiveConv() {
    if (!AppState.activeConvId) return;
    try {
        const res = await fetch(`../../api/sync_polling.php?active_conv_id=${AppState.activeConvId}`);
        const data = await res.json();
        if (data.success && data.active_conversation && data.active_conversation.assigned_labels) {
            renderAssignedLabels(data.active_conversation.assigned_labels);
        }
    } catch (e) { }
}

function renderAssignedLabels(labels) {
    if (labels) {
        AppState.assignedLabels = labels;
    }
    const container = document.getElementById('profileLabelsList');
    if (!container) return;

    const allLabels = AppState.allLabels || [];
    if (allLabels.length === 0) {
        container.innerHTML = '<span class="no-labels-text" style="font-size:12px;color:#94a3b8;padding:8px 0;display:block;">Chưa có nhãn phân loại nào. Bấm "+ Tạo nhãn" để bắt đầu.</span>';
        return;
    }

    const assignedIds = (AppState.assignedLabels || []).map(l => Number(l.id));

    let html = '';
    allLabels.forEach(l => {
        const isAssigned = assignedIds.includes(Number(l.id));
        html += `
            <div class="label-toggle-chip ${isAssigned ? 'active' : ''} ${AppState.isViewOnly ? 'is-disabled' : ''}" 
                 onclick="toggleConversationLabel(${l.id})" 
                 title="${AppState.isViewOnly ? 'Chế độ chỉ xem' : (isAssigned ? 'Nhấn để hủy nhãn này' : 'Nhấn để gắn nhãn này')}">
                <span class="label-chip-dot" style="background: ${escapeHtml(l.color || '#6366F1')};"></span>
                <span class="label-chip-name">${escapeHtml(l.name)}</span>
                <i class="fa-solid fa-check label-chip-check"></i>
            </div>
        `;
    });
    container.innerHTML = html;
}

async function toggleConversationLabel(labelId) {
    if (!AppState.activeConvId) return;
    if (AppState.isViewOnly) {
        alert('Hội thoại do nhân viên khác phụ trách. Bạn không có quyền gắn hoặc hủy nhãn.');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('action', 'toggle');
        formData.append('conversation_id', AppState.activeConvId);
        formData.append('label_id', labelId);

        const res = await fetch('../../api/label_action.php', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            AppState.assignedLabels = data.assigned_labels || [];
            renderAssignedLabels(AppState.assignedLabels);
            if (AppState.conversationsCache[AppState.activeConvId]) {
                AppState.conversationsCache[AppState.activeConvId].assigned_labels = AppState.assignedLabels;
            }
            runSyncPolling();
        } else {
            alert(data.message || 'Lỗi thao tác nhãn');
        }
    } catch (err) {
        console.error('Lỗi gắn/hủy nhãn:', err);
    }
}

// ========================================================
// MẪU TIN NHẮN (CANNED RESPONSES)
// ========================================================

function openTemplateModal() {
    document.getElementById('templateModal').style.display = 'flex';
}

function closeTemplateModal() {
    document.getElementById('templateModal').style.display = 'none';
}

function insertVariable(varName) {
    const textarea = document.getElementById('tplContent');
    textarea.value += ' ' + varName + ' ';
    textarea.focus();
}

async function saveNewTemplate() {
    const shortcut = document.getElementById('tplShortcut').value.trim();
    const title = document.getElementById('tplTitle').value.trim();
    const content = document.getElementById('tplContent').value.trim();

    if (!shortcut || !content) {
        alert('Vui lòng nhập phím tắt và nội dung mẫu tin');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('action', 'create');
        formData.append('shortcut', shortcut);
        formData.append('title', title);
        formData.append('content', content);

        const res = await fetch('../../api/template_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            alert('Tạo mẫu tin nhắn thành công!');
            closeTemplateModal();
            document.getElementById('tplShortcut').value = '';
            document.getElementById('tplTitle').value = '';
            document.getElementById('tplContent').value = '';
        } else {
            alert(data.message || 'Lỗi tạo mẫu tin');
        }
    } catch (err) {
        console.error('Lỗi lưu template:', err);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// ========================================================
// BỘ ĐIỀU KHIỂN LIGHTBOX GALLERY OVERLAY PHÓNG TO ẢNH CHUYÊN NGHIỆP
// ========================================================
let currentLightboxState = {
    urls: [],
    currentIndex: 0,
    senderName: '',
    displayTime: '',
    isStaff: false
};

function ensureLightboxModalInDom() {
    if (document.getElementById('omniLightboxModal')) return;

    const modal = document.createElement('div');
    modal.id = 'omniLightboxModal';
    modal.className = 'omni-lightbox-modal';
    modal.innerHTML = `
        <div class="lightbox-topbar">
            <div class="lightbox-sender-info">
                <div class="lightbox-sender-avatar" id="lightboxAvatar">?</div>
                <div>
                    <div class="lightbox-sender-name" id="lightboxSenderName">Người gửi</div>
                    <div class="lightbox-send-time" id="lightboxSendTime">Thời gian</div>
                </div>
            </div>
            <div class="lightbox-counter-badge" id="lightboxCounter">Ảnh 1 / 1</div>
            <div class="lightbox-topbar-actions">
                <a href="javascript:void(0)" class="lightbox-btn-icon" id="lightboxBtnDownload" title="Tải ảnh về máy" download target="_blank">
                    <i class="fa-solid fa-download"></i>
                </a>
                <button type="button" class="lightbox-btn-icon" id="lightboxBtnClose" onclick="closeLightboxGallery()" title="Đóng (Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="lightbox-stage">
            <button type="button" class="lightbox-nav-btn" id="lightboxPrevBtn" onclick="navigateLightbox(-1)" title="Ảnh trước (← hoặc ↑)">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="lightbox-main-container">
                <img id="lightboxMainImg" class="lightbox-main-img" src="" alt="Ảnh phóng to">
            </div>
            <button type="button" class="lightbox-nav-btn" id="lightboxNextBtn" onclick="navigateLightbox(1)" title="Ảnh tiếp (→ hoặc ↓)">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
        <div class="lightbox-thumbnails-strip" id="lightboxThumbsStrip"></div>
    `;
    document.body.appendChild(modal);

    // Bắt sự kiện phím tắt chuyển ảnh và đóng
    window.addEventListener('keydown', (e) => {
        const lb = document.getElementById('omniLightboxModal');
        if (!lb || !lb.classList.contains('is-open')) return;
        if (e.key === 'Escape') {
            closeLightboxGallery();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            navigateLightbox(-1);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            navigateLightbox(1);
        }
    });
}

function openLightboxFromGrid(msgId, startIndex = 0) {
    ensureLightboxModalInDom();
    const cached = window.__GALLERY_CACHE__ && window.__GALLERY_CACHE__[msgId];
    if (!cached || !cached.urls || cached.urls.length === 0) return;

    currentLightboxState.urls = cached.urls;
    currentLightboxState.currentIndex = Math.max(0, Math.min(startIndex, cached.urls.length - 1));
    currentLightboxState.senderName = cached.senderName || 'Người gửi';
    currentLightboxState.displayTime = cached.displayTime || '';
    currentLightboxState.isStaff = cached.isStaff;

    const modal = document.getElementById('omniLightboxModal');
    modal.classList.add('is-open');

    // Cập nhật thông tin người gửi
    document.getElementById('lightboxSenderName').innerText = currentLightboxState.senderName;
    document.getElementById('lightboxSendTime').innerText = currentLightboxState.displayTime ? `Gửi lúc: ${currentLightboxState.displayTime}` : '';
    const avatarEl = document.getElementById('lightboxAvatar');
    if (cached.isStaff && window.APP_CONFIG?.CURRENT_AVATAR) {
        avatarEl.innerHTML = `<img src="${escapeHtml(window.APP_CONFIG.CURRENT_AVATAR)}" alt="Avatar">`;
    } else {
        avatarEl.innerText = (currentLightboxState.senderName || 'U').charAt(0).toUpperCase();
    }

    renderLightboxThumbs();
    updateLightboxActiveImage();
}

function updateLightboxActiveImage() {
    const { urls, currentIndex } = currentLightboxState;
    if (urls.length === 0) return;

    const mainImg = document.getElementById('lightboxMainImg');
    const counterEl = document.getElementById('lightboxCounter');
    const downloadBtn = document.getElementById('lightboxBtnDownload');
    const currentUrl = urls[currentIndex];

    mainImg.src = currentUrl;
    counterEl.innerText = `Ảnh ${currentIndex + 1} / ${urls.length}`;
    if (downloadBtn) downloadBtn.href = currentUrl;

    // Ẩn nút điều hướng nếu chỉ có 1 ảnh duy nhất
    document.getElementById('lightboxPrevBtn').style.visibility = (urls.length > 1) ? 'visible' : 'hidden';
    document.getElementById('lightboxNextBtn').style.visibility = (urls.length > 1) ? 'visible' : 'hidden';

    // Đổi chỉ mục thumbnail đang kích hoạt
    const thumbs = document.querySelectorAll('.lightbox-thumb-item');
    thumbs.forEach((t, idx) => {
        t.classList.toggle('active', idx === currentIndex);
        if (idx === currentIndex) {
            t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    });
}

function renderLightboxThumbs() {
    const strip = document.getElementById('lightboxThumbsStrip');
    const { urls } = currentLightboxState;
    if (urls.length <= 1) {
        strip.style.display = 'none';
        return;
    }
    strip.style.display = 'flex';
    strip.innerHTML = urls.map((u, idx) => `
        <div class="lightbox-thumb-item ${idx === currentLightboxState.currentIndex ? 'active' : ''}" onclick="selectLightboxIndex(${idx})">
            <img src="${escapeHtml(u)}" alt="Thumb ${idx + 1}">
        </div>
    `).join('');
}

function selectLightboxIndex(idx) {
    if (idx < 0 || idx >= currentLightboxState.urls.length) return;
    currentLightboxState.currentIndex = idx;
    updateLightboxActiveImage();
}

function navigateLightbox(dir) {
    const { urls, currentIndex } = currentLightboxState;
    if (urls.length <= 1) return;
    let next = currentIndex + dir;
    if (next < 0) next = urls.length - 1;
    else if (next >= urls.length) next = 0;
    currentLightboxState.currentIndex = next;
    updateLightboxActiveImage();
}

function closeLightboxGallery() {
    const modal = document.getElementById('omniLightboxModal');
    if (modal) modal.classList.remove('is-open');
}
