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
    isViewOnly: false,
    pollingInterval: null,
    isSending: false,
    allLabels: [],
    assignedLabels: []
};

const CHANNEL_CONFIG = {
    'WEBCHAT':  { icon: '<i class="fa-solid fa-globe"></i>', label: 'Webchat', class: 'badge-channel-WEBCHAT' },
    'FACEBOOK': { icon: '<i class="fa-brands fa-facebook-messenger"></i>', label: 'Facebook Messenger', class: 'badge-channel-FACEBOOK' },
    'ZALO':     { icon: '<i class="fa-solid fa-comment-dots"></i>', label: 'Zalo Chat', class: 'badge-channel-ZALO' },
    'SHOPEE':   { icon: '<i class="fa-solid fa-bag-shopping"></i>', label: 'Shopee Chat', class: 'badge-channel-SHOPEE' },
    'TIKTOK':   { icon: '<i class="fa-brands fa-tiktok"></i>', label: 'TikTok Shop', class: 'badge-channel-TIKTOK' }
};

const TAG_LABELS = {
    'DANG_TU_VAN':      'Đang tư vấn',
    'DA_CHOT':          'Đã chốt đơn',
    'CHO_CHUYEN_KHOAN': 'Chờ chuyển khoản',
    'BOOM_HANG':        'Rủi ro hoàn hàng'
};

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
        const assignedAvatar = conv.assigned_fullname ? conv.assigned_fullname.charAt(0).toUpperCase() : '<i class="fa-solid fa-user" style="font-size:8px;"></i>';
        const isUnread = (conv.is_read == 0 || conv.status === 'UNREPLIED');
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
        } else {
            // Hiển thị nhãn mặc định từ tiến độ tư vấn nếu chưa gắn nhãn tùy biến
            const defaultTagName = TAG_LABELS[conv.tag] || 'New Lead';
            labelPillHtml = `
                <span class="respondio-label-pill" style="border-left: 3px solid #64748B;">
                    <i class="fa-solid fa-tag" style="color:#64748B;"></i>
                    <span>${escapeHtml(defaultTagName)}</span>
                </span>
            `;
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
                    <!-- Dòng 1: Tên khách (in đậm) & Thời gian ngắn gọn -->
                    <div class="card-header-line">
                        <span class="card-sender-name" title="${escapeHtml(conv.sender_name)}">${escapeHtml(conv.sender_name)}</span>
                        <span class="card-time-ago">${conv.short_time || conv.time_ago || ''}</span>
                    </div>

                    <!-- Dòng 2: Icon chiều tin (↙ khách / ✓✓ nhân viên) & Nội dung -->
                    <div class="card-message-line ${isUnread ? 'is-unread' : ''}">
                        <span class="msg-dir-icon ${isStaffLast ? 'outgoing' : 'incoming'}">
                            ${isStaffLast ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-arrow-down-left"></i>'}
                        </span>
                        <span class="card-snippet-text">${conv.last_message ? escapeHtml(conv.last_message) : '<i>[Bắt đầu trò chuyện]</i>'}</span>
                    </div>

                    <!-- Dòng 3: Chip Nhãn + Checkmark + Avatar nhân viên phụ trách -->
                    <div class="card-footer-line">
                        <div class="card-labels-cluster">
                            ${labelPillHtml}
                        </div>
                        <div class="card-status-meta">
                            <i class="fa-solid fa-circle-check card-resolved-icon" title="Hội thoại hoạt động"></i>
                            <div class="card-assignee-avatar ${conv.assigned_fullname ? '' : 'is-unassigned'}" title="Phụ trách: ${escapeHtml(assignedName)}">
                                ${assignedAvatar}
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

    const activeChannelBadge = document.getElementById('activeChannelBadge');
    if (activeChannelBadge) activeChannelBadge.innerHTML = `${channelCfg.icon} ${channelCfg.label}`;

    const tagBadge = document.getElementById('activeTagBadge');
    if (tagBadge) {
        const tagName = TAG_LABELS[conv.tag] || conv.tag || 'Đang tư vấn';
        tagBadge.innerText = tagName;
        tagBadge.className = `card-tag-badge tag-${conv.tag || 'DANG_TU_VAN'}`;
    }

    const waitingChip = document.getElementById('activeWaitingChip');
    const waitingTime = document.getElementById('activeWaitingTime');
    if (waitingChip && waitingTime) {
        if (conv.status === 'UNREPLIED') {
            waitingChip.style.display = 'inline-flex';
            waitingTime.innerText = conv.waiting_label || 'Chờ phản hồi';
        } else {
            waitingChip.style.display = 'none';
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
    AppState.lastMessageId = 0;
    const thisRequestId = ++AppState.fetchRequestId;

    // 1. Phản hồi giao diện ngay lập tức: Đánh dấu thẻ active
    document.querySelectorAll('.conversation-card').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-conv-id') == convId);
    });

    // 2. Hiển thị Header và Sidebar Phải ngay lập tức từ dữ liệu đã nạp trong danh sách
    const cachedConv = AppState.cachedConversations ? AppState.cachedConversations[convId] : null;
    if (cachedConv) {
        renderChatHeader(cachedConv);
    }
    document.getElementById('rightSidebar').style.display = 'flex';

    // 3. Xóa sạch vùng tin nhắn cũ ngay lập tức (Gỡ empty state và tin nhắn của khách trước)
    const viewport = document.getElementById('messagesViewport');
    viewport.innerHTML = `
        <div class="chat-loading-placeholder" style="text-align:center;padding:50px 16px;color:#94a3b8;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:26px;margin-bottom:12px;color:#10B981;display:block;"></i>
            <span style="font-size:13px;font-weight:500;">Đang nạp dữ liệu hội thoại...</span>
        </div>
    `;

    try {
        const res = await fetch(`../../api/chat_action.php?action=get_conversation&id=${convId}`);
        const data = await res.json();

        // Kiểm tra xem người dùng có bấm chuyển sang khách khác trong lúc đang tải không
        if (AppState.activeConvId !== convId || thisRequestId !== AppState.fetchRequestId) {
            return; // Đã đổi khách, bỏ qua kết quả cũ để chống mix tin nhắn
        }

        if (data.success && data.data) {
            renderConversationView(data.data);
            runSyncPolling();
        } else {
            viewport.innerHTML = `
                <div style="text-align:center;padding:50px 16px;color:#ef4444;font-size:13px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:28px;margin-bottom:8px;display:block;"></i>
                    Không thể tải nội dung hội thoại: ${escapeHtml(data.message || 'Lỗi kết nối')}
                </div>
            `;
        }
    } catch (err) {
        console.error('Lỗi tải chi tiết hội thoại:', err);
        if (AppState.activeConvId === convId) {
            viewport.innerHTML = `
                <div style="text-align:center;padding:50px 16px;color:#ef4444;font-size:13px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:28px;margin-bottom:8px;display:block;"></i>
                    Lỗi kết nối khi tải hội thoại. Vui lòng thử lại.
                </div>
            `;
        }
    }
}

/**
 * Render toàn bộ khung chat và hồ sơ khách hàng
 */
function renderConversationView(detail) {
    const { conversation, is_mine, is_view_only, messages, profile } = detail;

    // 1. Cập nhật thanh header thông tin khách hàng ở trên cùng
    renderChatHeader(conversation);
    document.getElementById('rightSidebar').style.display = 'flex';

    // 2. Xử lý cơ chế khóa View-Only (UC2.2)
    AppState.isViewOnly = is_view_only;
    const lockBanner = document.getElementById('viewOnlyLockBanner');
    const inputArea = document.getElementById('chatInputArea');

    if (is_view_only) {
        lockBanner.style.display = 'flex';
        inputArea.style.display = 'none';
        document.getElementById('viewOnlyLockText').innerText = 
            `Hội thoại đang được phụ trách bởi ${conversation.assigned_fullname || 'nhân viên khác'}. Bạn không có quyền gửi tin nhắn.`;
    } else {
        lockBanner.style.display = 'none';
        inputArea.style.display = 'block';
    }

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
            <div style="text-align:center;padding:50px 16px;color:#94a3b8;font-size:13px;">
                <i class="fa-regular fa-comments" style="font-size:28px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                Chưa có tin nhắn trong cuộc trò chuyện này. Hãy gửi tin nhắn để bắt đầu tư vấn.
            </div>
        `;
    }
    scrollChatToBottom();

    // 4. Cập nhật Sidebar Phải (Hồ sơ Agent & Nhãn tùy biến)
    renderProfileSidebar(profile, conversation);
    loadAssignedLabelsForActiveConv();
}

/**
 * Đồng bộ tin nhắn mới của hội thoại đang mở khi polling
 */
function handleActiveConversationSync(activeData) {
    if (!activeData || !activeData.conversation) return;

    // Đảm bảo chỉ xử lý nếu đúng hội thoại đang được mở trên màn hình
    if (activeData.conversation.id != AppState.activeConvId) return;

    const { conversation, is_mine, is_view_only, new_messages, profile, assigned_labels } = activeData;

    // Đảm bảo Header luôn hiển thị thông tin khách hàng
    renderChatHeader(conversation);

    // Cập nhật quyền View-Only nếu có sự thay đổi
    if (AppState.isViewOnly !== is_view_only) {
        AppState.isViewOnly = is_view_only;
        const lockBanner = document.getElementById('viewOnlyLockBanner');
        const inputArea = document.getElementById('chatInputArea');

        if (is_view_only) {
            lockBanner.style.display = 'flex';
            inputArea.style.display = 'none';
            document.getElementById('viewOnlyLockText').innerText = 
                `Hội thoại đang được phụ trách bởi ${conversation.assigned_fullname || 'nhân viên khác'}. Bạn không có quyền gửi tin nhắn.`;
        } else {
            lockBanner.style.display = 'none';
            inputArea.style.display = 'block';
        }
    }

    // Gỡ bỏ trạng thái empty state hoặc placeholder nếu có
    const viewport = document.getElementById('messagesViewport');
    const placeholder = viewport.querySelector('.chat-empty-state, .chat-loading-placeholder');
    if (placeholder && new_messages && new_messages.length > 0) {
        placeholder.remove();
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
            scrollChatToBottom();
        }
    }

    // Cập nhật hồ sơ và nhãn
    if (profile) {
        renderProfileSidebar(profile, conversation);
    }
    if (assigned_labels) {
        renderAssignedLabels(assigned_labels);
    }
}

/**
 * Thêm một bong bóng tin nhắn vào khung chat (Định dạng thời gian chuẩn Việt Nam)
 */
function appendMessageBubble(msg, isNew = false) {
    const viewport = document.getElementById('messagesViewport');
    if (!viewport) return;

    // Chống trùng lặp tin nhắn
    if (msg.id && document.getElementById(`msg-${msg.id}`)) {
        return;
    }

    // Gỡ bỏ placeholder nếu còn tồn tại
    const placeholder = viewport.querySelector('.chat-empty-state, .chat-loading-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    const isStaff = (msg.sender_type === 'STAFF');
    const senderTitle = isStaff ? (msg.staff_name || 'Nhân viên tư vấn') : 'Khách hàng';

    const div = document.createElement('div');
    if (msg.id) div.id = `msg-${msg.id}`;
    div.className = `message-item ${isStaff ? 'staff' : 'customer'}`;
    
    let attachmentHtml = '';
    if (msg.attachment_url) {
        attachmentHtml = `
            <div>
                <a href="${escapeHtml(msg.attachment_url)}" target="_blank">
                    <img src="${escapeHtml(msg.attachment_url)}" class="message-attachment-img" alt="Ảnh đính kèm">
                </a>
            </div>
        `;
    }

    // Định dạng giờ hiển thị theo chuẩn Việt Nam HH:mm
    let displayTime = msg.time_formatted || '';
    if (!displayTime && msg.created_at) {
        const d = new Date(msg.created_at.replace(/-/g, '/'));
        if (!isNaN(d.getTime())) {
            displayTime = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
    }

    div.innerHTML = `
        <div class="message-meta-header">${escapeHtml(senderTitle)}</div>
        <div class="message-bubble">
            ${escapeHtml(msg.content)}
            ${attachmentHtml}
            <div class="message-timestamp">${escapeHtml(displayTime)}</div>
        </div>
    `;

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

        const res = await fetch('../../api/chat_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success && data.data) {
            appendMessageBubble(data.data, true);
            scrollChatToBottom();
            runSyncPolling();
        } else {
            alert(data.message || 'Không thể gửi tin nhắn');
        }
    } catch (err) {
        console.error('Lỗi gửi tin nhắn:', err);
    } finally {
        AppState.isSending = false;
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
    const file = input.files[0];

    const formData = new FormData();
    formData.append('action', 'upload_attachment');
    formData.append('file', file);

    try {
        const res = await fetch('../../api/chat_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success && data.data.url) {
            sendMessage(data.data.url);
        } else {
            alert(data.message || 'Lỗi tải ảnh');
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
function renderProfileSidebar(profile, conv) {
    if (!profile) return;

    const customerName = profile.customer_name || conv.sender_name || 'Khách Hàng';
    document.getElementById('profileCustomerName').innerText = customerName;
    document.getElementById('rightCustomerAvatar').innerText = customerName.charAt(0).toUpperCase();
    document.getElementById('rightChannelSubtext').innerText = `Kênh ${conv.channel || 'Webchat'} • #${conv.id}`;

    document.getElementById('profilePreferredSize').innerText = profile.preferred_size || 'Chưa xác định';
    document.getElementById('profileRecentPurchases').innerText = profile.recent_purchases || 'Chưa có thông tin đơn cũ';
    document.getElementById('scanVersionBadge').innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${profile.scan_version_label || ('v' + (profile.scan_version || 1) + '.0')}`;

    const lastUpdatedEl = document.getElementById('profileLastUpdated');
    if (lastUpdatedEl) {
        lastUpdatedEl.innerText = profile.last_scanned_formatted || 'Vừa xong';
    }

    // Cảnh báo Boom Hàng
    const boomBadge = document.getElementById('boomRiskBadge');
    const safeBadge = document.getElementById('safeCustomerBadge');
    if (profile.is_boom_risk == 1) {
        if (boomBadge) boomBadge.style.display = 'flex';
        if (safeBadge) safeBadge.style.display = 'none';
        if (profile.boom_note && document.getElementById('boomRiskNote')) {
            document.getElementById('boomRiskNote').innerText = profile.boom_note;
        }
    } else {
        if (boomBadge) boomBadge.style.display = 'none';
        if (safeBadge) safeBadge.style.display = 'flex';
    }

    // Chọn đúng Radio tiến độ tư vấn
    const radios = document.getElementsByName('convTagRadio');
    for (let r of radios) {
        r.checked = (r.value === conv.tag);
    }
}

async function quickSetSize(size) {
    if (!AppState.activeConvId) return;
    const targetSize = 'Size ' + size;
    document.getElementById('profilePreferredSize').innerText = targetSize;

    try {
        const formData = new FormData();
        formData.append('action', 'update_field');
        formData.append('conversation_id', AppState.activeConvId);
        formData.append('field', 'preferred_size');
        formData.append('value', targetSize);

        await fetch('../../api/customer_action.php', { method: 'POST', body: formData });
    } catch (e) {
        console.error('Lỗi cập nhật size nhanh:', e);
    }
}

async function triggerAgentScan() {
    if (!AppState.activeConvId) return;

    const btn = document.getElementById('btnRescanAgent');
    btn.classList.add('scanning');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>AGENT ĐANG QUÉT DỮ LIỆU...</span>';

    try {
        const formData = new FormData();
        formData.append('action', 'scan_agent');
        formData.append('conversation_id', AppState.activeConvId);

        const res = await fetch('../../api/customer_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success && data.data) {
            const checkedRadio = document.querySelector('input[name="convTagRadio"]:checked');
            const currentTag = checkedRadio ? checkedRadio.value : 'DANG_TU_VAN';

            setTimeout(() => {
                renderProfileSidebar(data.data, { tag: currentTag, sender_name: data.data.customer_name, channel: 'WEBCHAT', id: AppState.activeConvId });
                btn.classList.remove('scanning');
                btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>ĐÃ BÓC TÁCH XONG</span>';
                
                setTimeout(() => {
                    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>QUÉT LẠI HỒ SƠ (AI AGENT)</span>';
                }, 2000);
            }, 500);
        }
    } catch (err) {
        console.error('Lỗi quét dữ liệu Agent:', err);
        btn.classList.remove('scanning');
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>QUÉT LẠI HỒ SƠ (AI AGENT)</span>';
    }
}

async function editFieldPrompt(fieldName, fieldTitle) {
    if (!AppState.activeConvId) return;

    let currentVal = '';
    if (fieldName === 'preferred_size') {
        currentVal = document.getElementById('profilePreferredSize').innerText;
    } else if (fieldName === 'recent_purchases') {
        currentVal = document.getElementById('profileRecentPurchases').innerText;
    } else {
        currentVal = document.getElementById('profileCustomerName').innerText;
    }

    const newVal = prompt(`Nhập ${fieldTitle} mới:`, currentVal);
    if (newVal === null || newVal.trim() === '' || newVal.trim() === currentVal) return;

    try {
        const formData = new FormData();
        formData.append('action', 'update_field');
        formData.append('conversation_id', AppState.activeConvId);
        formData.append('field', fieldName);
        formData.append('value', newVal.trim());

        const res = await fetch('../../api/customer_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            if (fieldName === 'preferred_size') {
                document.getElementById('profilePreferredSize').innerText = newVal.trim();
            } else if (fieldName === 'recent_purchases') {
                document.getElementById('profileRecentPurchases').innerText = newVal.trim();
            } else {
                document.getElementById('profileCustomerName').innerText = newVal.trim();
                document.getElementById('activeSenderName').innerText = newVal.trim();
            }
        }
    } catch (err) {
        console.error('Lỗi cập nhật hồ sơ:', err);
    }
}

async function handleTagChange(tagValue) {
    if (!AppState.activeConvId) return;

    try {
        const formData = new FormData();
        formData.append('action', 'update_tag');
        formData.append('conversation_id', AppState.activeConvId);
        formData.append('tag', tagValue);

        const res = await fetch('../../api/customer_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            const tagBadge = document.getElementById('activeTagBadge');
            tagBadge.innerText = TAG_LABELS[tagValue] || tagValue;
            tagBadge.className = `card-tag-badge tag-${tagValue}`;
            runSyncPolling();
        }
    } catch (err) {
        console.error('Lỗi đổi tag:', err);
    }
}

async function handleShiftChange(status) {
    try {
        const formData = new FormData();
        formData.append('action', 'toggle_shift');
        formData.append('status', status);

        const res = await fetch('../../api/chat_action.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            updateHeaderShiftStatus(data.data.status);
            runSyncPolling();
        }
    } catch (err) {
        console.error('Lỗi đổi ca trực:', err);
    }
}

function updateHeaderShiftStatus(status) {
    const dot = document.getElementById('shiftDot');
    const select = document.getElementById('shiftSelect');

    if (status === 'ONLINE') {
        dot.className = 'status-dot online';
        select.value = 'ONLINE';
    } else {
        dot.className = 'status-dot';
        select.value = 'OFFLINE';
    }
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
    } catch (e) {}
}

function renderAssignedLabels(labels) {
    AppState.assignedLabels = labels || [];
    const container = document.getElementById('profileLabelsList');
    if (!container) return;

    if (!labels || labels.length === 0) {
        container.innerHTML = '<span class="no-labels-text">Chưa gắn nhãn</span>';
        return;
    }

    let html = '';
    labels.forEach(l => {
        html += `
            <span class="assigned-label-chip" style="border-left: 3px solid ${l.color};">
                <i class="${l.icon || 'fa-solid fa-tag'}" style="color:${l.color};font-size:10px;"></i>
                <span>${escapeHtml(l.name)}</span>
                <button type="button" class="btn-remove-label" onclick="toggleConversationLabel(${l.id})" title="Gỡ nhãn">&times;</button>
            </span>
        `;
    });
    container.innerHTML = html;
}

/**
 * Bật/tắt popover gán nhãn cho hội thoại
 */
function toggleAssignLabelDropdown(e) {
    e.stopPropagation();
    const popover = document.getElementById('assignLabelPopover');
    if (popover.style.display === 'block') {
        popover.style.display = 'none';
        return;
    }

    const listContainer = document.getElementById('popoverLabelsList');
    const assignedIds = (AppState.assignedLabels || []).map(l => l.id);

    let html = '';
    (AppState.allLabels || []).forEach(l => {
        const isAssigned = assignedIds.includes(l.id);
        html += `
            <div class="popover-label-item ${isAssigned ? 'selected' : ''}" onclick="toggleConversationLabel(${l.id})">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="label-color-dot" style="background:${l.color};"></span>
                    <span>${escapeHtml(l.name)}</span>
                </div>
                ${isAssigned ? '<i class="fa-solid fa-check" style="color:var(--primary);font-size:11px;"></i>' : ''}
            </div>
        `;
    });

    listContainer.innerHTML = html || '<div style="color:#94a3b8;font-size:11px;">Chưa có nhãn nào</div>';
    popover.style.display = 'block';
}

async function toggleConversationLabel(labelId) {
    if (!AppState.activeConvId) return;

    try {
        const formData = new FormData();
        formData.append('action', 'toggle');
        formData.append('conversation_id', AppState.activeConvId);
        formData.append('label_id', labelId);

        const res = await fetch('../../api/label_action.php', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            loadAssignedLabelsForActiveConv();
            runSyncPolling();
        }
    } catch (err) {
        console.error('Lỗi gắn nhãn:', err);
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
