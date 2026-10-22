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
    assignedLabels: [],
    sheetConfig: null,
    sheetColumns: [],
    sheetRows: [],
    sheetSheetsList: [],
    activeSheetTab: '',
    sheetsCache: {},
    sheetHasChanges: false,
    sheetLastSyncedAt: null,
    templates: []
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

function startAdaptivePolling() {
    if (AppState.pollingInterval) clearInterval(AppState.pollingInterval);
    const delay = document.hidden ? 18000 : 4000;
    AppState.pollingInterval = setInterval(runSyncPolling, delay);
}

document.addEventListener('visibilitychange', () => {
    startAdaptivePolling();
    if (!document.hidden) {
        runSyncPolling();
    }
});

function initWorkspace() {
    // 1. Tải danh sách hội thoại lần đầu
    fetchConversations(true);

    // 2. Kích hoạt chu kỳ Polling AJAX thích ứng (4s khi mở tab, 18s khi ẩn tab để chống quá tải)
    startAdaptivePolling();

    // 3. Khởi tạo & nạp dữ liệu Google Sheets
    initGoogleSheets();

    // 4. Tải danh sách mẫu tin nhắn nhanh (Templates)
    loadTemplatesList();

    // 5. Đóng các Dropdown khi click ra bên ngoài
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
    if (!e.target.closest('#chatInputArea')) {
        closeShortcutSuggestPopup();
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
        if (!res.ok) {
            // Máy chủ 502 hoặc đang bận, bỏ qua nhẹ nhàng không làm spam lỗi JSON
            return;
        }
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (e) {
            return;
        }

        if (!data || !data.success) {
            if (data && data.error === 'UNAUTHENTICATED') {
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
        if (data.conversations && Array.isArray(data.conversations)) {
            const currentUnreadCount = data.conversations.filter(c => c.is_read == 0 && c.last_sender_type === 'CUSTOMER').length;
            if (AppState.lastUnreadCount !== undefined && currentUnreadCount > AppState.lastUnreadCount) {
                playNotificationSound();
            }
            AppState.lastUnreadCount = currentUnreadCount;
        }
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
                <span class="respondio-label-pill" title="${escapeHtml(firstLabel.name)}">
                    <span class="label-pill-dot" style="background:${firstLabel.color || '#6366F1'};"></span>
                    <span>${escapeHtml(firstLabel.name)}</span>
                </span>
            `;
            if (conv.labels.length > 1) {
                const extraLabels = conv.labels.slice(1);
                const extraNames = extraLabels.map(l => l.name).join(', ');
                const tooltipItems = extraLabels.map(l => `
                    <div class="popover-label-item">
                        <span class="label-pill-dot" style="background:${l.color || '#6366F1'};"></span>
                        <span>${escapeHtml(l.name)}</span>
                    </div>
                `).join('');

                labelPillHtml += `
                    <span class="respondio-label-pill label-pill-more" title="${escapeHtml(extraNames)}">
                        +${extraLabels.length}
                        <div class="labels-popover-tooltip">
                            ${tooltipItems}
                        </div>
                    </span>
                `;
            }
        }

        // Tạo nội dung tin nhắn trích đoạn (Nếu nhân viên gửi thì hiện "Bạn: ...")
        let snippetHtml = '';
        const rawLastMsg = (conv.last_message || '').trim();
        if (rawLastMsg) {
            if (isStaffLast) {
                snippetHtml = `<span class="snippet-prefix-you">Bạn: </span>${escapeHtml(rawLastMsg)}`;
            } else {
                snippetHtml = escapeHtml(rawLastMsg);
            }
        } else if (conv.last_message_at) {
            // Có mốc thời gian trao đổi nhưng nội dung text rỗng -> Tin nhắn ảnh
            snippetHtml = isStaffLast ? '<span class="snippet-prefix-you">Bạn: </span>[Hình ảnh]' : '[Hình ảnh]';
        } else {
            snippetHtml = '<i>[Chưa có tin nhắn]</i>';
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
            tagBadge.innerHTML = labels.map(l => `<span class="header-label-pill" style="background:#F1F5F9; padding:2px 8px; border-radius:4px; font-size:11px; margin-right:4px; display:inline-flex; align-items:center; gap:5px; font-weight:600; color:#334155;"><span class="label-pill-dot" style="background:${l.color || '#6366F1'};"></span>${escapeHtml(l.name)}</span>`).join('');
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

    // 1. Phản hồi giao diện ngay lập tức: Đánh dấu thẻ active
    // QUAN TRỌNG: Nếu hội thoại này do nhân viên khác phụ trách thì KHÔNG tự ý xóa trạng thái chưa đọc của họ!
    const targetConv = (AppState.cachedConversations ? AppState.cachedConversations[convId] : null);
    const isOtherStaff = targetConv && targetConv.assigned_user_id && targetConv.assigned_user_id != window.APP_CONFIG?.CURRENT_USER_ID;

    if (!isOtherStaff) {
        if (AppState.cachedConversations && AppState.cachedConversations[convId]) {
            AppState.cachedConversations[convId].is_read = 1;
        }
        if (AppState.conversationsCache && AppState.conversationsCache[convId] && AppState.conversationsCache[convId].conversation) {
            AppState.conversationsCache[convId].conversation.is_read = 1;
        }
    }

    document.querySelectorAll('.conversation-card').forEach(el => {
        const isTarget = (el.getAttribute('data-conv-id') == convId);
        el.classList.toggle('active', isTarget);
        if (isTarget && !isOtherStaff) {
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

    if (isOtherStaff) {
        // ƯU TIÊN 1: Hội thoại do nhân viên khác phụ trách -> Luôn hiển thị đích danh nhân viên phụ trách
        AppState.isViewOnly = true;
        if (lockBanner) lockBanner.style.display = 'flex';
        if (inputArea) inputArea.style.display = 'none';
        if (lockTitle) lockTitle.innerText = 'CHẾ ĐỘ CHỈ XEM';
        if (lockDesc) lockDesc.innerText = `Hội thoại đang được phụ trách bởi ${activeConv.assigned_fullname || 'nhân viên khác'}. Bạn không có quyền gửi tin nhắn.`;
    } else if (isShiftOffline) {
        // ƯU TIÊN 2: Hội thoại của mình hoặc chưa gán nhưng bản thân ĐÃ HẾT CA
        AppState.isViewOnly = true;
        if (lockBanner) lockBanner.style.display = 'flex';
        if (inputArea) inputArea.style.display = 'none';
        if (lockTitle) lockTitle.innerText = 'CHẾ ĐỘ CHỈ XEM';
        if (lockDesc) lockDesc.innerText = 'Hội thoại sẽ được phân chia cho nhân viên khác do bạn đang hết ca. Bạn không có quyền gửi tin nhắn.';
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
        let hasNewCustomerMsg = false;
        new_messages.forEach(msg => {
            if (msg.id > AppState.lastMessageId && !document.getElementById(`msg-${msg.id}`)) {
                appendMessageBubble(msg, true);
                hasNew = true;
                if (msg.sender_type === 'CUSTOMER') {
                    hasNewCustomerMsg = true;
                }
            }
        });
        if (hasNew) {
            updateSeenIndicator();
            scrollChatToBottom();
            if (hasNewCustomerMsg) {
                playNotificationSound();
            }
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
 * CHỈ HIỂN THỊ KHI: Khách hàng thực sự đã mở khung chat xem tin nhắn (customer_seen == 1)
 */
function updateSeenIndicator() {
    const viewport = document.getElementById('messagesViewport');
    if (!viewport) return;

    // Gỡ bỏ seen cũ nếu có
    const oldIndicator = viewport.querySelector('#chatSeenIndicator');
    if (oldIndicator) oldIndicator.remove();

    // Lấy thông tin hội thoại hiện tại
    const currentConv = (AppState.cachedConversations ? AppState.cachedConversations[AppState.activeConvId] : null) ||
        AppState.activeConversation || {};

    // Nếu khách CHƯA xem (customer_seen == 0 hoặc chưa có giá trị), tuyệt đối KHÔNG hiển thị avatar đã xem!
    if (!currentConv || currentConv.customer_seen != 1) {
        return;
    }

    // Tìm tin nhắn cuối cùng do STAFF gửi
    const staffMessages = viewport.querySelectorAll('.message-item.staff');
    if (staffMessages.length === 0) return;

    const lastStaffMsg = staffMessages[staffMessages.length - 1];

    // Nếu sau tin nhắn của staff, khách đã gửi tin nhắn phản hồi rồi thì không cần avatar seen nữa
    const allMessages = viewport.querySelectorAll('.message-item');
    if (allMessages.length > 0 && allMessages[allMessages.length - 1] !== lastStaffMsg) {
        return;
    }

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
                <img src="${escapeHtml(toDisplayImageUrl(u))}" alt="Ảnh tin nhắn" loading="lazy" referrerpolicy="no-referrer">
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
 * Chuẩn hóa URL ảnh (hỗ trợ cả công thức =IMAGE() của Google Sheet và link Google Drive)
 */
// Danh sách các ảnh đang đính kèm chờ gửi (từ template Google Sheet hoặc ghim tệp)
let pendingAttachedImages = [];

function renderAttachedPreviews() {
    const container = document.getElementById('chatAttachedPreviews');
    if (!container) return;

    if (!pendingAttachedImages || pendingAttachedImages.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = pendingAttachedImages.map((imgUrl, idx) => `
        <div class="chat-preview-item" title="Ảnh đính kèm sẽ được gửi riêng biệt">
            <img src="${escapeHtml(toDisplayImageUrl(imgUrl))}" alt="Preview" referrerpolicy="no-referrer">
            <button type="button" class="chat-preview-remove-btn" onclick="removePendingAttachedImage(${idx})" title="Gỡ ảnh này">&times;</button>
        </div>
    `).join('');
}

function removePendingAttachedImage(idx) {
    if (idx >= 0 && idx < pendingAttachedImages.length) {
        pendingAttachedImages.splice(idx, 1);
        renderAttachedPreviews();
    }
}

function clearPendingAttachedImages() {
    pendingAttachedImages = [];
    renderAttachedPreviews();
}

/**
 * Chuẩn hóa URL ảnh (hỗ trợ cả công thức =IMAGE(), link Google Sheets RT và link Google Drive)
 * Tự động chuyển qua proxy /api/proxy_image.php để không bị lỗi NotSameSite hay chặn Referer
 */
function normalizeImageUrl(url) {
    if (!url) return '';
    let u = String(url).trim();
    const formulaMatch = u.match(/^=IMAGE\(["'](https?:\/\/[^"']+)["']\)/i);
    if (formulaMatch) {
        u = formulaMatch[1];
    }
    const driveFileMatch = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (driveFileMatch) {
        u = `https://drive.google.com/thumbnail?id=${driveFileMatch[1]}&sz=w1200`;
    }
    const driveIdMatch = u.match(/drive\.google\.com\/(?:open|uc)\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/i);
    if (driveIdMatch) {
        u = `https://drive.google.com/thumbnail?id=${driveIdMatch[1]}&sz=w1200`;
    }

    return u;
}

/**
 * Chỉ dùng khi RENDER thẻ <img>: bọc ảnh Google (bị chặn NotSameSite) qua proxy server.
 * URL lưu DB / gửi đi luôn là URL gốc.
 */
function toDisplayImageUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (u.includes('proxy-image') || u.includes('proxy_image.php') || u.includes('action=proxy_image')) return u;
    if (u.includes('docs.google.com') || u.includes('sheets-images') || u.includes('googleusercontent.com') || u.includes('drive.google.com')) {
        return `../../api/google_sheet_action.php?action=proxy_image&url=${encodeURIComponent(u)}`;
    }
    return u;
}

/**
 * Trích xuất các URL ảnh ra khỏi văn bản tin nhắn (từ biến Google Sheet hoặc link ảnh)
 */
function extractImageUrlsFromText(text) {
    if (!text || typeof text !== 'string') return { text: '', imageUrls: [] };

    // Giải mã các link proxy tương đối cũ (../../api/proxy_image.php?url=...) về URL gốc
    text = text.replace(/(?:\.\.\/)*(?:api\/)?proxy_image\.php\?url=([^\s<>"']+)/gi, (m, enc) => {
        try { return decodeURIComponent(enc); } catch (e) { return m; }
    });

    const urlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+|data:image\/[a-zA-Z+]+;base64,[^\s<>"']+)/gi;
    const imageUrls = [];

    const isImageUrl = (url) => {
        if (!url) return false;
        const u = url.toLowerCase();
        if (u.startsWith('data:image/')) return true;
        if (u.includes('docs.google.com/sheets-images-rt')) return true;
        if (u.includes('googleusercontent.com')) return true;
        if (u.includes('drive.google.com') && (u.includes('thumbnail') || u.includes('export=view') || u.includes('id=') || u.includes('/file/d/'))) return true;
        if (u.includes('proxy_image.php')) return true;
        if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?.*)?$/i.test(url)) return true;
        if ((u.includes('imgur.com') || u.includes('cloudinary.com') || u.includes('/images/') || u.includes('/img/')) && (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url) || u.includes('image'))) return true;
        return false;
    };

    let remainingText = text.replace(urlRegex, (match) => {
        let cleanUrl = match.replace(/[\.,;!?:)]+$/, '');
        let trailingPunct = match.substring(cleanUrl.length);

        if (isImageUrl(cleanUrl)) {
            imageUrls.push(normalizeImageUrl(cleanUrl));
            return trailingPunct || '';
        }
        return match;
    });

    remainingText = remainingText
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return {
        text: remainingText,
        imageUrls: imageUrls
    };
}

/**
 * Gửi một tin nhắn đơn lẻ (chữ hoặc ảnh hoặc cả hai)
 */
async function doSendSingleMessage(content, attachmentUrl = null) {
    if (!AppState.activeConvId) return null;

    const payload = {
        action: 'send_message',
        conversation_id: AppState.activeConvId,
        content: content || ''
    };
    if (attachmentUrl) {
        payload.attachment_url = attachmentUrl;
    }

    let res = null;
    let text = '';
    let data = null;

    // Ưu tiên 1: Gửi qua message_action.php dạng JSON
    try {
        res = await fetch('../../api/message_action.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        text = await res.text();
        try {
            data = JSON.parse(text);
        } catch (pe) {
            const sIdx = text.indexOf('{');
            const eIdx = text.lastIndexOf('}');
            if (sIdx !== -1 && eIdx !== -1) {
                try { data = JSON.parse(text.substring(sIdx, eIdx + 1)); } catch (e) { }
            }
        }
    } catch (netErr) {
        console.warn('Gửi qua message_action.php gặp sự cố mạng:', netErr);
    }

    // Fail-safe tầng 2: Nếu WAF chặn hoặc phản hồi lỗi, dùng sync_polling.php dạng JSON
    if (!data || (!data.success && (res?.status === 403 || text.includes('403 Forbidden') || text.includes('blocking you')))) {
        try {
            res = await fetch('../../api/sync_polling.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            text = await res.text();
            try {
                data = JSON.parse(text);
            } catch (pe) {
                const sIdx = text.indexOf('{');
                const eIdx = text.lastIndexOf('}');
                if (sIdx !== -1 && eIdx !== -1) {
                    try { data = JSON.parse(text.substring(sIdx, eIdx + 1)); } catch (e) { }
                }
            }
        } catch (fbErr) {
            console.error('Fallback sync_polling thất bại:', fbErr);
        }
    }

    if (data && data.success && data.data) {
        appendMessageBubble(data.data, true);
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
                    content: content || '',
                    attachment_url: attachmentUrl || data.data.attachment_url || null,
                    staff_name: data.data.staff_name || window.APP_CONFIG.CURRENT_FULLNAME || 'Nhân viên tư vấn',
                    staff_avatar: data.data.staff_avatar || window.APP_CONFIG.CURRENT_AVATAR || ''
                })
            }).catch(e => console.warn('Browser direct reply push warning:', e));
        }

        updateSeenIndicator();
        scrollChatToBottom();
        return data.data;
    } else {
        throw new Error(data ? data.message : ('Lỗi máy chủ khi gửi: ' + text.substring(0, 100)));
    }
}

/**
 * Nhân viên gửi tin nhắn (Tự động tách riêng tin nhắn Text và tin nhắn Ảnh từ template Google Sheet)
 */
async function sendMessage(attachmentUrl = null) {
    if (!AppState.activeConvId || AppState.isViewOnly || AppState.isSending) return;

    const input = document.getElementById('chatInput');
    const rawContent = input ? input.value : '';

    // Lấy các ảnh đang chờ gửi từ thanh preview
    const queuedImages = [...pendingAttachedImages];
    if (attachmentUrl) {
        queuedImages.push(...parseAttachmentUrls(attachmentUrl));
    }

    if (!rawContent.trim() && queuedImages.length === 0) return;

    AppState.isSending = true;
    if (input) input.value = '';
    clearPendingAttachedImages();
    const previewBar = document.getElementById('shortcutPreviewBar');
    if (previewBar) previewBar.style.display = 'none';

    try {
        // Bóc tách thêm nếu trong nội dung gõ tay có chứa URL ảnh
        const extracted = extractImageUrlsFromText(rawContent);
        const textPart = extracted.text;
        if (extracted.imageUrls && extracted.imageUrls.length > 0) {
            extracted.imageUrls.forEach(u => {
                if (!queuedImages.includes(u)) queuedImages.push(u);
            });
        }

        const hasImages = queuedImages.length > 0;
        const imgAttachment = hasImages ? queuedImages.join(',') : null;

        if (textPart && hasImages) {
            // Có cả chữ và ảnh: Gửi tin nhắn chữ trước, sau đó gửi ảnh
            await doSendSingleMessage(textPart, null);
            await new Promise(r => setTimeout(r, 150));
            await doSendSingleMessage('', imgAttachment);
        } else if (hasImages) {
            // Chỉ gửi ảnh
            await doSendSingleMessage('', imgAttachment);
        } else {
            // Chỉ gửi chữ
            await doSendSingleMessage(textPart || rawContent.trim(), null);
        }

        runSyncPolling();
    } catch (err) {
        console.error('Lỗi quy trình gửi tin nhắn:', err);
        if (input && rawContent) input.value = rawContent;
        // Khôi phục lại ảnh nếu lỗi gửi
        pendingAttachedImages = queuedImages;
        renderAttachedPreviews();
        alert(err.message || 'Lỗi kết nối khi gửi tin nhắn.');
    } finally {
        AppState.isSending = false;
        if (input) input.focus();
    }
}

// ========================================================
// HỆ THỐNG GỢI Ý & GIẢI PHÓNG BIẾN ĐỘNG TEMPLATE / (PHASE 4)
// ========================================================

let suggestSelectedIndex = -1;
let activeSuggestTemplates = [];
let pendingTemplateForSheetPicker = null;
let shortcutDebounceTimer = null;

function handleChatKeyDown(e) {
    // 1. Phím Escape: Đóng mọi popup gợi ý
    if (e.key === 'Escape') {
        closeShortcutSuggestPopup();
        return;
    }

    // 2. Phím Enter thông thường: gửi tin nhắn
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleShortcutDetect(e) {
    const val = e.target.value;
    const previewBar = document.getElementById('shortcutPreviewBar');

    if (!val.startsWith('/')) {
        closeShortcutSuggestPopup();
        if (previewBar) previewBar.style.display = 'none';
        return;
    }

    clearTimeout(shortcutDebounceTimer);
    shortcutDebounceTimer = setTimeout(() => {
        processShortcutInput(val);
    }, 100);
}

function processShortcutInput(val) {
    const clean = val.trim();
    const previewBar = document.getElementById('shortcutPreviewBar');
    const popup = document.getElementById('templateSuggestPopup');

    if (!clean.startsWith('/')) {
        closeShortcutSuggestPopup();
        if (previewBar) previewBar.style.display = 'none';
        return;
    }

    if (previewBar) previewBar.style.display = 'none';

    // Lọc danh sách mẫu tin phù hợp từ AppState.templates
    const query = clean.substring(1).toLowerCase().trim(); // bỏ dấu /
    const all = AppState.templates || [];

    if (query === '') {
        activeSuggestTemplates = all;
    } else {
        // Tách từ khóa đầu tiên trước khoảng trắng
        const baseQuery = query.split(/\s+/)[0];
        activeSuggestTemplates = all.filter(t => {
            const short = (t.shortcut || '').toLowerCase().replace(/^\/+/, '');
            const title = (t.title || '').toLowerCase();
            return short.includes(baseQuery) || title.includes(baseQuery);
        });
    }

    if (activeSuggestTemplates.length > 0) {
        suggestSelectedIndex = -1; // Không chọn item đầu tiên, không bôi xanh sẵn
        renderSuggestTemplatesList(activeSuggestTemplates);
        if (popup) popup.style.display = 'flex';
        hideSheetRowPicker();
    } else {
        closeShortcutSuggestPopup();
    }
}

function renderSuggestTemplatesList(templates) {
    const container = document.getElementById('suggestTemplatesList');
    if (!container) return;

    let html = '';
    templates.forEach((t, idx) => {
        html += `
            <div class="suggest-item" 
                 id="suggestItem_${idx}" 
                 onclick="selectSuggestTemplateByIndex(${idx})">
                <div class="suggest-item-top">
                    <span class="suggest-item-shortcut">${escapeHtml(t.shortcut)}</span>
                    <span class="suggest-item-title">${escapeHtml(t.title || 'Mẫu tin')}</span>
                </div>
                <div class="suggest-item-snippet">${escapeHtml(t.content || '')}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function navigateSuggestList(direction) {
    // Không dùng phím mũi tên điều hướng gợi ý nữa
}

function selectSuggestTemplateByIndex(idx) {
    if (activeSuggestTemplates && activeSuggestTemplates[idx]) {
        selectSuggestTemplate(activeSuggestTemplates[idx]);
    }
}

let currentPickerRows = [];

async function selectSuggestTemplate(tpl) {
    if (!tpl) return;

    // Kiểm tra xem mẫu tin có sử dụng biến ở shortcut hoặc content không
    const hasVarsInShortcut = /\[([^\]]+)\]/.test(tpl.shortcut || '');
    const hasVarsInContent = /\[([^\]]+)\]/.test(tpl.content || '');

    if (hasVarsInShortcut || hasVarsInContent) {
        // Biến khóa: ưu tiên biến ở shortcut (ví dụ: /[STT] -> STT), nếu không có thì lấy biến đầu tiên trong content
        let keyVar = null;
        const shortcutMatch = (tpl.shortcut || '').match(/\[([^\]]+)\]/);
        if (shortcutMatch) {
            keyVar = shortcutMatch[1].trim();
        } else {
            const contentMatch = (tpl.content || '').match(/\[([^\]]+)\]/);
            if (contentMatch) keyVar = contentMatch[1].trim();
        }

        // Tự động nhận diện sheet_name nếu template chưa lưu sheet_name
        let targetSheetName = tpl.sheet_name || '';
        if (!targetSheetName && keyVar) {
            targetSheetName = getSheetOfVariable(keyVar) || '';
        }

        let targetRows = null;
        let targetCols = [];

        // Nếu xác định được sheet cụ thể
        if (targetSheetName) {
            if (AppState.sheetsCache && AppState.sheetsCache[targetSheetName] && AppState.sheetsCache[targetSheetName].length > 0) {
                targetRows = AppState.sheetsCache[targetSheetName];
            } else {
                try {
                    const res = await fetch(`../../api/google_sheet_action.php?action=get_data&sheet_name=${encodeURIComponent(targetSheetName)}`);
                    const d = await res.json();
                    if (d && d.success && Array.isArray(d.rows)) {
                        if (!AppState.sheetsCache) AppState.sheetsCache = {};
                        AppState.sheetsCache[targetSheetName] = d.rows;
                        targetRows = d.rows;
                    }
                } catch (err) {
                    console.warn('Lỗi tải dữ liệu sheet cho template:', err);
                }
            }

            const foundSheet = (AppState.sheetSheetsList || []).find(s => s.name === targetSheetName);
            if (foundSheet && Array.isArray(foundSheet.columns) && foundSheet.columns.length > 0) {
                targetCols = foundSheet.columns;
            }
        }

        // Fallback sang sheet đang mở nếu không gắn riêng hoặc không tìm thấy
        if (!targetRows || targetRows.length === 0) {
            targetRows = AppState.sheetRows;
            targetCols = AppState.sheetColumns;
        }

        if (targetRows && targetRows.length > 0) {
            pendingTemplateForSheetPicker = tpl;
            showSheetRowPicker(targetRows, targetCols, targetSheetName, keyVar);
            return;
        }
    }

    // Nếu không có biến hoặc chưa có dữ liệu: điền trực tiếp nội dung mẫu tin
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = tpl.content;
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
    }
    closeShortcutSuggestPopup();
}

let sheetPickerSelectedIndex = 0;

function showSheetRowPicker(rows, cols, sheetName, keyVar) {
    const picker = document.getElementById('suggestSheetPicker');
    const listContainer = document.getElementById('suggestSheetRowsList');
    const templatesList = document.getElementById('suggestTemplatesList');
    const headerTitle = picker ? picker.querySelector('.suggest-sheet-picker-header span') : null;

    if (!picker || !listContainer) return;

    if (templatesList) templatesList.style.display = 'none';
    picker.style.display = 'block';

    currentPickerRows = rows || [];
    sheetPickerSelectedIndex = 0;

    if (headerTitle) {
        if (keyVar) {
            headerTitle.innerHTML = `<i class="fa-solid fa-table" style="color:var(--primary);"></i> Chọn giá trị <strong>[${escapeHtml(keyVar)}]</strong>:`;
        } else {
            headerTitle.innerHTML = `<i class="fa-solid fa-table" style="color:var(--primary);"></i> Chọn dữ liệu để điền mẫu:`;
        }
    }

    let html = '';
    currentPickerRows.slice(0, 50).forEach((row, idx) => {
        // Tìm giá trị của biến keyVar trong dòng
        let varVal = '';
        if (keyVar) {
            for (const k of Object.keys(row)) {
                if (k.trim().toLowerCase() === keyVar.toLowerCase()) {
                    varVal = row[k];
                    break;
                }
            }
            if (varVal === '' || varVal === undefined) {
                varVal = row[keyVar] !== undefined ? row[keyVar] : `Dòng ${idx + 1}`;
            }
        } else {
            varVal = row['id'] || row['ID'] || row['mã'] || row['Mã'] || row['stt'] || row['STT'] || (idx + 1);
        }

        html += `
            <div class="suggest-sheet-row-card" 
                 id="pickerRow_${idx}" 
                 onclick="applyTemplateWithSheetRowByIndex(${idx})"
                 style="display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid #F1F5F9;cursor:pointer;">
                <span style="font-size:13px;font-weight:600;color:#1E293B;">
                    ${escapeHtml(String(varVal))}
                </span>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

function navigateSheetPicker(direction) {
    const rows = (currentPickerRows || []).slice(0, 50);
    if (rows.length === 0) return;

    sheetPickerSelectedIndex += direction;
    if (sheetPickerSelectedIndex < 0) {
        sheetPickerSelectedIndex = rows.length - 1;
    } else if (sheetPickerSelectedIndex >= rows.length) {
        sheetPickerSelectedIndex = 0;
    }

    document.querySelectorAll('#suggestSheetRowsList .suggest-sheet-row-card').forEach((el, idx) => {
        el.classList.toggle('is-selected', idx === sheetPickerSelectedIndex);
    });

    const activeEl = document.getElementById(`pickerRow_${sheetPickerSelectedIndex}`);
    if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
    }
}

function selectActiveSheetPickerRow() {
    applyTemplateWithSheetRowByIndex(sheetPickerSelectedIndex);
}

function hideSheetRowPicker() {
    const picker = document.getElementById('suggestSheetPicker');
    const templatesList = document.getElementById('suggestTemplatesList');
    if (picker) picker.style.display = 'none';
    if (templatesList) templatesList.style.display = 'block';
    pendingTemplateForSheetPicker = null;
    sheetPickerSelectedIndex = 0;
    currentPickerRows = [];
}

function applyTemplateWithSheetRowByIndex(idx) {
    if (currentPickerRows && currentPickerRows[idx] && pendingTemplateForSheetPicker) {
        applyTemplateWithSheetRow(pendingTemplateForSheetPicker, currentPickerRows[idx]);
    }
}

function applyTemplateWithSheetRow(tpl, row) {
    if (!tpl || !row) return;

    let compiled = tpl.content || '';
    // Tự động thay thế toàn bộ các biến [tên_cột] có trong nội dung mẫu tin
    Object.keys(row).forEach(col => {
        let val = (row[col] !== undefined && row[col] !== null) ? String(row[col]) : '';
        val = normalizeImageUrl(val);
        const re = new RegExp('\\[' + escapeRegExp(col.trim()) + '\\]', 'gi');
        compiled = compiled.replace(re, val);
    });

    // Tách các URL ảnh ra khỏi văn bản để đưa vào khung preview nhỏ phía trên ô nhập liệu
    const extracted = extractImageUrlsFromText(compiled);
    if (extracted.imageUrls && extracted.imageUrls.length > 0) {
        extracted.imageUrls.forEach(img => {
            if (!pendingAttachedImages.includes(img)) {
                pendingAttachedImages.push(img);
            }
        });
        renderAttachedPreviews();
        compiled = extracted.text;
    }

    const input = document.getElementById('chatInput');
    if (input) {
        input.value = compiled;
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
    }

    closeShortcutSuggestPopup();
    showToast('⚡ Đã điền mẫu tin nhắn thành công!', 'success');
}

/**
 * Giải phóng đồng bộ phím tắt tức thì (0ms) từ bộ nhớ Client
 */
function tryResolveShortcutSync(inputVal) {
    const raw = (inputVal || '').trim();
    if (!raw) return null;

    const all = AppState.templates || [];
    if (all.length === 0) return null;

    const parts = raw.split(/\s+/);
    const baseCmd = parts[0];
    const baseClean = baseCmd.replace(/^\/+/, '').toLowerCase();
    const rawClean = raw.replace(/^\/+/, '').toLowerCase();
    const param = parts.length > 1 ? parts.slice(1).join(' ').trim() : null;

    let matchedTpl = null;
    let extractedParam = param;

    for (const t of all) {
        const tRaw = (t.shortcut || '').trim();
        const tClean = tRaw.replace(/^\/+/, '').toLowerCase();

        // 1. Khớp chính xác hoàn toàn (ví dụ: "chao" hoặc "/chao")
        if (tClean === rawClean || tRaw.toLowerCase() === raw.toLowerCase()) {
            matchedTpl = t;
            extractedParam = null;
            break;
        }

        // 2. Template có dạng "sp [id]" hoặc "/sp [id]"
        const varMatch = tClean.match(/^([^\s\[]+)\s*\[([^\]]+)\]$/i);
        if (varMatch) {
            const cmd = varMatch[1].toLowerCase();
            if (cmd === baseClean && param) {
                matchedTpl = t;
                extractedParam = param;
                break;
            }
        }

        // 3. Template có dạng "id=[id]" hoặc "/id=[id]"
        const eqMatch = tClean.match(/^([^=\[]+=)\s*\[([^\]]+)\]$/i);
        if (eqMatch) {
            const prefix = eqMatch[1].toLowerCase();
            if (rawClean.startsWith(prefix)) {
                matchedTpl = t;
                extractedParam = rawClean.substring(prefix.length).trim();
                break;
            }
        }

        // 4. Template shortcut thuần "sp", người dùng gõ "sp 3" hoặc "/sp 3"
        if (tClean === baseClean && param) {
            matchedTpl = t;
            extractedParam = param;
            break;
        }

        // 5. Template shortcut chỉ ghi mỗi tên biến "[id]" hoặc "/[id]"
        if (/^\/?\[([^\]]+)\]$/i.test(tClean)) {
            matchedTpl = t;
            extractedParam = rawClean;
            break;
        }
    }

    if (!matchedTpl) return null;

    // Nếu template không có biến hoặc không có tham số trích xuất
    const hasVars = /\[([^\]]+)\]/.test(matchedTpl.content || '');
    if (!hasVars || !extractedParam) {
        return matchedTpl.content;
    }

    // Tìm dòng dữ liệu tương ứng: ưu tiên trang tính được gắn trong template hoặc gộp toàn bộ sheets
    let rows = AppState.sheetRows || [];
    if (matchedTpl.sheet_name && AppState.sheetsCache && AppState.sheetsCache[matchedTpl.sheet_name]) {
        rows = AppState.sheetsCache[matchedTpl.sheet_name];
    } else if (AppState.sheetsCache && Object.keys(AppState.sheetsCache).length > 0) {
        rows = [];
        Object.values(AppState.sheetsCache).forEach(arr => {
            if (Array.isArray(arr)) rows.push(...arr);
        });
    }
    let matchedRow = null;

    for (const r of rows) {
        let isMatch = false;
        // Ưu tiên so khớp cột id / mã / stt
        for (const [k, v] of Object.entries(r)) {
            const lk = k.toLowerCase().trim();
            if (lk === 'id' || lk === 'mã' || lk === 'ma' || lk === 'stt' || lk === 'code') {
                if (String(v).trim().toLowerCase() === extractedParam.toLowerCase()) {
                    isMatch = true;
                    break;
                }
            }
        }
        // Nếu không có cột id, tìm so khớp giá trị bất kỳ trong hàng
        if (!isMatch) {
            for (const v of Object.values(r)) {
                if (String(v).trim().toLowerCase() === extractedParam.toLowerCase()) {
                    isMatch = true;
                    break;
                }
            }
        }

        if (isMatch) {
            matchedRow = r;
            break;
        }
    }

    if (matchedRow) {
        let compiled = matchedTpl.content;
        Object.keys(matchedRow).forEach(col => {
            let val = matchedRow[col] !== undefined ? String(matchedRow[col]) : '';
            val = normalizeImageUrl(val);
            const re = new RegExp('\\[' + escapeRegExp(col.trim()) + '\\]', 'gi');
            compiled = compiled.replace(re, val);
        });
        return compiled;
    }

    return matchedTpl.content;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function closeShortcutSuggestPopup() {
    const popup = document.getElementById('templateSuggestPopup');
    if (popup) popup.style.display = 'none';
    hideSheetRowPicker();
    suggestSelectedIndex = -1;
    activeSuggestTemplates = [];
}

async function fetchResolvedShortcut(shortcut) {
    try {
        const res = await fetch(`../../api/template_action.php?action=resolve_shortcut&shortcut=${encodeURIComponent(shortcut)}`);
        const data = await res.json();
        const previewBar = document.getElementById('shortcutPreviewBar');
        if (data.success && data.data) {
            window.CURRENT_RESOLVED_TEMPLATE = data.data.compiled_content;
            if (previewBar) {
                previewBar.style.display = 'flex';
                document.getElementById('shortcutPreviewText').innerHTML =
                    `<i class="fa-solid fa-bolt" style="color:#10B981;"></i> Mẫu: <strong>${escapeHtml(data.data.template.title)}</strong>: ${escapeHtml(data.data.compiled_content.substring(0, 70))}...`;
            }
        } else {
            if (previewBar) {
                previewBar.style.display = 'flex';
                document.getElementById('shortcutPreviewText').innerHTML =
                    `<i class="fa-solid fa-circle-question"></i> Đang tìm mẫu tin cho <strong>${escapeHtml(shortcut)}</strong>...`;
            }
        }
    } catch (err) {
        console.warn('Lỗi kiểm tra shortcut:', err);
    }
}

function applyShortcutDirectly() {
    if (window.CURRENT_RESOLVED_TEMPLATE) {
        let compiled = window.CURRENT_RESOLVED_TEMPLATE;
        const extracted = extractImageUrlsFromText(compiled);
        if (extracted.imageUrls && extracted.imageUrls.length > 0) {
            extracted.imageUrls.forEach(img => {
                if (!pendingAttachedImages.includes(img)) {
                    pendingAttachedImages.push(img);
                }
            });
            renderAttachedPreviews();
            compiled = extracted.text;
        }

        const input = document.getElementById('chatInput');
        input.value = compiled;
        document.getElementById('shortcutPreviewBar').style.display = 'none';
        closeShortcutSuggestPopup();
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
    }
}

/**
 * Nén ảnh phía client (tối đa 1600px, JPEG 0.85) và trả về dataURL base64
 */
function compressImageToDataUrl(file, maxSize = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không đọc được tệp ' + file.name));
        reader.onload = () => {
            // GIF giữ nguyên để không mất animation
            if (file.type === 'image/gif') return resolve(reader.result);
            const img = new Image();
            img.onerror = () => resolve(reader.result);
            img.onload = () => {
                let { width, height } = img;
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function postJsonSafe(url, payload) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {
        const sIdx = text.indexOf('{');
        const eIdx = text.lastIndexOf('}');
        if (sIdx !== -1 && eIdx !== -1) {
            try { data = JSON.parse(text.substring(sIdx, eIdx + 1)); } catch (e2) { }
        }
    }
    return { res, text, data };
}

async function handleAttachmentUpload(input) {
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files).filter(f => /^image\//.test(f.type));
    if (files.length === 0) {
        input.value = '';
        return alert('Chỉ hỗ trợ tệp ảnh.');
    }

    try {
        // Upload bằng JSON base64 (hosting đang chặn POST multipart/form-data)
        const encoded = [];
        for (const f of files) {
            encoded.push({ name: f.name, data: await compressImageToDataUrl(f) });
        }
        const payload = { action: 'upload_attachment_b64', files: encoded };

        let r = null;
        try {
            r = await postJsonSafe('../../api/message_action.php', payload);
        } catch (netErr) {
            console.warn('Lỗi mạng khi tải ảnh qua message_action.php:', netErr);
        }

        // Dự phòng: nếu WAF chặn, gửi qua sync_polling.php
        if (!r || !r.data || (!r.data.success && (r.res.status === 403 || r.text.includes('403 Forbidden')))) {
            r = await postJsonSafe('../../api/sync_polling.php', payload);
        }

        const data = r && r.data;
        if (data && data.success && data.data && (data.data.attachment_url || data.data.url)) {
            const urls = parseAttachmentUrls(data.data.attachment_url || data.data.url);
            urls.forEach(u => {
                if (!pendingAttachedImages.includes(u)) pendingAttachedImages.push(u);
            });
            renderAttachedPreviews();
            showToast('Đã đính kèm ảnh, bấm Gửi để gửi cho khách.', 'success');
        } else {
            alert((data && data.message) || ('Lỗi tải ảnh (HTTP ' + (r?.res?.status || '?') + ')'));
        }
    } catch (err) {
        console.error('Lỗi upload tệp:', err);
        alert(err.message || 'Lỗi tải ảnh');
    } finally {
        input.value = '';
    }
}

/**
 * Cập nhật Sidebar Phải (Hồ sơ Khách Hàng 360)
 */
function renderProfileSidebar(profile, conv, assignedLabels) {
    if (!profile) return;

    // Lưu lại profile hiện tại vào AppState để Modal dễ dùng
    AppState.currentCustomerProfile = profile;

    // Tên tài khoản kênh: Giữ nguyên theo tài khoản kênh trò chuyện (conv.sender_name), không lấy real_name
    const channelAccountName = (conv && conv.sender_name) || (AppState.activeConversation && AppState.activeConversation.sender_name) || profile.customer_name || 'Khách Hàng';
    const profileCustNameEl = document.getElementById('profileCustomerName');
    if (profileCustNameEl) profileCustNameEl.innerText = channelAccountName;

    const rightCustAvtEl = document.getElementById('rightCustomerAvatar');
    if (rightCustAvtEl) rightCustAvtEl.innerText = channelAccountName.charAt(0).toUpperCase();

    if (conv) {
        const rightAvatarChannelIcon = document.getElementById('rightAvatarChannelIcon');
        if (rightAvatarChannelIcon) {
            const channelCfg = CHANNEL_CONFIG[conv.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conv.channel || 'Webchat', class: 'badge-channel-WEBCHAT' };
            rightAvatarChannelIcon.innerHTML = channelCfg.icon;
            rightAvatarChannelIcon.className = `partner-channel-mini-badge badge-channel-large badge-channel-${conv.channel || 'WEBCHAT'}`;
        }
    }

    // Helper cập nhật ô text + class is-empty
    function setAttrVal(elId, val, defaultText = 'Chưa có thông tin') {
        const el = document.getElementById(elId);
        if (!el) return;
        const strVal = (val !== null && val !== undefined) ? String(val).trim() : '';
        const isValid = strVal !== '' && strVal !== 'Chưa xác định' && strVal !== defaultText;
        const textVal = isValid ? strVal : defaultText;
        el.innerText = textVal;
        if (textVal === defaultText) {
            el.classList.add('is-empty');
        } else {
            el.classList.remove('is-empty');
        }
    }

    // 8 trường thông tin khách hàng chuẩn
    setAttrVal('crmRealName', profile.real_name);
    setAttrVal('crmPhone', profile.phone);
    setAttrVal('crmAddress', profile.address);
    const rawBody = profile.body_measurements || profile.preferred_size;
    setAttrVal('crmBodyMeasurements', (rawBody && rawBody !== 'Chưa xác định') ? rawBody : null);
    setAttrVal('crmCustomerNeeds', profile.customer_needs);
    setAttrVal('crmRecentPurchases', profile.recent_purchases);
    setAttrVal('crmNotes', profile.notes);
    setAttrVal('crmSummary', profile.conversation_summary, 'Chưa có tóm tắt');

    // Mốc thời gian ghi nhận dữ liệu
    const elDateRange = document.getElementById('crmDateRange');
    if (elDateRange) {
        const fromDate = profile.from_date_formatted || '01/01/2026';
        const toDate = profile.to_date_formatted || new Date().toLocaleDateString('vi-VN');
        elDateRange.innerText = `${fromDate} đến ${toDate}`;
    }

    // Khóa/Mở nút Sửa ở tiêu đề nếu ở chế độ Chỉ Xem
    const btnEditProfile = document.getElementById('btnEditCustomerProfile');
    if (btnEditProfile) {
        if (AppState.isViewOnly) {
            btnEditProfile.style.pointerEvents = 'none';
            btnEditProfile.style.opacity = '0.35';
        } else {
            btnEditProfile.style.pointerEvents = 'auto';
            btnEditProfile.style.opacity = '1';
        }
    }

    const btnUpdate = document.getElementById('btnUpdateProfile');
    if (btnUpdate) {
        btnUpdate.disabled = AppState.isViewOnly;
    }

    // Render nhãn phân loại
    const labelsToRender = assignedLabels || AppState.assignedLabels || (conv && conv.labels) || [];
    renderAssignedLabels(labelsToRender);
}

/**
 * Nút CẬP NHẬT HỒ SƠ: Gọi Gemini AI đọc toàn bộ hội thoại và trích xuất 8 trường CRM
 */
async function handleUpdateCustomerProfile() {
    if (!AppState.activeConvId) return;
    if (AppState.isViewOnly) {
        alert('Hội thoại đang ở chế độ chỉ xem. Bạn không có quyền cập nhật hồ sơ.');
        return;
    }

    const btn = document.getElementById('btnUpdateProfile');
    const originalText = btn ? btn.innerText : 'CẬP NHẬT HỒ SƠ';
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'AI ĐANG PHÂN TÍCH...';
    }

    try {
        const params = new URLSearchParams();
        params.append('action', 'ai_extract_profile');
        params.append('conversation_id', AppState.activeConvId);

        const res = await fetch('../../api/customer_action.php', {
            method: 'POST',
            body: params
        });
        const data = await res.json();

        if (data.success && data.data && data.data.profile) {
            if (btn) btn.innerText = 'ĐÃ CẬP NHẬT XONG!';
            renderProfileSidebar(data.data.profile, AppState.activeConversation);

            // Hiệu ứng highlight các trường vừa được AI phát hiện
            const extracted = data.data.extracted || {};
            const fieldMap = {
                'real_name': 'crmRealName',
                'phone': 'crmPhone',
                'address': 'crmAddress',
                'body_measurements': 'crmBodyMeasurements',
                'customer_needs': 'crmCustomerNeeds',
                'recent_purchases': 'crmRecentPurchases',
                'notes': 'crmNotes',
                'conversation_summary': 'crmSummary'
            };

            Object.entries(fieldMap).forEach(([k, elId]) => {
                if (extracted[k] && String(extracted[k]).trim() !== '') {
                    const el = document.getElementById(elId);
                    const parentBox = el ? el.closest('.attribute-item-box') : null;
                    if (parentBox) {
                        parentBox.classList.remove('attr-highlight-updated');
                        void parentBox.offsetWidth; // trigger reflow
                        parentBox.classList.add('attr-highlight-updated');
                    }
                }
            });
        } else if (data.data && data.data.no_new_info) {
            // Không có dữ liệu/tin nhắn mới (cơ chế chống lãng phí API)
            if (btn) btn.innerText = 'CHƯA CÓ TIN MỚI';
            alert(data.message || 'Hội thoại chưa có thông tin mới để phân tích.');
        } else {
            alert(data.message || 'Không thể trích xuất hồ sơ bằng AI. Vui lòng kiểm tra lại GEMINI_API_KEY.');
            if (btn) btn.innerText = 'LỖI CẬP NHẬT';
        }
    } catch (err) {
        console.error('Lỗi gọi Gemini AI trích xuất CRM:', err);
        alert('Lỗi kết nối tới máy chủ khi gọi AI.');
        if (btn) btn.innerText = 'LỖI CẬP NHẬT';
    } finally {
        setTimeout(() => {
            if (btn) {
                btn.disabled = AppState.isViewOnly;
                btn.innerText = 'CẬP NHẬT HỒ SƠ';
            }
        }, 2000);
    }
}

/**
 * Mở modal chỉnh sửa hồ sơ khách hàng (8 trường)
 */
function openEditCustomerProfileModal() {
    if (!AppState.activeConvId) {
        alert('Vui lòng chọn một cuộc trò chuyện để chỉnh sửa hồ sơ.');
        return;
    }
    if (AppState.isViewOnly) {
        alert('Hội thoại đang ở chế độ chỉ xem. Bạn không có quyền chỉnh sửa.');
        return;
    }

    const modal = document.getElementById('modalEditCustomerProfile');
    if (!modal) return;

    // Helper lấy text sạch (nếu là 'Chưa có...' hoặc 'Chưa xác định' thì trả về rỗng)
    function getCleanVal(elId, defaultText) {
        const el = document.getElementById(elId);
        if (!el) return '';
        const txt = el.innerText.trim();
        return (txt === defaultText || txt === 'Chưa có thông tin' || txt === 'Chưa xác định' || txt === 'Chưa có tóm tắt') ? '' : txt;
    }

    const p = AppState.currentCustomerProfile || {};

    const inRealName = document.getElementById('modalInputRealName');
    const inPhone = document.getElementById('modalInputPhone');
    const inAddress = document.getElementById('modalInputAddress');
    const inBody = document.getElementById('modalInputBodyMeasurements');
    const inNeeds = document.getElementById('modalInputCustomerNeeds');
    const inRecent = document.getElementById('modalInputRecentPurchases');
    const inNotes = document.getElementById('modalInputNotes');
    const inSummary = document.getElementById('modalInputSummary');

    if (inRealName) inRealName.value = p.real_name || getCleanVal('crmRealName', 'Chưa có thông tin');
    if (inPhone) inPhone.value = p.phone || getCleanVal('crmPhone', 'Chưa có thông tin');
    if (inAddress) inAddress.value = p.address || getCleanVal('crmAddress', 'Chưa có thông tin');
    
    const rawBody = p.body_measurements || p.preferred_size;
    const cleanBody = (rawBody && rawBody !== 'Chưa xác định') ? rawBody : getCleanVal('crmBodyMeasurements', 'Chưa có thông tin');
    if (inBody) inBody.value = cleanBody;

    if (inNeeds) inNeeds.value = p.customer_needs || getCleanVal('crmCustomerNeeds', 'Chưa có thông tin');
    if (inRecent) inRecent.value = p.recent_purchases || getCleanVal('crmRecentPurchases', 'Chưa có thông tin');
    if (inNotes) inNotes.value = p.notes || getCleanVal('crmNotes', 'Chưa có thông tin');
    if (inSummary) inSummary.value = p.conversation_summary || getCleanVal('crmSummary', 'Chưa có tóm tắt');

    modal.style.display = 'flex';
}

function closeEditCustomerProfileModal() {
    const modal = document.getElementById('modalEditCustomerProfile');
    if (modal) modal.style.display = 'none';
}

/**
 * Lưu 8 trường từ Modal chỉnh sửa hồ sơ khách hàng
 */
async function handleSaveCustomerProfileModal() {
    if (!AppState.activeConvId) return;
    if (AppState.isViewOnly) {
        alert('Hội thoại đang ở chế độ chỉ xem. Bạn không có quyền chỉnh sửa.');
        return;
    }

    const btnSave = document.getElementById('btnSaveCustomerProfileModal');
    const originalText = btnSave ? btnSave.innerText : 'Lưu Thay Đổi';
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerText = 'Đang lưu...';
    }

    try {
        const params = new URLSearchParams();
        params.append('action', 'update_crm_profile');
        params.append('conversation_id', AppState.activeConvId);

        const realName = document.getElementById('modalInputRealName')?.value?.trim() || '';
        const phone = document.getElementById('modalInputPhone')?.value?.trim() || '';
        const address = document.getElementById('modalInputAddress')?.value?.trim() || '';
        const bodyMeasurements = document.getElementById('modalInputBodyMeasurements')?.value?.trim() || '';
        const needs = document.getElementById('modalInputCustomerNeeds')?.value?.trim() || '';
        const recentPurchases = document.getElementById('modalInputRecentPurchases')?.value?.trim() || '';
        const notes = document.getElementById('modalInputNotes')?.value?.trim() || '';
        const summary = document.getElementById('modalInputSummary')?.value?.trim() || '';

        params.append('real_name', realName);
        params.append('phone', phone);
        params.append('address', address);
        params.append('body_measurements', bodyMeasurements);
        params.append('customer_needs', needs);
        params.append('recent_purchases', recentPurchases);
        params.append('notes', notes);
        params.append('conversation_summary', summary);

        const res = await fetch('../../api/customer_action.php', {
            method: 'POST',
            body: params
        });
        const data = await res.json();

        if (data.success && data.data && data.data.profile) {
            renderProfileSidebar(data.data.profile, AppState.activeConversation);
            closeEditCustomerProfileModal();
        } else {
            alert(data.message || 'Lỗi lưu hồ sơ khách hàng.');
        }
    } catch (err) {
        console.error('Lỗi lưu hồ sơ CRM:', err);
        alert('Lỗi kết nối máy chủ khi lưu hồ sơ.');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerText = originalText;
        }
    }
}

async function handleShiftChange(status) {
    try {
        const params = new URLSearchParams();
        params.append('action', 'toggle_shift');
        params.append('status', status);

        const res = await fetch('../../api/sync_polling.php', {
            method: 'POST',
            body: params
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
 * Click trực tiếp vào tab Chưa đọc -> Lọc ngay lập tức
 */
function triggerUnreadTabClick() {
    AppState.currentTab = 'unreplied';
    AppState.unrepliedScope = AppState.unrepliedScope || 'all';

    document.getElementById('tabAll').classList.remove('active');
    document.getElementById('tabMine').classList.remove('active');
    document.getElementById('tabUnread').classList.add('active');

    document.getElementById('unreadOptAll').classList.toggle('active', AppState.unrepliedScope === 'all');
    document.getElementById('unreadOptMine').classList.toggle('active', AppState.unrepliedScope === 'mine');
    document.getElementById('unreadTabLabel').innerText = (AppState.unrepliedScope === 'mine') ? 'Chưa đọc (Tôi)' : 'Chưa đọc';

    document.getElementById('unreadDropdownMenu').classList.remove('show');
    fetchConversations();
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

let globalAudioCtx = null;

/**
 * Mở khóa Web Audio API ngay khi có tương tác đầu tiên của người dùng
 */
function unlockAudioContext() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!globalAudioCtx) {
            globalAudioCtx = new AudioCtx();
        }
        if (globalAudioCtx.state === 'suspended') {
            globalAudioCtx.resume().catch(() => {});
        }
    } catch (e) {}
}

document.addEventListener('click', unlockAudioContext, { passive: true });
document.addEventListener('keydown', unlockAudioContext, { passive: true });
document.addEventListener('touchstart', unlockAudioContext, { passive: true });

/**
 * Âm thanh thông báo tin nhắn mới tinh tế chuẩn Web Audio API Synthesizer (Ting-Ting)
 * Âm lượng tiêu chuẩn tối ưu to, rõ ràng và vang chuẩn 0.95
 */
function playNotificationSound() {
    try {
        if (!globalAudioCtx || globalAudioCtx.state !== 'running') {
            return; // Chỉ phát âm thanh sau khi người dùng đã click tương tác trên trang
        }
        const ctx = globalAudioCtx;
        const now = ctx.currentTime;

        // Âm sắc 1 (587.33 Hz - nốt D5, âm lượng to rõ chuẩn 0.90)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.90, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Âm sắc 2 (880 Hz - nốt A5) vang sau 0.08s, âm lượng 0.95
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(880, now + 0.08);
        gain2.gain.setValueAtTime(0.95, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.55);
    } catch (e) {
        console.warn('Sound notification warn:', e);
    }
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

// ========================================================
// HỆ THỐNG TÌM KIẾM CHUYÊN DỤNG PHONG CÁCH ZALO
// ========================================================
AppState.searchMode = false;
AppState.searchSubTab = 'all'; // 'all' | 'customers' | 'messages'
AppState.searchZaloResults = { customers: [], messages: [] };
let zaloSearchDebounce = null;

function enterSearchMode() {
    AppState.searchMode = true;
    const btnClose = document.getElementById('btnCloseSearch');
    if (btnClose) btnClose.style.display = 'inline-flex';

    const normalControls = document.getElementById('sidebarNormalControls');
    if (normalControls) normalControls.style.display = 'none';

    const convList = document.getElementById('conversationsContainer');
    if (convList) convList.style.display = 'none';

    const zaloPanel = document.getElementById('zaloSearchPanel');
    if (zaloPanel) zaloPanel.classList.add('is-active');

    const input = document.getElementById('searchInput');
    if (input && input.value.trim()) {
        handleZaloSearch(input.value.trim());
    }
}

function exitSearchMode() {
    AppState.searchMode = false;
    AppState.searchQuery = '';
    AppState.searchZaloResults = { customers: [], messages: [] };

    const input = document.getElementById('searchInput');
    if (input) input.value = '';

    const btnClear = document.getElementById('btnClearSearch');
    if (btnClear) btnClear.style.display = 'none';

    const btnClose = document.getElementById('btnCloseSearch');
    if (btnClose) btnClose.style.display = 'none';

    const zaloPanel = document.getElementById('zaloSearchPanel');
    if (zaloPanel) zaloPanel.classList.remove('is-active');

    const normalControls = document.getElementById('sidebarNormalControls');
    if (normalControls) normalControls.style.display = 'block';

    const convList = document.getElementById('conversationsContainer');
    if (convList) convList.style.display = 'block';
}

function clearZaloSearch() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    const btnClear = document.getElementById('btnClearSearch');
    if (btnClear) btnClear.style.display = 'none';

    AppState.searchZaloResults = { customers: [], messages: [] };
    renderZaloSearchResults();
}

function switchSearchSubTab(subTab) {
    AppState.searchSubTab = subTab;
    document.getElementById('searchSubTabAll')?.classList.toggle('active', subTab === 'all');
    document.getElementById('searchSubTabCustomers')?.classList.toggle('active', subTab === 'customers');
    document.getElementById('searchSubTabMessages')?.classList.toggle('active', subTab === 'messages');
    renderZaloSearchResults();
}

function handleZaloSearch(val) {
    const cleanVal = (val || '').trim();
    const btnClear = document.getElementById('btnClearSearch');
    if (btnClear) {
        btnClear.style.display = cleanVal ? 'block' : 'none';
    }

    if (!cleanVal) {
        AppState.searchZaloResults = { customers: [], messages: [] };
        renderZaloSearchResults();
        return;
    }

    clearTimeout(zaloSearchDebounce);
    zaloSearchDebounce = setTimeout(async () => {
        try {
            // Thử gọi qua search_action.php
            let res = await fetch(`../../api/search_action.php?q=${encodeURIComponent(cleanVal)}`);
            let data = null;
            if (res.ok) {
                data = await res.json();
            }
            if (!data || !data.success) {
                // Fallback qua sync_polling
                res = await fetch(`../../api/sync_polling.php?action=search_zalo&q=${encodeURIComponent(cleanVal)}`);
                data = await res.json();
            }

            if (data && data.success && data.data) {
                AppState.searchZaloResults = data.data;
            } else {
                AppState.searchZaloResults = { customers: [], messages: [] };
            }
            renderZaloSearchResults();
        } catch (e) {
            console.error('Lỗi tìm kiếm Zalo:', e);
        }
    }, 200);
}

function highlightKeyword(text, keyword) {
    if (!text) return '';
    if (!keyword) return escapeHtml(text);
    const escapedText = escapeHtml(text);
    const escapedKw = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKw})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
}

function renderZaloSearchResults() {
    const container = document.getElementById('zaloSearchResultsContainer');
    if (!container) return;

    const input = document.getElementById('searchInput');
    const keyword = input ? input.value.trim() : '';
    const { customers, messages } = AppState.searchZaloResults || { customers: [], messages: [] };

    if (!keyword) {
        container.innerHTML = `
            <div style="text-align:center;padding:50px 16px;color:#94a3b8;font-size:13px;">
                <i class="fa-solid fa-magnifying-glass" style="font-size:26px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                Nhập tên khách hàng hoặc từ khóa tin nhắn để tìm kiếm
            </div>
        `;
        return;
    }

    const totalCust = customers.length;
    const totalMsg = messages.length;

    if (totalCust === 0 && totalMsg === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:50px 16px;color:#94a3b8;font-size:13px;">
                <i class="fa-regular fa-face-frown" style="font-size:28px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                Không tìm thấy kết quả nào khớp với "<strong>${escapeHtml(keyword)}</strong>"
            </div>
        `;
        return;
    }

    let html = '';

    // ================= SUB-TAB: TẤT CẢ =================
    if (AppState.searchSubTab === 'all') {
        // Khối 1: Khách hàng (Tối đa 5)
        if (totalCust > 0) {
            const displayCust = customers.slice(0, 5);
            html += `
                <div class="zalo-search-section-header">
                    <span>Khách hàng (${totalCust})</span>
                    ${totalCust > 5 ? `<a href="javascript:void(0)" class="zalo-search-more-link" onclick="switchSearchSubTab('customers')">Xem thêm (${totalCust}) &gt;</a>` : ''}
                </div>
                <div class="zalo-search-list">
                    ${displayCust.map(c => renderZaloCustomerCard(c, keyword)).join('')}
                </div>
            `;
        }

        // Khối 2: Tin nhắn (Tối đa 5)
        if (totalMsg > 0) {
            const displayMsg = messages.slice(0, 5);
            html += `
                <div class="zalo-search-section-header" style="${totalCust > 0 ? 'margin-top:10px;' : ''}">
                    <span>Tin nhắn (${totalMsg})</span>
                    ${totalMsg > 5 ? `<a href="javascript:void(0)" class="zalo-search-more-link" onclick="switchSearchSubTab('messages')">Xem thêm (${totalMsg}) &gt;</a>` : ''}
                </div>
                <div class="zalo-search-list">
                    ${displayMsg.map(m => renderZaloMessageCard(m, keyword)).join('')}
                </div>
            `;
        }
    } 
    // ================= SUB-TAB: KHÁCH HÀNG =================
    else if (AppState.searchSubTab === 'customers') {
        if (totalCust === 0) {
            html = `<div style="text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px;">Không tìm thấy khách hàng nào khớp</div>`;
        } else {
            html += `
                <div class="zalo-search-section-header">
                    <span>Tất cả khách hàng (${totalCust})</span>
                </div>
                <div class="zalo-search-list">
                    ${customers.map(c => renderZaloCustomerCard(c, keyword)).join('')}
                </div>
            `;
        }
    } 
    // ================= SUB-TAB: TIN NHẮN =================
    else if (AppState.searchSubTab === 'messages') {
        if (totalMsg === 0) {
            html = `<div style="text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px;">Không tìm thấy tin nhắn nào khớp</div>`;
        } else {
            html += `
                <div class="zalo-search-section-header">
                    <span>Tất cả tin nhắn (${totalMsg})</span>
                </div>
                <div class="zalo-search-list">
                    ${messages.map(m => renderZaloMessageCard(m, keyword)).join('')}
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

function renderZaloCustomerCard(c, keyword) {
    const channelCfg = CHANNEL_CONFIG[c.channel] || { icon: '<i class="fa-solid fa-comment"></i>' };
    const initial = (c.sender_name || 'K').charAt(0).toUpperCase();
    const isMine = (c.assigned_user_id == window.APP_CONFIG?.CURRENT_USER_ID);

    return `
        <div class="zalo-search-card" onclick="selectZaloSearchResult(${c.id}, ${isMine})">
            <div class="zalo-search-avatar">
                ${escapeHtml(initial)}
            </div>
            <div class="zalo-search-info">
                <div class="zalo-search-name-line">
                    <span class="zalo-search-name">${highlightKeyword(c.sender_name, keyword)}</span>
                    <span class="zalo-search-time">${c.short_time || ''}</span>
                </div>
                <div class="zalo-search-snippet">
                    ${c.customer_phone ? `SĐT: ${highlightKeyword(c.customer_phone, keyword)} • ` : ''}
                    Kênh: ${c.channel}
                </div>
                <div>
                    <span class="zalo-search-badge-staff ${isMine ? 'zalo-search-badge-mine' : ''}">
                        ${isMine ? '✓ Của tôi' : `Phụ trách: ${escapeHtml(c.assigned_fullname || 'Chưa gán')}`}
                    </span>
                </div>
            </div>
        </div>
    `;
}

function renderZaloMessageCard(m, keyword) {
    const initial = (m.sender_name || 'K').charAt(0).toUpperCase();
    const isMine = (m.assigned_user_id == window.APP_CONFIG?.CURRENT_USER_ID);

    return `
        <div class="zalo-search-card" onclick="selectZaloSearchResult(${m.conversation_id}, ${isMine}, ${m.id})">
            <div class="zalo-search-avatar" style="background:#F1F5F9;color:#475569;">
                ${escapeHtml(initial)}
            </div>
            <div class="zalo-search-info">
                <div class="zalo-search-name-line">
                    <span class="zalo-search-name">${escapeHtml(m.sender_name)}</span>
                    <span class="zalo-search-time">${m.time_formatted || ''}</span>
                </div>
                <div class="zalo-search-snippet">
                    ${highlightKeyword(m.content || '[Hình ảnh]', keyword)}
                </div>
                <div>
                    <span class="zalo-search-badge-staff ${isMine ? 'zalo-search-badge-mine' : ''}">
                        ${isMine ? '✓ Của tôi' : `Phụ trách: ${escapeHtml(m.assigned_fullname || 'Chưa gán')}`}
                    </span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Khi người dùng bấm vào một kết quả tìm kiếm Zalo
 */
function selectZaloSearchResult(convId, isMine, targetMsgId = null) {
    // 1. Thoát giao diện tìm kiếm
    exitSearchMode();

    // 2. Chuyển Tab phù hợp: Nếu là của tôi thì vào tab 'Của tôi', ngược lại vào 'Tất cả'
    if (isMine) {
        if (AppState.currentTab !== 'mine') {
            switchMainTab('mine');
        }
    } else {
        if (AppState.currentTab !== 'all') {
            switchMainTab('all');
        }
    }

    // 3. Mở hội thoại đó
    selectConversation(convId);

    // 4. Nếu có targetMsgId, sau khi tải xong cuộn tới tin nhắn đó và nháy sáng
    if (targetMsgId) {
        setTimeout(() => {
            const msgEl = document.getElementById(`msg-${targetMsgId}`);
            if (msgEl) {
                msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                msgEl.style.transition = 'background 0.3s ease';
                msgEl.style.background = '#FEF08A';
                setTimeout(() => {
                    msgEl.style.background = '';
                }, 2000);
            }
        }, 500);
    }
}

// ========================================================
// QUẢN LÝ NHÃN PHÂN LOẠI TÙY BIẾN (CUSTOM LABELS)
// ========================================================
let isOpenedFromManageModal = false;
let editingLabelId = null;

async function openManageLabelsModal() {
    document.getElementById('labelDropdownMenu')?.classList.remove('show');
    editingLabelId = null;
    renderManageLabelsList();
    const modal = document.getElementById('modalManageLabels');
    if (modal) modal.style.display = 'flex';

    // Luôn chủ động fetch danh sách nhãn mới nhất từ server để danh sách luôn cập nhật
    try {
        const res = await fetch('../../api/label_action.php?action=get_all');
        const data = await res.json();
        if (data && data.success && data.labels) {
            AppState.allLabels = data.labels;
            renderManageLabelsList();
            renderLabelsDropdown(data.labels);
            renderAssignedLabels(AppState.assignedLabels);
        }
    } catch (e) {}
}

function closeManageLabelsModal() {
    const modal = document.getElementById('modalManageLabels');
    if (modal) modal.style.display = 'none';
    editingLabelId = null;
}

function renderManageLabelsList() {
    const container = document.getElementById('labelManageListContainer');
    if (!container) return;

    const allLabels = AppState.allLabels || [];
    if (allLabels.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:30px 16px;color:#94a3b8;font-size:13px;">
                Chưa có nhãn phân loại nào trong hệ thống.
            </div>
        `;
        return;
    }

    let html = '';
    allLabels.forEach(l => {
        const isEditing = (editingLabelId === l.id);
        if (isEditing) {
            html += `
                <div class="label-manage-row is-editing" id="labelRow_${l.id}">
                    <div class="label-manage-left">
                        <input type="color" id="editLabelColor_${l.id}" value="${l.color || '#2563EB'}" class="color-picker-input-circle" style="width:30px;height:30px;" title="Bấm để chọn màu mới">
                        <input type="text" id="editLabelName_${l.id}" value="${escapeHtml(l.name)}" class="form-input" style="height:32px;font-size:13px;padding:4px 8px;flex:1;">
                    </div>
                    <div class="label-manage-actions">
                        <button type="button" class="btn-manage-action btn-manage-save" onclick="saveEditLabel(${l.id})">
                            <i class="fa-solid fa-check"></i> Lưu
                        </button>
                        <button type="button" class="btn-manage-action btn-manage-cancel" onclick="cancelEditLabel()">
                            <i class="fa-solid fa-xmark"></i> Hủy
                        </button>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="label-manage-row" id="labelRow_${l.id}">
                    <div class="label-manage-left">
                        <span class="label-color-dot" style="background:${l.color || '#64748B'};width:12px;height:12px;"></span>
                        <span class="label-manage-name" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</span>
                        ${l.usage_count !== undefined ? `<span class="label-manage-usage" title="Số hội thoại đang gắn">${l.usage_count} khách</span>` : ''}
                    </div>
                    <div class="label-manage-actions">
                        <button type="button" class="btn-manage-action btn-manage-edit" onclick="startEditLabel(${l.id})">
                            <i class="fa-solid fa-pen"></i> Sửa
                        </button>
                        <button type="button" class="btn-manage-action btn-manage-delete" onclick="deleteLabelItem(${l.id}, '${escapeHtml(l.name)}')">
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}

function startEditLabel(id) {
    editingLabelId = id;
    renderManageLabelsList();
    const input = document.getElementById(`editLabelName_${id}`);
    if (input) {
        input.focus();
        input.select();
    }
}

function cancelEditLabel() {
    editingLabelId = null;
    renderManageLabelsList();
}

async function requestLabelApi(payload) {
    // Ưu tiên 1: Gửi qua sync_polling.php dạng JSON (miễn nhiễm với WAF 403 của InfinityFree)
    try {
        const res = await fetch('../../api/sync_polling.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            if (data) return data;
        }
    } catch (e) {
        console.warn('Lỗi gửi nhãn qua sync_polling:', e);
    }

    // Ưu tiên 2: Gửi qua label_action.php dạng JSON
    try {
        const res = await fetch('../../api/label_action.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn('Lỗi gửi nhãn qua label_action:', e);
    }

    return null;
}

async function saveEditLabel(id) {
    const nameInput = document.getElementById(`editLabelName_${id}`);
    const colorInput = document.getElementById(`editLabelColor_${id}`);
    const name = nameInput ? nameInput.value.trim() : '';
    const color = colorInput ? colorInput.value : '#2563EB';

    if (!name) {
        alert('Tên nhãn không được để trống');
        if (nameInput) nameInput.focus();
        return;
    }

    // Kiểm tra trùng tên với nhãn khác (loại trừ chính nhãn này, không phân biệt hoa thường)
    const isDuplicate = (AppState.allLabels || []).some(
        l => l.id != id && (l.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
        alert(`Tên nhãn "${name}" đã được sử dụng bởi một nhãn khác. Vui lòng đặt tên khác.`);
        if (nameInput) {
            nameInput.classList.add('is-invalid');
            nameInput.focus();
            nameInput.select();
        }
        return;
    }

    try {
        const payload = {
            action: 'update_label',
            id: id,
            name: name,
            color: color
        };

        const data = await requestLabelApi(payload);

        if (data && data.success) {
            editingLabelId = null;
            const idx = (AppState.allLabels || []).findIndex(l => l.id == id);
            if (idx !== -1) {
                AppState.allLabels[idx].name = name;
                AppState.allLabels[idx].color = color;
            }
            renderManageLabelsList();
            renderLabelsDropdown(AppState.allLabels);
            renderAssignedLabels(AppState.assignedLabels);
            fetchConversations();
        } else {
            alert(data?.message || 'Lỗi cập nhật nhãn');
        }
    } catch (e) {
        console.error('Lỗi lưu nhãn:', e);
        alert('Lỗi kết nối khi cập nhật nhãn');
    }
}

async function deleteLabelItem(id, name) {
    if (!confirm(`Bạn có chắc chắn muốn xóa nhãn "${name}"? Nhãn sẽ được tự động gỡ khỏi tất cả hội thoại đang sử dụng.`)) {
        return;
    }

    try {
        const payload = {
            action: 'delete_label',
            id: id
        };

        const data = await requestLabelApi(payload);

        if (data && data.success) {
            AppState.allLabels = (AppState.allLabels || []).filter(l => l.id != id);
            AppState.assignedLabels = (AppState.assignedLabels || []).filter(l => l.id != id);
            renderManageLabelsList();
            renderLabelsDropdown(AppState.allLabels);
            renderAssignedLabels(AppState.assignedLabels);
            fetchConversations();
        } else {
            alert(data?.message || 'Lỗi xóa nhãn');
        }
    } catch (e) {
        console.error('Lỗi xóa nhãn:', e);
        alert('Lỗi kết nối khi xóa nhãn');
    }
}

function openCreateLabelFromManage() {
    isOpenedFromManageModal = true;
    closeManageLabelsModal();
    openCreateLabelModal();
}

function openCreateLabelModal() {
    document.getElementById('labelDropdownMenu')?.classList.remove('show');
    document.getElementById('modalCreateLabel').style.display = 'flex';
    const input = document.getElementById('newLabelName');
    if (input) {
        input.value = '';
        input.classList.remove('is-invalid');
        input.focus();
    }
    const err = document.getElementById('newLabelDuplicateError');
    if (err) err.style.display = 'none';
    selectLabelColor(null, '#2563EB');
}

function handleValidateNewLabelName(val) {
    const cleanVal = (val || '').trim().toLowerCase();
    const errorEl = document.getElementById('newLabelDuplicateError');
    const textEl = document.getElementById('newLabelDuplicateErrorText');
    const inputEl = document.getElementById('newLabelName');

    if (!cleanVal) {
        if (errorEl) errorEl.style.display = 'none';
        if (inputEl) inputEl.classList.remove('is-invalid');
        return false;
    }

    const isDuplicate = (AppState.allLabels || []).some(
        l => (l.name || '').trim().toLowerCase() === cleanVal
    );

    if (isDuplicate) {
        if (errorEl) {
            errorEl.style.display = 'flex';
            if (textEl) textEl.innerText = `Tên nhãn "${val.trim()}" đã tồn tại trong hệ thống!`;
        }
        if (inputEl) inputEl.classList.add('is-invalid');
        return true;
    } else {
        if (errorEl) errorEl.style.display = 'none';
        if (inputEl) inputEl.classList.remove('is-invalid');
        return false;
    }
}

function closeCreateLabelModal() {
    document.getElementById('modalCreateLabel').style.display = 'none';
    if (isOpenedFromManageModal) {
        isOpenedFromManageModal = false;
        openManageLabelsModal();
    }
}

function selectLabelColor(btn, color) {
    document.querySelectorAll('#modalCreateLabel .color-swatch').forEach(el => {
        el.classList.toggle('active', el.style.background === color || el.getAttribute('data-color') === color);
    });
    if (btn) btn.classList.add('active');

    const picker = document.getElementById('newLabelColorPicker');
    if (picker) picker.value = color;

    const hexDisplay = document.getElementById('colorHexDisplay');
    if (hexDisplay) hexDisplay.innerText = color.toUpperCase();

    document.getElementById('newLabelColor').value = color;
}

function syncColorFromPicker(color) {
    document.querySelectorAll('#modalCreateLabel .color-swatch').forEach(el => el.classList.remove('active'));
    const hexDisplay = document.getElementById('colorHexDisplay');
    if (hexDisplay) hexDisplay.innerText = color.toUpperCase();
    document.getElementById('newLabelColor').value = color;
}

async function saveNewLabel() {
    const name = document.getElementById('newLabelName').value.trim();
    const color = document.getElementById('newLabelColor').value;

    if (!name) {
        alert('Vui lòng nhập tên nhãn');
        document.getElementById('newLabelName').focus();
        return;
    }

    // Kiểm tra trùng tên ngay trên frontend (không phân biệt hoa thường)
    const isDuplicate = (AppState.allLabels || []).some(
        l => (l.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
        handleValidateNewLabelName(name);
        alert(`Tên nhãn "${name}" đã tồn tại trong hệ thống. Vui lòng đặt tên khác.`);
        const input = document.getElementById('newLabelName');
        if (input) {
            input.focus();
            input.select();
        }
        return;
    }

    try {
        const payload = {
            action: 'create_label',
            name: name,
            color: color,
            icon: 'fa-solid fa-tag'
        };

        const data = await requestLabelApi(payload);

        if (data && data.success) {
            // Nạp ngay danh sách nhãn mới vào AppState để modal danh sách hiển thị lập tức!
            if (data.all_labels) {
                AppState.allLabels = data.all_labels;
            } else if (data.label) {
                AppState.allLabels = AppState.allLabels || [];
                AppState.allLabels.push(data.label);
            }
            renderManageLabelsList();
            renderLabelsDropdown(AppState.allLabels);
            renderAssignedLabels(AppState.assignedLabels);

            closeCreateLabelModal();
            runSyncPolling();
        } else {
            alert(data?.message || 'Lỗi tạo nhãn');
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
        const payload = {
            action: 'toggle_label',
            conversation_id: AppState.activeConvId,
            label_id: labelId
        };

        const data = await requestLabelApi(payload);

        if (data && data.success) {
            AppState.assignedLabels = data.assigned_labels || [];
            renderAssignedLabels(AppState.assignedLabels);
            if (AppState.conversationsCache[AppState.activeConvId]) {
                AppState.conversationsCache[AppState.activeConvId].assigned_labels = AppState.assignedLabels;
            }
            runSyncPolling();
        } else {
            alert(data?.message || 'Lỗi thao tác nhãn');
        }
    } catch (err) {
        console.error('Lỗi gắn/hủy nhãn:', err);
    }
}

// ========================================================
// QUẢN LÝ MẪU TIN NHẮN (CANNED RESPONSES & DYNAMIC TEMPLATES - PHASE 3)
// ========================================================

let isOpenedFromManageTemplateModal = false;
let editingTemplateId = null;

function getGroupedSheetVariables() {
    if (AppState.sheetSheetsList && AppState.sheetSheetsList.length > 0) {
        return AppState.sheetSheetsList.map(s => ({
            name: s.name,
            columns: (s.columns && s.columns.length > 0) ? s.columns : (AppState.sheetColumns || [])
        }));
    }
    if (AppState.sheetColumns && AppState.sheetColumns.length > 0) {
        return [{
            name: 'Trang tính 1',
            columns: AppState.sheetColumns
        }];
    }
    return [{
        name: 'Trang tính 1',
        columns: ['id', 'sản phẩm', 'giá', 'số lượng']
    }];
}

function getSheetOfVariable(varName) {
    if (!varName) return null;
    const cleanVar = String(varName).replace(/^\[/, '').replace(/\]$/, '').trim().toLowerCase();
    const grouped = getGroupedSheetVariables();
    for (const s of grouped) {
        if (s.columns && s.columns.some(c => String(c).trim().toLowerCase() === cleanVar)) {
            return s.name;
        }
    }
    return null;
}

async function ensureSheetConfigLoaded() {
    if (AppState.sheetSheetsList && AppState.sheetSheetsList.length > 0) return;
    try {
        const res = await fetch('../../api/google_sheet_action.php?action=get_config');
        const data = await res.json();
        if (data && data.success && data.config) {
            AppState.sheetConfig = data.config;
            AppState.sheetSheetsList = data.config.sheets || [];
            if (data.config.columns && (!AppState.sheetColumns || AppState.sheetColumns.length === 0)) {
                AppState.sheetColumns = data.config.columns;
            }
        }
    } catch (e) {
        console.warn('Lỗi tải cấu hình sheets ngầm:', e);
    }
}

function getColumnsForSheet(sheetName) {
    if (sheetName && AppState.sheetSheetsList) {
        const found = AppState.sheetSheetsList.find(s => s.name === sheetName);
        if (found && Array.isArray(found.columns) && found.columns.length > 0) {
            return found.columns;
        }
    }
    return AppState.sheetColumns || ['id', 'sản phẩm', 'giá', 'số lượng'];
}

function handleEditTplSheetChange(id, sheetName) {
    // Không còn dùng dropdown sheet đơn lẻ
}

// Hỗ trợ hàm cũ để tương thích ngược
function openTemplateModal() {
    openManageTemplatesModal();
}

function closeTemplateModal() {
    closeManageTemplatesModal();
}

async function openManageTemplatesModal() {
    document.getElementById('labelDropdownMenu')?.classList.remove('show');
    editingTemplateId = null;
    const modal = document.getElementById('modalManageTemplates');
    if (modal) modal.style.display = 'flex';

    await ensureSheetConfigLoaded();
    await loadTemplatesList();
}

function closeManageTemplatesModal() {
    const modal = document.getElementById('modalManageTemplates');
    if (modal) modal.style.display = 'none';
    editingTemplateId = null;
}

async function requestTemplateApi(payload) {
    // Ưu tiên 1: Gửi qua sync_polling.php dạng JSON (miễn nhiễm với WAF 403 của InfinityFree)
    try {
        const res = await fetch('../../api/sync_polling.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            if (data) return data;
        }
    } catch (e) {
        console.warn('Lỗi gửi template qua sync_polling:', e);
    }

    // Ưu tiên 2: Gửi qua template_action.php dạng JSON
    try {
        const res = await fetch('../../api/template_action.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn('Lỗi gửi template qua template_action:', e);
    }

    return null;
}

async function loadTemplatesList() {
    const container = document.getElementById('templateManageListContainer');
    if (!container) return;

    try {
        let res = await fetch('../../api/sync_polling.php?action=get_templates');
        let data = null;
        if (res.ok) {
            try { data = await res.json(); } catch (e) {}
        }
        if (!data || !data.success) {
            res = await fetch('../../api/template_action.php?action=get_list');
            if (res.ok) {
                try { data = await res.json(); } catch (e) {}
            }
        }
        if (data && data.success && Array.isArray(data.templates)) {
            AppState.templates = data.templates;
            renderManageTemplatesList(AppState.templates);
        }
    } catch (e) {
        console.error('Lỗi tải danh sách template:', e);
    }
}

function getCurrentSheetBindingForEdit(id) {
    const shortcutInput = document.getElementById(`editTplShortcut_${id}`);
    const contentInput = document.getElementById(`editTplContent_${id}`);
    const allText = (shortcutInput?.value || '') + ' ' + (contentInput?.value || '');
    const matches = allText.match(/\[([^\]]+)\]/g) || [];

    for (const m of matches) {
        const sh = getSheetOfVariable(m);
        if (sh) return sh;
    }
    return null;
}

function renderManageTemplatesList(templates) {
    const container = document.getElementById('templateManageListContainer');
    if (!container) return;

    const list = templates || AppState.templates || [];
    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px 16px;color:#94A3B8;font-size:13px;">
                Chưa có mẫu tin nhắn nhanh nào. Bấm nút bên dưới để tạo mới!
            </div>
        `;
        return;
    }

    const groupedSheets = getGroupedSheetVariables();

    let html = '';
    list.forEach(t => {
        const isEditing = (editingTemplateId === t.id);
        if (isEditing) {
            const boundSheet = t.sheet_name || getCurrentSheetBindingForEdit(t.id);
            html += `
                <div class="template-manage-row is-editing" id="tplRow_${t.id}">
                    <div style="width:100%;display:flex;flex-direction:column;gap:8px;">
                        <div style="display:flex;gap:8px;">
                            <div style="flex:1;">
                                <label style="font-size:11px;font-weight:700;color:#475569;">Tiêu đề <span style="color:#EF4444;">*</span></label>
                                <input type="text" id="editTplTitle_${t.id}" value="${escapeHtml(t.title || '')}" class="form-input" style="height:32px;font-size:12.5px;padding:4px 8px;">
                            </div>
                            <div style="width:160px;">
                                <label style="font-size:11px;font-weight:700;color:#475569;">Viết tắt <span style="color:#EF4444;">*</span></label>
                                <input type="text" id="editTplShortcut_${t.id}" value="${escapeHtml(t.shortcut)}" class="form-input" style="height:32px;font-size:12.5px;padding:4px 8px;font-family:monospace;"
                                       oninput="handleValidateEditShortcut(this.value, ${t.id})">
                            </div>
                        </div>
                        <div id="editShortcutError_${t.id}" class="shortcut-invalid-text" style="display:none;">
                            <i class="fa-solid fa-triangle-exclamation"></i> <span>Viết tắt này đã được dùng!</span>
                        </div>
                        <div>
                            <label style="font-size:11px;font-weight:700;color:#475569;">Nội dung mẫu tin <span style="color:#EF4444;">*</span></label>
                            <textarea id="editTplContent_${t.id}" class="form-textarea" rows="3" style="font-size:12.5px;padding:6px 8px;">${escapeHtml(t.content)}</textarea>
                        </div>
                        <div style="margin-top:2px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                <span style="font-size:11px;font-weight:600;color:#64748B;">Chèn biến từ Google Sheet:</span>
                                ${boundSheet ? `<span style="font-size:11px;color:#4338CA;font-weight:700;"><i class="fa-solid fa-link"></i> Đang liên kết: ${escapeHtml(boundSheet)}</span>` : ''}
                            </div>
                            <div id="editTplVarChips_${t.id}" style="display:flex;flex-direction:column;gap:8px;">
                                ${groupedSheets.map(s => {
                                    const isCurrentBound = (!boundSheet || boundSheet.toLowerCase() === s.name.toLowerCase());
                                    const opStyle = isCurrentBound ? '' : 'opacity:0.35;filter:grayscale(80%);';
                                    return `
                                    <div style="${opStyle}">
                                        <div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                                            <i class="fa-solid fa-table" style="color:${isCurrentBound ? '#4F46E5' : '#94A3B8'};"></i>
                                            <span>${escapeHtml(s.name)}</span>
                                        </div>
                                        <div style="display:flex;flex-wrap:wrap;gap:5px;">
                                            ${(s.columns || []).map(col => `
                                                <button type="button" class="draggable-chip-var" style="cursor:pointer;padding:3px 8px;font-size:11px;" onclick="insertVarToEditModal(${t.id}, '[${escapeHtml(col)}]', '${escapeHtml(s.name)}')">
                                                    [${escapeHtml(col)}]
                                                </button>
                                            `).join('')}
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:6px;padding-top:6px;">
                            <button type="button" class="btn-manage-action btn-manage-save" onclick="saveEditTemplate(${t.id})">
                                <i class="fa-solid fa-check"></i> Lưu
                            </button>
                            <button type="button" class="btn-manage-action btn-manage-cancel" onclick="cancelEditTemplate()">
                                <i class="fa-solid fa-xmark"></i> Hủy
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="template-manage-row" id="tplRow_${t.id}">
                    <div class="template-manage-left">
                        <div class="template-meta-top">
                            <span class="template-shortcut-badge">${escapeHtml(t.shortcut)}</span>
                            <span class="template-title-text">${escapeHtml(t.title || 'Mẫu tin')}</span>
                            ${t.sheet_name ? `<span class="template-sheet-badge" title="Gắn với trang tính: ${escapeHtml(t.sheet_name)}"><i class="fa-solid fa-table"></i> ${escapeHtml(t.sheet_name)}</span>` : ''}
                        </div>
                        <div class="template-content-snippet" title="${escapeHtml(t.content)}">${escapeHtml(t.content)}</div>
                    </div>
                    <div class="template-manage-actions">
                        <button type="button" class="btn-manage-action btn-manage-edit" onclick="startEditTemplate(${t.id})">
                            <i class="fa-solid fa-pen"></i> Sửa
                        </button>
                        <button type="button" class="btn-manage-action btn-manage-delete" onclick="deleteTemplateItem(${t.id}, '${escapeHtml(t.title || t.shortcut)}')">
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}

function handleSearchManageTemplates(keyword) {
    const kw = (keyword || '').toLowerCase().trim();
    if (!kw) {
        renderManageTemplatesList(AppState.templates);
        return;
    }
    const filtered = (AppState.templates || []).filter(t => {
        return (t.shortcut && t.shortcut.toLowerCase().includes(kw)) ||
               (t.title && t.title.toLowerCase().includes(kw)) ||
               (t.content && t.content.toLowerCase().includes(kw));
    });
    renderManageTemplatesList(filtered);
}

function startEditTemplate(id) {
    editingTemplateId = id;
    renderManageTemplatesList();
    const input = document.getElementById(`editTplTitle_${id}`);
    if (input) {
        input.focus();
        input.select();
    }
}

function cancelEditTemplate() {
    editingTemplateId = null;
    renderManageTemplatesList();
}

function insertVarToEditModal(id, varName, sheetName) {
    const boundSheet = getCurrentSheetBindingForEdit(id);
    if (boundSheet && sheetName && boundSheet.toLowerCase() !== sheetName.toLowerCase()) {
        alert(`Một mẫu tin chỉ được dùng các biến trong cùng một trang tính Google Sheet ("${boundSheet}")!\nKhông thể chèn thêm biến từ trang tính "${sheetName}".`);
        return;
    }

    const textarea = document.getElementById(`editTplContent_${id}`);
    if (textarea) {
        insertTextAtCursor(textarea, ' ' + varName + ' ');
        textarea.focus();
    }
    renderManageTemplatesList();
}

function handleValidateEditShortcut(val, id) {
    const clean = (val || '').trim();
    const isDup = clean ? (AppState.templates || []).some(t => t.id !== id && (t.shortcut || '').trim().toLowerCase() === clean.toLowerCase()) : false;
    const errEl = document.getElementById(`editShortcutError_${id}`);
    const inputEl = document.getElementById(`editTplShortcut_${id}`);

    if (errEl && inputEl) {
        if (isDup) {
            errEl.style.display = 'flex';
            inputEl.classList.add('is-invalid');
        } else {
            errEl.style.display = 'none';
            inputEl.classList.remove('is-invalid');
        }
    }
}

async function saveEditTemplate(id) {
    const titleInput = document.getElementById(`editTplTitle_${id}`);
    const shortcutInput = document.getElementById(`editTplShortcut_${id}`);
    const contentInput = document.getElementById(`editTplContent_${id}`);

    const title = titleInput ? titleInput.value.trim() : '';
    let shortcut = shortcutInput ? shortcutInput.value.trim() : '';
    const content = contentInput ? contentInput.value.trim() : '';

    if (!title) {
        alert('Tiêu đề không được để trống!');
        titleInput?.focus();
        return;
    }
    if (!shortcut) {
        alert('Viết tắt không được để trống!');
        shortcutInput?.focus();
        return;
    }
    if (!content) {
        alert('Nội dung mẫu tin không được để trống!');
        contentInput?.focus();
        return;
    }

    const cleanTitle = title.toLowerCase();
    const cleanShortcut = '/' + shortcut.replace(/^\/+/, '').toLowerCase();
    const cleanContent = content.toLowerCase();

    // 1. Kiểm tra trùng viết tắt
    const dupShortcut = (AppState.templates || []).find(t => t.id !== id && (t.shortcut || '').replace(/^\/+/, '').trim().toLowerCase() === cleanShortcut.replace(/^\/+/, ''));
    if (dupShortcut) {
        alert(`Viết tắt "${shortcut}" đã được sử dụng bởi mẫu tin khác (Mẫu: "${dupShortcut.title || dupShortcut.shortcut}"). Vui lòng chọn viết tắt khác!`);
        shortcutInput?.focus();
        return;
    }

    // 2. Kiểm tra trùng tiêu đề
    const dupTitle = (AppState.templates || []).find(t => t.id !== id && (t.title || '').trim().toLowerCase() === cleanTitle);
    if (dupTitle) {
        alert(`Tiêu đề "${title}" đã được sử dụng bởi mẫu tin khác. Vui lòng chọn tiêu đề khác!`);
        titleInput?.focus();
        return;
    }

    // 3. Kiểm tra trùng nội dung
    const dupContent = (AppState.templates || []).find(t => t.id !== id && (t.content || '').trim().toLowerCase() === cleanContent);
    if (dupContent) {
        alert(`Nội dung mẫu tin này trùng lặp với mẫu tin "${dupContent.title || dupContent.shortcut}". Mỗi mẫu tin phải có nội dung riêng biệt!`);
        contentInput?.focus();
        return;
    }

    // Xác định đúng trang tính liên kết
    const sheetName = getCurrentSheetBindingForEdit(id) || '';

    try {
        const payload = {
            action: 'tpl_update',
            id: id,
            title: title,
            shortcut: shortcut,
            content: content,
            sheet_name: sheetName
        };

        const data = await requestTemplateApi(payload);

        if (data && data.success) {
            editingTemplateId = null;
            AppState.templates = data.templates || AppState.templates;
            renderManageTemplatesList();
            showToast('Cập nhật mẫu tin nhắn thành công!', 'success');
        } else {
            alert(data?.message || 'Lỗi cập nhật mẫu tin');
        }
    } catch (e) {
        console.error('Lỗi lưu template:', e);
        alert('Lỗi kết nối khi cập nhật mẫu tin nhắn');
    }
}

async function deleteTemplateItem(id, title) {
    if (!confirm(`Bạn có chắc chắn muốn xóa mẫu tin "${title}"?`)) {
        return;
    }

    try {
        const payload = {
            action: 'tpl_delete',
            id: id
        };

        const data = await requestTemplateApi(payload);

        if (data && data.success) {
            AppState.templates = data.templates || (AppState.templates || []).filter(t => t.id !== id);
            renderManageTemplatesList();
            showToast('Đã xóa mẫu tin nhắn!', 'info');
        } else {
            alert(data?.message || 'Lỗi xóa mẫu tin');
        }
    } catch (e) {
        console.error('Lỗi xóa template:', e);
        alert('Lỗi kết nối khi xóa mẫu tin');
    }
}

// --------------------------------------------------------
// MODAL TẠO MẪU TIN NHẮN MỚI
// --------------------------------------------------------

let currentCreateTplSheet = null;

function getSheetsContainingVariable(varName) {
    if (!varName) return [];
    const cleanVar = String(varName).replace(/^\[/, '').replace(/\]$/, '').trim().toLowerCase();
    const grouped = getGroupedSheetVariables();
    const foundSheets = [];
    for (const s of grouped) {
        if (s.columns && s.columns.some(c => String(c).trim().toLowerCase() === cleanVar)) {
            foundSheets.push(s.name);
        }
    }
    return foundSheets;
}

function promptChooseSheetForVariable(varName, candidates, onSelected) {
    const modal = document.getElementById('modalChooseSheetForVar');
    const titleEl = document.getElementById('modalChooseSheetTitle');
    const descEl = document.getElementById('modalChooseSheetDesc');
    const listEl = document.getElementById('modalChooseSheetButtonsList');

    if (!modal || !listEl) {
        const choice = prompt(`Biến [${varName}] có trong nhiều bảng tính:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\nNhập số thứ tự bảng bạn muốn chọn:`);
        const idx = parseInt(choice) - 1;
        if (candidates[idx]) onSelected(candidates[idx]);
        return;
    }

    if (titleEl) titleEl.innerText = `Chọn bảng tính cho biến [${varName}]`;
    if (descEl) descEl.innerHTML = `Biến <strong>[${escapeHtml(varName)}]</strong> tồn tại ở nhiều trang tính. Vui lòng chọn trang tính bạn muốn liên kết:`;

    let html = '';
    candidates.forEach(shName => {
        html += `
            <button type="button" class="tab-btn" 
                    style="width:100%;text-align:left;padding:10px 14px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;background:#F8FAFC;cursor:pointer;"
                    onclick="handleSelectedSheetCandidate('${escapeHtml(shName)}')">
                <i class="fa-solid fa-table" style="color:#4F46E5;"></i>
                <span>${escapeHtml(shName)}</span>
            </button>
        `;
    });
    listEl.innerHTML = html;
    modal.style.display = 'flex';

    window.__ON_SHEET_CANDIDATE_SELECTED__ = (chosen) => {
        modal.style.display = 'none';
        onSelected(chosen);
    };
}

function handleSelectedSheetCandidate(shName) {
    if (typeof window.__ON_SHEET_CANDIDATE_SELECTED__ === 'function') {
        window.__ON_SHEET_CANDIDATE_SELECTED__(shName);
    }
}

function closeChooseSheetModal() {
    const modal = document.getElementById('modalChooseSheetForVar');
    if (modal) modal.style.display = 'none';
}

function handleCreateTemplateInputChange() {
    const shortcut = document.getElementById('newTplShortcut')?.value || '';
    const content = document.getElementById('newTplContent')?.value || '';
    const allText = shortcut + ' ' + content;
    
    // Tìm tất cả các biến chuẩn cấu trúc [tên_biến]
    const matches = allText.match(/\[([^\]]+)\]/g) || [];

    // Nếu không còn bất kỳ biến hợp lệ nào dạng [...] (do xóa hết hoặc xóa làm mất cấu trúc như [STT thiếu dấu đóng)
    if (matches.length === 0) {
        if (currentCreateTplSheet !== null) {
            currentCreateTplSheet = null; // TỰ ĐỘNG MỞ KHÓA!
            renderCreateTemplateVarChips();
        }
        return;
    }

    // Nếu đã khóa một bảng tính: kiểm tra xem các biến hiện tại có thuộc bảng đó không
    if (currentCreateTplSheet) {
        const grouped = getGroupedSheetVariables();
        const activeSheetObj = grouped.find(s => s.name.toLowerCase() === currentCreateTplSheet.toLowerCase());
        const activeCols = (activeSheetObj?.columns || []).map(c => String(c).trim().toLowerCase());
        
        const validVarsInActiveSheet = matches.filter(m => activeCols.includes(m.replace(/^\[/, '').replace(/\]$/, '').trim().toLowerCase()));
        if (validVarsInActiveSheet.length === 0) {
            currentCreateTplSheet = null; // Mở khóa nếu không còn biến nào của bảng này
        }
    }

    // Nếu đang chưa khóa bảng tính: xét biến đầu tiên
    if (!currentCreateTplSheet && matches.length > 0) {
        const firstVar = matches[0].replace(/^\[/, '').replace(/\]$/, '').trim();
        const candidates = getSheetsContainingVariable(firstVar);

        if (candidates.length === 1) {
            currentCreateTplSheet = candidates[0];
            renderCreateTemplateVarChips();
        } else if (candidates.length > 1) {
            // Biến có ở nhiều bảng tính -> Bật hỏi người dùng!
            promptChooseSheetForVariable(firstVar, candidates, (chosen) => {
                currentCreateTplSheet = chosen;
                renderCreateTemplateVarChips();
            });
        }
    }
}

function getCurrentSheetBindingForCreate() {
    return currentCreateTplSheet;
}

function clearCreateSheetBinding() {
    currentCreateTplSheet = null;
    renderCreateTemplateVarChips();
}

async function openCreateTemplateFromManage() {
    isOpenedFromManageTemplateModal = true;
    closeManageTemplatesModal();

    const modal = document.getElementById('modalCreateTemplate');
    if (modal) modal.style.display = 'flex';

    // Xóa trắng form
    const titleEl = document.getElementById('newTplTitle');
    const shortcutEl = document.getElementById('newTplShortcut');
    const contentEl = document.getElementById('newTplContent');
    const errMsg = document.getElementById('newShortcutInvalidMsg');

    if (titleEl) titleEl.value = '';
    if (shortcutEl) {
        shortcutEl.value = '';
        shortcutEl.classList.remove('is-invalid');
    }
    if (contentEl) contentEl.value = '';
    if (errMsg) errMsg.style.display = 'none';

    currentCreateTplSheet = null;
    await ensureSheetConfigLoaded();
    renderCreateTemplateVarChips();
    if (titleEl) titleEl.focus();
}

function closeCreateTemplateModal() {
    const modal = document.getElementById('modalCreateTemplate');
    if (modal) modal.style.display = 'none';

    if (isOpenedFromManageTemplateModal) {
        isOpenedFromManageTemplateModal = false;
        openManageTemplatesModal();
    }
}

function handleSelectCreateTplSheet(sheetName) {
    renderCreateTemplateVarChips();
}

function renderCreateTemplateVarChips() {
    const container = document.getElementById('tplCreateVarChipsContainer');
    if (!container) return;

    const boundSheet = currentCreateTplSheet;
    const grouped = getGroupedSheetVariables();

    let html = '';
    if (boundSheet) {
        html += `
            <div style="background:#EEF2FF;border:1px solid #C7D2FE;color:#3730A3;padding:6px 12px;border-radius:6px;font-size:12px;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <div><i class="fa-solid fa-link"></i> Đang liên kết: <strong>${escapeHtml(boundSheet)}</strong> (1 mẫu chỉ dùng biến của 1 trang tính)</div>
                <button type="button" onclick="clearCreateSheetBinding()" style="background:none;border:none;color:#4F46E5;font-weight:700;font-size:11px;cursor:pointer;">Đổi trang tính</button>
            </div>
        `;
    }

    grouped.forEach(s => {
        if (!s.columns || s.columns.length === 0) return;
        const isCurrentBound = (!boundSheet || boundSheet.toLowerCase() === s.name.toLowerCase());
        const opacityStyle = isCurrentBound ? '' : 'opacity:0.35;filter:grayscale(80%);';

        html += `
            <div style="margin-bottom:8px;width:100%;${opacityStyle}">
                <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-table" style="color:${isCurrentBound ? '#4F46E5' : '#94A3B8'};"></i>
                    <span>${escapeHtml(s.name)}</span>
                    ${boundSheet && boundSheet.toLowerCase() === s.name.toLowerCase() ? '<span style="font-size:10px;background:#C7D2FE;color:#3730A3;padding:1px 6px;border-radius:3px;font-weight:600;">Đang chọn</span>' : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${s.columns.map(col => `
                        <div class="draggable-chip-var" 
                             draggable="${isCurrentBound}" 
                             ondragstart="handleVarDragStart(event, '[${escapeHtml(col)}]', '${escapeHtml(s.name)}')"
                             onclick="insertVarToCreateModal('[${escapeHtml(col)}]', '${escapeHtml(s.name)}')"
                             title="${isCurrentBound ? 'Bấm để chèn hoặc Kéo thả vào ô nội dung/viết tắt' : 'Không thể chọn (Khác trang tính đã liên kết)'}">
                            [${escapeHtml(col)}]
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html || '<div style="font-size:12px;color:#94A3B8;">Chưa có dữ liệu biến từ Google Sheet</div>';
}

// --------------------------------------------------------
// KÉO THẢ BIẾN ĐỘNG (HTML5 DRAG & DROP API)
// --------------------------------------------------------

function handleVarDragStart(event, varName, sheetName) {
    if (currentCreateTplSheet && sheetName && currentCreateTplSheet.toLowerCase() !== sheetName.toLowerCase()) {
        event.preventDefault();
        alert(`Một mẫu tin chỉ được dùng các biến trong cùng một trang tính Google Sheet ("${currentCreateTplSheet}")!\nKhông thể kéo biến từ trang tính "${sheetName}".`);
        return;
    }
    event.dataTransfer.setData('text/plain', varName);
    event.dataTransfer.setData('sheet-name', sheetName || '');
    event.dataTransfer.effectAllowed = 'copy';
}

function handleVarDragOver(event, targetElement) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (targetElement) {
        targetElement.classList.add('input-drag-over');
    }
}

function handleVarDragLeave(targetElement) {
    if (targetElement) {
        targetElement.classList.remove('input-drag-over');
    }
}

function handleVarDrop(event, targetId) {
    event.preventDefault();
    const el = document.getElementById(targetId);
    if (!el) return;
    el.classList.remove('input-drag-over');

    const varName = event.dataTransfer.getData('text/plain');
    const sheetName = event.dataTransfer.getData('sheet-name');
    if (!varName) return;

    if (currentCreateTplSheet && sheetName && currentCreateTplSheet.toLowerCase() !== sheetName.toLowerCase()) {
        alert(`Một mẫu tin chỉ được dùng các biến trong cùng một trang tính Google Sheet ("${currentCreateTplSheet}")!\nKhông thể chèn biến từ trang tính "${sheetName}".`);
        return;
    }

    insertTextAtCursor(el, ' ' + varName + ' ');
    el.focus();

    if (sheetName) {
        currentCreateTplSheet = sheetName;
    }
    renderCreateTemplateVarChips();

    if (targetId === 'newTplShortcut') {
        handleValidateNewShortcut(el.value);
    }
}

function insertVarToCreateModal(varName, sheetName) {
    if (currentCreateTplSheet && sheetName && currentCreateTplSheet.toLowerCase() !== sheetName.toLowerCase()) {
        alert(`Một mẫu tin chỉ được dùng các biến trong cùng một trang tính Google Sheet ("${currentCreateTplSheet}")!\nKhông thể chèn thêm biến từ trang tính "${sheetName}".`);
        return;
    }

    const contentEl = document.getElementById('newTplContent');
    if (contentEl) {
        insertTextAtCursor(contentEl, ' ' + varName + ' ');
        contentEl.focus();
    }
    currentCreateTplSheet = sheetName || currentCreateTplSheet;
    renderCreateTemplateVarChips();
}

function insertTextAtCursor(inputEl, text) {
    const start = inputEl.selectionStart || inputEl.value.length;
    const end = inputEl.selectionEnd || inputEl.value.length;
    const val = inputEl.value;

    inputEl.value = val.substring(0, start) + text + val.substring(end);
    const newPos = start + text.length;
    inputEl.selectionStart = newPos;
    inputEl.selectionEnd = newPos;
}

function handleValidateNewShortcut(val) {
    if (!val) {
        toggleShortcutError(false);
        return;
    }
    const clean = val.trim();
    const isDup = (AppState.templates || []).some(t => (t.shortcut || '').trim().toLowerCase() === clean.toLowerCase());
    toggleShortcutError(isDup);
}

function toggleShortcutError(isError) {
    const errBox = document.getElementById('newShortcutInvalidMsg');
    const inputEl = document.getElementById('newTplShortcut');
    const btnSubmit = document.getElementById('btnSubmitNewTemplate');

    if (errBox) errBox.style.display = isError ? 'flex' : 'none';
    if (inputEl) inputEl.classList.toggle('is-invalid', isError);
    if (btnSubmit) btnSubmit.disabled = isError;
}

async function saveNewTemplateRecord() {
    const titleEl = document.getElementById('newTplTitle');
    const shortcutEl = document.getElementById('newTplShortcut');
    const contentEl = document.getElementById('newTplContent');

    const title = titleEl ? titleEl.value.trim() : '';
    let shortcut = shortcutEl ? shortcutEl.value.trim() : '';
    const content = contentEl ? contentEl.value.trim() : '';

    if (!title) {
        alert('Vui lòng nhập Tiêu đề gợi nhớ!');
        titleEl?.focus();
        return;
    }
    if (!shortcut) {
        alert('Vui lòng nhập Viết tắt!');
        shortcutEl?.focus();
        return;
    }
    if (!content) {
        alert('Vui lòng nhập Nội dung mẫu tin!');
        contentEl?.focus();
        return;
    }

    const cleanTitle = title.toLowerCase();
    const cleanShortcut = '/' + shortcut.replace(/^\/+/, '').toLowerCase();
    const cleanContent = content.toLowerCase();

    // 1. Kiểm tra trùng viết tắt
    const dupShortcut = (AppState.templates || []).find(t => (t.shortcut || '').replace(/^\/+/, '').trim().toLowerCase() === cleanShortcut.replace(/^\/+/, ''));
    if (dupShortcut) {
        alert(`Viết tắt "${shortcut}" đã tồn tại trong hệ thống (Mẫu: "${dupShortcut.title || dupShortcut.shortcut}"). Vui lòng chọn viết tắt khác!`);
        shortcutEl?.focus();
        return;
    }

    // 2. Kiểm tra trùng tiêu đề
    const dupTitle = (AppState.templates || []).find(t => (t.title || '').trim().toLowerCase() === cleanTitle);
    if (dupTitle) {
        alert(`Tiêu đề "${title}" đã được sử dụng bởi mẫu tin khác. Vui lòng chọn tiêu đề khác!`);
        titleEl?.focus();
        return;
    }

    // 3. Kiểm tra trùng nội dung
    const dupContent = (AppState.templates || []).find(t => (t.content || '').trim().toLowerCase() === cleanContent);
    if (dupContent) {
        alert(`Nội dung mẫu tin này trùng lặp với mẫu tin "${dupContent.title || dupContent.shortcut}". Mỗi mẫu tin phải có nội dung riêng biệt!`);
        contentEl?.focus();
        return;
    }

    // Xác định đúng sheetName được dùng
    const sheetName = getCurrentSheetBindingForCreate() || '';

    try {
        const payload = {
            action: 'tpl_save',
            title: title,
            shortcut: shortcut,
            content: content,
            sheet_name: sheetName
        };

        const data = await requestTemplateApi(payload);

        if (data && data.success) {
            showToast('Tạo mẫu tin nhắn thành công!', 'success');
            AppState.templates = data.templates || AppState.templates;
            closeCreateTemplateModal();
        } else {
            alert(data?.message || 'Lỗi tạo mẫu tin');
        }
    } catch (e) {
        console.error('Lỗi tạo template:', e);
        alert('Lỗi kết nối khi tạo mẫu tin nhắn');
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
                <img id="lightboxMainImg" class="lightbox-main-img" src="" alt="Ảnh phóng to" referrerpolicy="no-referrer">
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
    const currentUrl = toDisplayImageUrl(urls[currentIndex]);

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
            <img src="${escapeHtml(toDisplayImageUrl(u))}" alt="Thumb ${idx + 1}" referrerpolicy="no-referrer">
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

// ========================================================
// GOOGLE SHEETS INTEGRATION & DATA VIEWER (PHASE 2)
// ========================================================

const DEFAULT_APPS_SCRIPT_CODE = `/**
 * OMNICHANNEL DATA GATEWAY - GOOGLE APPS SCRIPT (MULTI-SHEET SUPPORT)
 * Tự động quét toàn bộ các trang tính (Sheets), bóc tách Headers, Dữ liệu dòng & Hình ảnh trong ô tính
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var allSheets = ss.getSheets();
    
    if (!allSheets || allSheets.length === 0) {
      return responseJson({ success: false, message: "Không tìm thấy trang tính nào trong file" });
    }
    
    var sheetsData = [];
    var combinedDataForChecksum = "";
    
    for (var s = 0; s < allSheets.length; s++) {
      var sheet = allSheets[s];
      var sheetName = sheet.getName();
      var range = sheet.getDataRange();
      var values = range.getValues();
      var formulas = range.getFormulas();
      
      if (!values || values.length === 0 || values[0].length === 0) {
        continue;
      }
      
      // Header ở dòng đầu tiên của từng sheet
      var rawHeaders = values[0];
      var headers = [];
      for (var h = 0; h < rawHeaders.length; h++) {
        var colName = String(rawHeaders[h]).trim();
        if (colName !== "") headers.push(colName);
      }
      
      if (headers.length === 0) continue;
      
      // Quét từng dòng dữ liệu của sheet
      var rows = [];
      for (var i = 1; i < values.length; i++) {
        var rowObj = {};
        var isEmptyRow = true;
        for (var j = 0; j < headers.length; j++) {
          var cellVal = values[i][j];
          var formula = formulas[i] ? formulas[i][j] : "";
          
          var extractedVal = extractImageUrl(cellVal, formula);
          if (extractedVal !== undefined && extractedVal !== null && String(extractedVal).trim() !== "") {
            isEmptyRow = false;
          }
          rowObj[headers[j]] = extractedVal;
        }
        if (!isEmptyRow) {
          rows.push(rowObj);
        }
      }
      
      var sheetChecksum = Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(rows))
      );
      
      combinedDataForChecksum += sheetName + ":" + sheetChecksum + "|";
      
      sheetsData.push({
        sheet_name: sheetName,
        headers: headers,
        total_rows: rows.length,
        checksum: sheetChecksum,
        data: rows
      });
    }
    
    var overallChecksum = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, combinedDataForChecksum)
    );
    
    var primarySheet = sheetsData[0] || { sheet_name: "Sheet1", headers: [], total_rows: 0, data: [] };
    
    return responseJson({
      success: true,
      total_sheets: sheetsData.length,
      sheets: sheetsData,
      sheet_name: primarySheet.sheet_name,
      headers: primarySheet.headers,
      total_rows: primarySheet.total_rows,
      data: primarySheet.data,
      checksum: overallChecksum,
      updated_at: new Date().toISOString()
    });
    
  } catch (err) {
    return responseJson({ success: false, message: err.toString() });
  }
}

function extractImageUrl(cell, formula) {
  if (formula && formula.toUpperCase().indexOf("=IMAGE") === 0) {
    var match = formula.match(/=IMAGE\\s*\\(\\s*["']([^"']+)["']/i);
    if (match && match[1]) return match[1];
  }
  if (cell !== null && cell !== undefined) {
    if (typeof cell === "object" || String(cell) === "CellImage") {
      try {
        if (typeof cell.getContentUrl === "function") {
          var u = cell.getContentUrl();
          if (u) return u;
        }
      } catch(e) {}
      try {
        if (typeof cell.getUrl === "function") {
          var u2 = cell.getUrl();
          if (u2) return u2;
        }
      } catch(e) {}
    }
    var str = String(cell).trim();
    if (str.indexOf("drive.google.com") !== -1) {
      var m = str.match(/\\/d\\/([a-zA-Z0-9_-]+)/) || str.match(/id=([a-zA-Z0-9_-]+)/);
      if (m && m[1]) return "https://drive.google.com/uc?export=view&id=" + m[1];
    }
    return str;
  }
  return "";
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

let currentGSheetTab = 'config';
let isSyncingGSheet = false;

async function initGoogleSheets() {
    await loadGoogleSheetStatus(false);
    loadGoogleSheetData(false);

    // Kiểm tra định kỳ mỗi 3 phút xem Google Sheet có thay đổi dữ liệu hay không
    setInterval(() => {
        loadGoogleSheetStatus(true);
    }, 180000);
}

function openGoogleSheetModal() {
    const modal = document.getElementById('modalGoogleSheet');
    if (!modal) return;
    modal.style.display = 'flex';

    // Mặc định: Nếu là nhân viên, ưu tiên mở tab Bảng dữ liệu; Nếu là Admin chưa có config thì mở tab Cấu hình
    const isAdmin = (window.APP_CONFIG?.CURRENT_USERNAME?.toLowerCase() === 'admin');
    if (!isAdmin && AppState.sheetColumns?.length > 0) {
        switchGSheetTab('data');
    } else if (isAdmin && (!AppState.sheetConfig || !AppState.sheetConfig.script_url)) {
        switchGSheetTab('config');
    } else {
        switchGSheetTab(currentGSheetTab || 'data');
    }

    loadGoogleSheetStatus(true);
}

function closeGoogleSheetModal() {
    const modal = document.getElementById('modalGoogleSheet');
    if (modal) modal.style.display = 'none';
}

function switchGSheetTab(tab) {
    currentGSheetTab = tab;
    const btnConfig = document.getElementById('btnTabGSheetConfig');
    const btnData = document.getElementById('btnTabGSheetData');
    const paneConfig = document.getElementById('paneGSheetConfig');
    const paneData = document.getElementById('paneGSheetData');
    const footerConfig = document.getElementById('footerConfigButtons');
    const footerData = document.getElementById('footerDataButtons');

    if (tab === 'config') {
        btnConfig?.classList.add('active');
        btnData?.classList.remove('active');
        if (paneConfig) paneConfig.style.display = 'block';
        if (paneData) paneData.style.display = 'none';
        if (footerConfig) footerConfig.style.display = 'flex';
        if (footerData) footerData.style.display = 'none';
    } else {
        btnConfig?.classList.remove('active');
        btnData?.classList.add('active');
        if (paneConfig) paneConfig.style.display = 'none';
        if (paneData) paneData.style.display = 'block';
        if (footerConfig) footerConfig.style.display = 'none';
        if (footerData) footerData.style.display = 'flex';
        // Tự động làm mới dữ liệu bảng tính ngay khi chuyển sang tab
        loadGoogleSheetData(true);
    }
}

async function loadGoogleSheetStatus(checkRemote = false) {
    try {
        const url = `../../api/google_sheet_action.php?action=get_status&check_remote=${checkRemote ? '1' : '0'}`;
        const res = await fetch(url);
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (pe) {
            const sIdx = text.indexOf('{');
            const eIdx = text.lastIndexOf('}');
            if (sIdx !== -1 && eIdx !== -1) {
                try { data = JSON.parse(text.substring(sIdx, eIdx + 1)); } catch (e2) {}
            }
        }

        if (data && data.success) {
            AppState.sheetConfig = data.config;
            AppState.sheetColumns = data.config?.columns || [];
            AppState.sheetSheetsList = data.config?.sheets || [];
            AppState.sheetHasChanges = data.has_changes || false;

            // Cập nhật ô nhập trong Tab Cấu hình
            if (data.config) {
                const urlInp = document.getElementById('gsheetUrlInput');
                const scriptInp = document.getElementById('gsheetScriptUrlInput');
                if (urlInp && !urlInp.matches(':focus')) urlInp.value = data.config.sheet_url || '';
                if (scriptInp && !scriptInp.matches(':focus')) scriptInp.value = data.config.script_url || '';

                // Cập nhật trạng thái
                const statusBox = document.getElementById('gsheetStatusBox');
                if (statusBox) statusBox.style.display = 'block';

                const lastSyncEl = document.getElementById('gsheetLastSyncTime');
                if (lastSyncEl) lastSyncEl.innerText = data.config.last_synced_at || 'Chưa đồng bộ';

                const totalRowsEl = document.getElementById('gsheetTotalRowsCount');
                if (totalRowsEl) totalRowsEl.innerText = data.total_rows || 0;

                const colsCountEl = document.getElementById('gsheetColsCount');
                if (colsCountEl) colsCountEl.innerText = (data.config.columns || []).length;

                renderDetectedColsChips(data.config.sheets || [], data.config.columns || []);
            }

            // Cập nhật badge số lượng dòng trên tab
            const badgeCount = document.getElementById('sheetDataCountBadge');
            if (badgeCount) badgeCount.innerText = data.total_rows || 0;

            toggleSheetChangeAlert(data.has_changes);
        }
    } catch (e) {
        console.warn('Lỗi kiểm tra Google Sheet status:', e);
    }
}

function renderDetectedColsChips(sheets, fallbackColumns) {
    const container = document.getElementById('gsheetDetectedColsList');
    if (!container) return;

    if ((!sheets || sheets.length === 0) && (!fallbackColumns || fallbackColumns.length === 0)) {
        container.innerHTML = '<span style="font-size:12px;color:#94A3B8;">Chưa nhận diện được cột nào</span>';
        return;
    }

    // Phân nhóm rõ ràng theo từng bảng tính
    if (sheets && sheets.length > 0) {
        container.innerHTML = sheets.map(s => {
            const cols = s.columns || [];
            return `
                <div class="sheet-vars-card" style="margin-bottom:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 14px;">
                    <div style="display:flex;align-items:center;margin-bottom:8px;">
                        <span style="font-weight:700;font-size:13px;color:#0F172A;display:flex;align-items:center;gap:6px;">
                            <i class="fa-solid fa-table" style="color:#10B981;"></i>
                            Bảng tính: <strong style="color:#0284C7;">${escapeHtml(s.name)}</strong>
                        </span>
                    </div>
                    <div class="status-cols-chips" style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${cols.map(col => `
                            <span class="col-pill-chip" title="Biến: [${escapeHtml(col)}]">
                                [${escapeHtml(col)}]
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    container.innerHTML = (fallbackColumns || []).map(col => `
        <span class="col-pill-chip" title="Biến: [${escapeHtml(col)}]">
            [${escapeHtml(col)}]
        </span>
    `).join('');
}

function isImageColumnName(colName) {
    if (!colName) return false;
    const lower = colName.toLowerCase().trim();
    return ['ảnh', 'anh', 'image', 'hinh', 'hình', 'photo', 'picture', 'thumbnail', 'avatar'].some(k => lower.includes(k));
}

function toggleSheetChangeAlert(hasChanges) {
    const dot = document.getElementById('gsheetSyncDot');
    if (dot) dot.style.display = hasChanges ? 'block' : 'none';

    const banner = document.getElementById('gsheetChangeAlertBanner');
    if (banner) banner.style.display = hasChanges ? 'flex' : 'none';
}

function strToHex(str) {
    if (!str) return '';
    try {
        const utf8Bytes = new TextEncoder().encode(str);
        return Array.from(utf8Bytes, b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        let hex = '';
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            hex += (c < 16 ? '0' : '') + c.toString(16);
        }
        return hex;
    }
}

async function saveGoogleSheetConfig() {
    const rawSheet = document.getElementById('gsheetUrlInput')?.value.trim() || '';
    const rawScript = document.getElementById('gsheetScriptUrlInput')?.value.trim() || '';
    const sheetName = document.getElementById('gsheetNameInput')?.value.trim() || 'Kho Sản Phẩm';

    if (!rawScript) {
        alert('Vui lòng nhập URL Web App của Google Apps Script');
        return;
    }

    const form = document.getElementById('hiddenGSheetSyncForm');
    const iframe = document.getElementById('hiddenGSheetSyncIframe');

    if (form && iframe) {
        document.getElementById('hiddenGSheetActionSave').value = "1";
        document.getElementById('hiddenGSheetActionSync').value = "0";
        document.getElementById('hiddenGSheetScriptUrl').value = rawScript;
        document.getElementById('hiddenGSheetSheetUrl').value = rawSheet;
        document.getElementById('hiddenGSheetSheetName').value = sheetName;
        document.getElementById('hiddenGSheetClientJson').value = "";

        const btn = document.getElementById('btnSaveGSheetConfig');
        if (btn) btn.disabled = true;

        iframe.onload = async () => {
            if (btn) {
                btn.disabled = false;
                const oldHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check" style="color:#10B981;"></i> Đã lưu cấu hình!';
                setTimeout(() => { btn.innerHTML = oldHtml; }, 2000);
            }
            await loadGoogleSheetStatus(false);
        };

        form.submit();
    }
}

async function syncGoogleSheetNow() {
    if (isSyncingGSheet) return;

    const rawScript = document.getElementById('gsheetScriptUrlInput')?.value.trim() || (AppState.sheetConfig?.script_url || '');
    const rawSheet = document.getElementById('gsheetUrlInput')?.value.trim() || (AppState.sheetConfig?.sheet_url || '');
    const sheetName = document.getElementById('gsheetNameInput')?.value.trim() || (AppState.sheetConfig?.sheet_name || 'Kho Sản Phẩm');

    if (!rawScript) {
        alert('Vui lòng nhập URL Google Apps Script trước khi đồng bộ');
        switchGSheetTab('config');
        return;
    }

    isSyncingGSheet = true;
    const btnModalSync = document.getElementById('btnSyncGSheetModal');
    const btnDataSync = document.getElementById('btnSyncFromDataTab');

    const originalText1 = btnModalSync ? btnModalSync.innerHTML : '';
    const originalText2 = btnDataSync ? btnDataSync.innerHTML : '';

    if (btnModalSync) {
        btnModalSync.disabled = true;
        btnModalSync.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Đang tải từ Sheet...';
    }
    if (btnDataSync) {
        btnDataSync.disabled = true;
        btnDataSync.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Đang tải...';
    }

    try {
        // BƯỚC 1: Lấy dữ liệu trực tiếp từ Google Apps Script qua trình duyệt (Đã kiểm chứng thành công 100%)
        const gasRes = await fetch(rawScript, { method: 'GET', mode: 'cors' });
        if (!gasRes.ok) throw new Error("HTTP " + gasRes.status);
        const gasData = await gasRes.json();
        if (!gasData || !gasData.success) {
            throw new Error(gasData?.message || "Google Apps Script phản hồi thất bại");
        }

        // BƯỚC 2: Submit qua iframe ẩn bằng form chuẩn (Miễn nhiễm 100% với OpenResty 403)
        const form = document.getElementById('hiddenGSheetSyncForm');
        const iframe = document.getElementById('hiddenGSheetSyncIframe');

        if (form && iframe) {
            document.getElementById('hiddenGSheetActionSave').value = "0";
            document.getElementById('hiddenGSheetActionSync').value = "1";
            document.getElementById('hiddenGSheetScriptUrl').value = rawScript;
            document.getElementById('hiddenGSheetSheetUrl').value = rawSheet;
            document.getElementById('hiddenGSheetSheetName').value = sheetName;
            document.getElementById('hiddenGSheetClientJson').value = JSON.stringify(gasData);

            iframe.onload = async () => {
                isSyncingGSheet = false;
                if (btnModalSync) {
                    btnModalSync.disabled = false;
                    btnModalSync.innerHTML = originalText1;
                }
                if (btnDataSync) {
                    btnDataSync.disabled = false;
                    btnDataSync.innerHTML = originalText2;
                }

                const totalRows = (gasData.sheets || []).reduce((sum, s) => sum + (s.data ? s.data.length : 0), 0) || (gasData.data ? gasData.data.length : 0);
                toggleSheetChangeAlert(false);

                AppState.sheetsCache = {};
                await loadGoogleSheetStatus(false);
                await loadGoogleSheetData(true);
            };

            form.submit();
        } else {
            throw new Error("Không tìm thấy form đồng bộ ẩn");
        }
    } catch (e) {
        console.error('Lỗi đồng bộ Google Sheet:', e);
        alert('Lỗi kết nối trong quá trình đồng bộ Google Sheet: ' + (e?.message || e));
        isSyncingGSheet = false;
        if (btnModalSync) {
            btnModalSync.disabled = false;
            btnModalSync.innerHTML = originalText1;
        }
        if (btnDataSync) {
            btnDataSync.disabled = false;
            btnDataSync.innerHTML = originalText2;
        }
    }
}

async function loadGoogleSheetData(forceRefresh = false, targetSheet = null) {
    const container = document.getElementById('sheetTableContainer');
    if (!container) return;

    if (targetSheet) {
        AppState.activeSheetTab = targetSheet;
    }

    // Nếu có trong cache và không ép buộc làm mới
    if (!forceRefresh && AppState.activeSheetTab && AppState.sheetsCache[AppState.activeSheetTab]) {
        AppState.sheetRows = AppState.sheetsCache[AppState.activeSheetTab];
        renderSheetTabsNavBar();
        renderSheetDataTable(AppState.sheetRows);
        return;
    }

    container.innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:#94A3B8;font-size:13px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px;margin-bottom:10px;display:block;color:var(--primary);"></i>
            Đang tải dữ liệu bảng tính...
        </div>
    `;

    try {
        let url = '../../api/google_sheet_action.php?action=get_data';
        if (AppState.activeSheetTab) {
            url += `&sheet_name=${encodeURIComponent(AppState.activeSheetTab)}`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (data && data.success) {
            AppState.sheetSheetsList = data.sheets || [];
            AppState.activeSheetTab = data.active_sheet || '';
            AppState.sheetColumns = data.columns || [];
            AppState.sheetRows = data.rows || [];

            if (AppState.activeSheetTab) {
                AppState.sheetsCache[AppState.activeSheetTab] = data.rows || [];
            }

            const badge = document.getElementById('sheetDataCountBadge');
            if (badge) badge.innerText = data.total_all !== undefined ? data.total_all : (data.total || 0);

            renderSheetTabsNavBar();
            renderSheetDataTable(AppState.sheetRows);
        } else {
            container.innerHTML = `
                <div style="text-align:center;padding:50px 20px;color:#EF4444;font-size:13px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:24px;margin-bottom:8px;display:block;"></i>
                    ${escapeHtml(data?.message || 'Không thể tải dữ liệu')}
                </div>
            `;
        }
    } catch (e) {
        console.error('Lỗi tải dữ liệu bảng tính:', e);
        container.innerHTML = `
            <div style="text-align:center;padding:50px 20px;color:#EF4444;font-size:13px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:24px;margin-bottom:8px;display:block;"></i>
                Lỗi kết nối khi tải bảng tính
            </div>
        `;
    }
}

function renderSheetTabsNavBar() {
    const navBar = document.getElementById('sheetTabsNavBar');
    const container = document.getElementById('sheetTabsListContainer');
    if (!navBar || !container) return;

    const list = AppState.sheetSheetsList || [];
    if (list.length <= 1) {
        navBar.style.display = 'none';
        return;
    }

    navBar.style.display = 'flex';
    container.innerHTML = list.map(s => {
        const isActive = (s.name === AppState.activeSheetTab);
        return `
            <div class="sheet-tab-pill ${isActive ? 'active' : ''}" 
                 onclick="switchSheetDataTableTab('${escapeHtml(s.name)}')">
                <i class="fa-solid fa-table"></i>
                <span>${escapeHtml(s.name)}</span>
            </div>
        `;
    }).join('');
}

function switchSheetDataTableTab(sheetName) {
    AppState.activeSheetTab = sheetName;
    renderSheetTabsNavBar();
    // Tự động làm mới dữ liệu từ CSDL ngay khi chuyển tab!
    loadGoogleSheetData(true, sheetName);
}

function renderSheetDataTable(rows) {
    const container = document.getElementById('sheetTableContainer');
    if (!container) return;

    const cols = AppState.sheetColumns || [];

    if (!cols || cols.length === 0 || !rows || rows.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:#94A3B8;font-size:13px;">
                <i class="fa-solid fa-table-cells" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.35;"></i>
                Chưa có dữ liệu bảng tính. Bấm "Cấu hình kết nối" và thực hiện đồng bộ.
            </div>
        `;
        return;
    }

    let html = `
        <table class="sheet-data-table">
            <thead>
                <tr>
                    ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach((row, idx) => {
        html += `
            <tr>
                ${cols.map(col => {
                    const rawVal = row[col] !== undefined ? row[col] : '';
                    const val = String(rawVal).trim();
                    const isImg = isImageUrlString(val);
                    if (isImg) {
                        const imgTitle = escapeHtml(row['Tên sản phẩm'] || row['Mã sản phẩm'] || col);
                        // Sử dụng Backend Proxy để vượt qua chính sách CORP/SameSite của Google Docs
                        const displayUrl = (val.includes('docs.google.com') || val.includes('sheets-images') || val.includes('googleusercontent.com'))
                            ? `../../api/google_sheet_action.php?action=proxy_image&url=${encodeURIComponent(val)}`
                            : val;
                        return `
                            <td style="text-align:center;">
                                <div class="sheet-thumb-wrapper">
                                    <img src="${escapeHtml(displayUrl)}" loading="lazy" decoding="async" class="sheet-thumb-img" title="Bấm để phóng to ảnh" onclick="openLightboxFromSingleUrl('${escapeHtml(displayUrl)}', 'Ảnh: ${imgTitle}')" onerror="this.onerror=null;this.parentElement.innerHTML='<span class=\\'cell-image-badge\\' title=\\'Ảnh Google Sheet đã hết hạn phiên token, hãy bấm Đồng bộ lại\\'><i class=\\'fa-solid fa-arrows-rotate\\'></i> Cần đồng bộ</span>';">
                                </div>
                            </td>
                        `;
                    }
                    if (val.toLowerCase() === 'cellimage' || val === '[CellImage]') {
                        return `
                            <td style="text-align:center;">
                                <span class="cell-image-badge" title="Hình ảnh nhúng trực tiếp trong ô Google Sheet (Hãy cập nhật Web App Apps Script mới và bấm Đồng bộ lại để hiện ảnh)" style="display:inline-flex;align-items:center;gap:5px;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;">
                                    <i class="fa-regular fa-image"></i> Hình ảnh
                                </span>
                            </td>
                        `;
                    }
                    return `<td>${escapeHtml(val)}</td>`;
                }).join('')}
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function isImageUrlString(str) {
    if (!str || typeof str !== 'string') return false;
    const s = str.trim();
    if (s.startsWith('data:image/')) return true;
    if (!s.startsWith('http://') && !s.startsWith('https://')) return false;
    if (s.includes('googleusercontent.com') || s.includes('drive.google.com') || s.includes('docs.google.com/spreadsheets') || s.includes('docs.google.com/sheets-images') || s.includes('sheets-images-rt')) return true;
    return /\.(png|jpe?g|webp|gif|svg|bmp)(\?.*)?$/i.test(s);
}

function copyAppsScriptCode() {
    navigator.clipboard.writeText(DEFAULT_APPS_SCRIPT_CODE).then(() => {
        const btn = document.getElementById('btnCopyScriptCode');
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã sao chép!';
            btn.style.background = '#10B981';
            btn.style.color = '#FFFFFF';
            setTimeout(() => {
                btn.innerHTML = original;
                btn.style.background = '';
                btn.style.color = '';
            }, 2500);
        }
    }).catch(err => {
        console.error('Lỗi copy clipboard:', err);
        alert('Không thể tự động sao chép mã, vui lòng xem trong tài liệu.');
    });
}

function openLightboxFromSingleUrl(url, title = 'Ảnh sản phẩm') {
    ensureLightboxModalInDom();
    currentLightboxState.urls = [url];
    currentLightboxState.currentIndex = 0;
    currentLightboxState.senderName = title;
    currentLightboxState.displayTime = 'Bảng dữ liệu Google Sheet';
    currentLightboxState.isStaff = false;

    const modal = document.getElementById('omniLightboxModal');
    if (modal) modal.classList.add('is-open');

    const nameEl = document.getElementById('lightboxSenderName');
    if (nameEl) nameEl.innerText = title;
    const timeEl = document.getElementById('lightboxSendTime');
    if (timeEl) timeEl.innerText = 'Bảng tính Google Sheet';

    const avatarEl = document.getElementById('lightboxAvatar');
    if (avatarEl) avatarEl.innerHTML = '<i class="fa-solid fa-file-excel" style="color:#10B981;"></i>';

    updateLightboxActiveImage();
    renderLightboxThumbs();
}

function showToast(message, type = 'info') {
    let toast = document.getElementById('omniToastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'omniToastNotification';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999999;
            padding: 12px 18px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            transform: translateY(-20px);
            opacity: 0;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }

    if (type === 'success') {
        toast.style.background = '#065F46';
        toast.style.color = '#ECFDF5';
        toast.style.border = '1px solid #059669';
    } else {
        toast.style.background = '#1E293B';
        toast.style.color = '#F8FAFC';
        toast.style.border = '1px solid #334155';
    }

    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-bell'}"></i> <span>${escapeHtml(message)}</span>`;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
    }, 3500);
}
