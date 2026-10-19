/**
 * JAVASCRIPT: workspace.js
 * Quản lý tương tác thời gian thực, polling AJAX (2.5s), phím tắt template,
 * khóa View-only, đổi ca trực, Agent bóc tách và gắn nhãn hội thoại (Respond.io Style)
 */

document.addEventListener('DOMContentLoaded', () => {
    initWorkspace();
});

// Trạng thái ứng dụng
const AppState = {
    activeConvId: null,
    currentTab: 'all',          // 'all' | 'mine'
    unrepliedOnly: false,
    searchQuery: '',
    lastMessageId: 0,
    isViewOnly: false,
    pollingInterval: null,
    isSending: false
};

const CHANNEL_CONFIG = {
    'WEBCHAT':  { icon: '<i class="fa-solid fa-comments"></i>', label: 'Webchat', class: 'badge-channel-WEBCHAT' },
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

    // 3. Phím tắt Ctrl + K để tìm kiếm
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.focus();
        }
    });
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
            unreplied: AppState.unrepliedOnly ? '1' : '0',
            search: AppState.searchQuery,
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

        // Cập nhật trạng thái ca trực của nhân viên ở Header nếu có thay đổi
        updateHeaderShiftStatus(data.current_user_status);

        // Cập nhật số lượng đếm trên badge các tab
        if (data.counts) {
            updateTabBadges(data.counts);
        }

        // Cập nhật danh sách thẻ hội thoại bên trái
        renderConversationsList(data.conversations);

        // Cập nhật tin nhắn mới nếu đang mở một hội thoại
        if (AppState.activeConvId && data.active_conversation) {
            handleActiveConversationSync(data.active_conversation);
        }

        // Kéo tin nhắn từ Render Webhook Gateway mỗi 5 giây (2 chu kỳ)
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
        // Render free tier có thể đang ngủ
    } finally {
        isRenderPolling = false;
    }
}

/**
 * Cập nhật số lượng đếm trên các Badge Tab
 */
function updateTabBadges(counts) {
    const elAll = document.getElementById('badgeAll');
    const elMine = document.getElementById('badgeMine');
    const elUnreplied = document.getElementById('badgeUnreplied');
    const elTotal = document.getElementById('totalConvCount');

    if (elAll) elAll.innerText = counts.all || '0';
    if (elMine) elMine.innerText = counts.mine || '0';
    if (elUnreplied) {
        elUnreplied.innerText = counts.unreplied || '0';
    }
    if (elTotal) {
        elTotal.innerText = `${counts.all || 0} hội thoại`;
    }
}

/**
 * Lấy danh sách hội thoại ban đầu
 */
async function fetchConversations(selectFirst = false) {
    try {
        const params = new URLSearchParams({
            tab: AppState.currentTab,
            unreplied: AppState.unrepliedOnly ? '1' : '0',
            search: AppState.searchQuery
        });

        const res = await fetch(`../../api/sync_polling.php?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.conversations) {
            if (data.counts) {
                updateTabBadges(data.counts);
            }
            renderConversationsList(data.conversations);

            // Tự động chọn hội thoại đầu tiên nếu chưa chọn hội thoại nào
            if (selectFirst && data.conversations.length > 0 && !AppState.activeConvId) {
                selectConversation(data.conversations[0].id);
            }
        }
    } catch (err) {
        console.error('Lỗi nạp hội thoại:', err);
    }
}

/**
 * Hiển thị danh sách thẻ hội thoại ở Sidebar Trái (Respond.io Style)
 */
function renderConversationsList(conversations) {
    const container = document.getElementById('conversationsContainer');
    if (!conversations || conversations.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px;">
                <i class="fa-regular fa-folder-open" style="font-size:32px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                Không có hội thoại nào phù hợp
            </div>
        `;
        return;
    }

    let html = '';
    conversations.forEach(conv => {
        const isActive = (conv.id == AppState.activeConvId);
        const channelCfg = CHANNEL_CONFIG[conv.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conv.channel, class: 'badge-channel-WEBCHAT' };
        const tagLabel = TAG_LABELS[conv.tag] || conv.tag;
        const assignedName = conv.assigned_fullname || 'Chưa gán';
        const assignedAvatar = conv.assigned_fullname ? conv.assigned_fullname.charAt(0).toUpperCase() : '?';
        const isUnreplied = (conv.status === 'UNREPLIED');
        const initial = (conv.sender_name || 'K').charAt(0).toUpperCase();

        html += `
            <div class="conversation-card ${isActive ? 'active' : ''} ${isUnreplied ? 'is-unreplied' : ''}" onclick="selectConversation(${conv.id})">
                <div class="card-avatar-wrap">
                    <div class="card-avatar-circle">${escapeHtml(initial)}</div>
                    <span class="card-channel-mini-badge badge-channel-${conv.channel}">
                        ${channelCfg.icon}
                    </span>
                </div>
                
                <div class="card-content-block">
                    <div class="card-header-line">
                        <span class="card-sender-name" title="${escapeHtml(conv.sender_name)}">${escapeHtml(conv.sender_name)}</span>
                        ${isUnreplied ? `
                            <span class="card-waiting-chip" title="Thời gian khách đang chờ">
                                <i class="fa-regular fa-clock"></i> ${conv.waiting_label || 'Chờ'}
                            </span>
                        ` : `
                            <span class="card-time-ago">${conv.time_ago}</span>
                        `}
                    </div>

                    <div class="card-snippet-text ${isUnreplied ? 'unreplied-text' : ''}">
                        ${conv.last_message ? escapeHtml(conv.last_message) : '<i>[Bắt đầu hội thoại]</i>'}
                    </div>

                    <div class="card-footer-line">
                        <span class="card-tag-pill tag-${conv.tag}">
                            <span class="tag-dot"></span>
                            <span>${tagLabel}</span>
                        </span>
                        <div class="assigned-staff-chip" title="Phụ trách: ${escapeHtml(assignedName)}">
                            <span class="mini-staff-avatar">${assignedAvatar}</span>
                            <span>${escapeHtml(assignedName)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Chọn và mở chi tiết một hội thoại
 */
async function selectConversation(convId) {
    if (AppState.activeConvId === convId) return;

    AppState.activeConvId = convId;
    AppState.lastMessageId = 0;

    // Đánh dấu thẻ active trên UI
    document.querySelectorAll('.conversation-card').forEach(el => el.classList.remove('active'));

    try {
        const res = await fetch(`../../api/chat_action.php?action=get_conversation&id=${convId}`);
        const data = await res.json();

        if (data.success && data.data) {
            renderConversationView(data.data);
        }
    } catch (err) {
        console.error('Lỗi tải chi tiết hội thoại:', err);
    }
}

/**
 * Render toàn bộ khung chat và hồ sơ khách hàng
 */
function renderConversationView(detail) {
    const { conversation, is_mine, is_view_only, messages, profile } = detail;

    // 1. Hiển thị Header khung chat
    const channelCfg = CHANNEL_CONFIG[conversation.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conversation.channel, class: 'badge-channel-WEBCHAT' };
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('rightSidebar').style.display = 'flex';
    document.getElementById('activeSenderName').innerText = conversation.sender_name;
    document.getElementById('activeAvatar').innerText = (conversation.sender_name || 'K').charAt(0).toUpperCase();

    const avatarChannelIcon = document.getElementById('activeAvatarChannelIcon');
    if (avatarChannelIcon) {
        avatarChannelIcon.innerHTML = channelCfg.icon;
        avatarChannelIcon.className = `partner-channel-mini-badge badge-channel-${conversation.channel}`;
    }

    document.getElementById('activeChannelBadge').innerHTML = `${channelCfg.icon} ${channelCfg.label}`;
    
    const tagBadge = document.getElementById('activeTagBadge');
    tagBadge.innerText = TAG_LABELS[conversation.tag] || conversation.tag;
    tagBadge.className = `card-tag-badge tag-${conversation.tag}`;

    // Cập nhật waiting time & assignee text
    const waitingChip = document.getElementById('activeWaitingChip');
    const waitingTime = document.getElementById('activeWaitingTime');
    if (conversation.status === 'UNREPLIED') {
        waitingChip.style.display = 'inline-flex';
        waitingTime.innerText = conversation.waiting_label || 'Chờ phản hồi';
    } else {
        waitingChip.style.display = 'none';
    }

    const assigneeText = document.getElementById('activeAssigneeText');
    if (assigneeText) {
        assigneeText.innerText = `Phụ trách: ${conversation.assigned_fullname || 'Chưa gán'}`;
    }

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

    // 3. Render tin nhắn hội thoại
    const viewport = document.getElementById('messagesViewport');
    viewport.innerHTML = '';
    messages.forEach(msg => {
        appendMessageBubble(msg, false);
    });
    scrollChatToBottom();

    // 4. Cập nhật Sidebar Phải (Hồ sơ Agent & Thẻ Tag)
    renderProfileSidebar(profile, conversation);
}

/**
 * Đồng bộ tin nhắn mới của hội thoại đang mở khi polling
 */
function handleActiveConversationSync(activeData) {
    const { conversation, is_mine, is_view_only, new_messages, profile } = activeData;

    // Cập nhật quyền View-Only nếu có sự thay đổi (ví dụ đổi ca UC2.3)
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

    // Bổ sung các tin nhắn mới
    if (new_messages && new_messages.length > 0) {
        new_messages.forEach(msg => {
            appendMessageBubble(msg, true);
        });
        scrollChatToBottom();
    }

    // Cập nhật hồ sơ và nhãn nếu có đổi
    if (profile) {
        renderProfileSidebar(profile, conversation);
    }
}

/**
 * Thêm một bong bóng tin nhắn vào khung chat
 */
function appendMessageBubble(msg, isNew = false) {
    const viewport = document.getElementById('messagesViewport');
    const isStaff = (msg.sender_type === 'STAFF');
    const senderTitle = isStaff ? (msg.staff_name || 'Nhân viên tư vấn') : 'Khách hàng';

    const div = document.createElement('div');
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

    div.innerHTML = `
        <div class="message-meta-header">${escapeHtml(senderTitle)}</div>
        <div class="message-bubble">
            ${escapeHtml(msg.content)}
            ${attachmentHtml}
            <div class="message-timestamp">${msg.time_formatted || ''}</div>
        </div>
    `;

    viewport.appendChild(div);

    if (msg.id > AppState.lastMessageId) {
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
 * UC3.1: Nhận diện phím tắt mẫu tin nhắn /
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

/**
 * UC3.1: Tải ảnh đính kèm (Bảng size, ảnh sản phẩm)
 */
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
 * Cập nhật Sidebar Phải (Hồ sơ Khách Hàng 360 & Tóm tắt - Respond.io Style)
 */
function renderProfileSidebar(profile, conv) {
    if (!profile) return;

    const customerName = profile.customer_name || conv.sender_name || 'Khách Hàng';
    document.getElementById('profileCustomerName').innerText = customerName;
    document.getElementById('rightCustomerAvatar').innerText = customerName.charAt(0).toUpperCase();
    document.getElementById('rightChannelSubtext').innerText = `Kênh ${conv.channel || 'Webchat'} • Hội thoại #${conv.id}`;

    document.getElementById('profilePreferredSize').innerText = profile.preferred_size || 'Chưa xác định';
    document.getElementById('profileRecentPurchases').innerText = profile.recent_purchases || 'Chưa có thông tin đơn cũ';
    document.getElementById('scanVersionBadge').innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${profile.scan_version_label || ('v' + (profile.scan_version || 1) + '.0')}`;

    const lastUpdatedEl = document.getElementById('profileLastUpdated');
    if (lastUpdatedEl) {
        lastUpdatedEl.innerText = profile.last_scanned_formatted || 'Vừa xong';
    }

    // Huy hiệu cảnh báo Boom Hàng
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

    // Chọn đúng Radio nhãn hội thoại
    const radios = document.getElementsByName('convTagRadio');
    for (let r of radios) {
        r.checked = (r.value === conv.tag);
    }
}

/**
 * Chọn nhanh kích cỡ thường mặc (S, M, L, XL)
 */
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

/**
 * UC3.3: Quét lại dữ liệu Agent bóc tách thực thể
 */
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

/**
 * UC3.3 (extend): Sửa thủ công thông tin hồ sơ khách hàng
 */
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

/**
 * UC3.4: Gắn nhãn hội thoại (Tagging)
 */
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

/**
 * UC2.3: Đổi trạng thái ca trực (Online / Offline)
 */
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

/**
 * Điều hướng Tab lọc (Tất cả / Của tôi)
 */
function switchTab(tab) {
    AppState.currentTab = tab;
    AppState.unrepliedOnly = false;
    document.getElementById('tabAll').classList.toggle('active', tab === 'all');
    document.getElementById('tabMine').classList.toggle('active', tab === 'mine');
    document.getElementById('chipUnreplied').classList.remove('active');
    fetchConversations();
}

/**
 * Bật/tắt lọc Chưa trả lời (FIFO)
 */
function toggleUnrepliedFilter() {
    AppState.unrepliedOnly = !AppState.unrepliedOnly;
    document.getElementById('chipUnreplied').classList.toggle('active', AppState.unrepliedOnly);
    if (AppState.unrepliedOnly) {
        document.getElementById('tabAll').classList.remove('active');
        document.getElementById('tabMine').classList.remove('active');
    } else {
        document.getElementById(AppState.currentTab === 'mine' ? 'tabMine' : 'tabAll').classList.add('active');
    }
    fetchConversations();
}

/**
 * Tìm kiếm hội thoại
 */
let searchDebounce = null;
function handleSearch(val) {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        AppState.searchQuery = val.trim();
        fetchConversations();
    }, 300);
}

/**
 * UC3.2: Popup Thêm mẫu tin nhắn nhanh
 */
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
