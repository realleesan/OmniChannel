/**
 * JAVASCRIPT: workspace.js
 * Quản lý tương tác thời gian thực, polling AJAX (2.5s), phím tắt /1,
 * khóa View-only, đổi ca trực, Agent bóc tách và gắn nhãn hội thoại
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
    'WEBCHAT':  { icon: '<i class="fa-solid fa-comments" style="color:#10B981;"></i>', label: 'Webchat' },
    'FACEBOOK': { icon: '<i class="fa-brands fa-facebook-messenger" style="color:#1877F2;"></i>', label: 'Facebook' },
    'ZALO':     { icon: '<i class="fa-solid fa-comment-dots" style="color:#0068FF;"></i>', label: 'Zalo' },
    'SHOPEE':   { icon: '<i class="fa-solid fa-bag-shopping" style="color:#EE4D2D;"></i>', label: 'Shopee' },
    'TIKTOK':   { icon: '<i class="fa-brands fa-tiktok" style="color:#000000;"></i>', label: 'TikTok' }
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
}

/**
 * Thực thi Polling đồng bộ tin nhắn và trạng thái ca trực mỗi 2.5s
 */
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

        // Cập nhật danh sách thẻ hội thoại bên trái
        renderConversationsList(data.conversations);

        // Cập nhật tin nhắn mới nếu đang mở một hội thoại
        if (AppState.activeConvId && data.active_conversation) {
            handleActiveConversationSync(data.active_conversation);
        }
    } catch (err) {
        console.warn('Lỗi Polling đồng bộ:', err);
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
 * Hiển thị danh sách thẻ hội thoại ở Sidebar Trái
 */
function renderConversationsList(conversations) {
    const container = document.getElementById('conversationsContainer');
    if (!conversations || conversations.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px;">
                Không có hội thoại nào phù hợp
            </div>
        `;
        return;
    }

    let html = '';
    conversations.forEach(conv => {
        const isActive = (conv.id == AppState.activeConvId);
        const channelCfg = CHANNEL_CONFIG[conv.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conv.channel };
        const tagLabel = TAG_LABELS[conv.tag] || conv.tag;
        const assignedName = conv.assigned_fullname || 'Chưa gán';
        const assignedAvatar = conv.assigned_fullname ? conv.assigned_fullname.charAt(0) : '?';
        const isUnreplied = (conv.status === 'UNREPLIED');

        html += `
            <div class="conversation-card ${isActive ? 'active' : ''}" onclick="selectConversation(${conv.id})">
                ${isUnreplied ? '<div class="unread-indicator-dot" title="Tin nhắn chưa phản hồi"></div>' : ''}
                
                <div class="card-top-row">
                    <div class="card-sender-info">
                        <span class="channel-badge-icon">${channelCfg.icon}</span>
                        <span class="card-sender-name">${escapeHtml(conv.sender_name)}</span>
                    </div>
                    <span class="card-time-ago">${conv.time_ago}</span>
                </div>

                <div class="card-last-message">
                    ${conv.last_message ? escapeHtml(conv.last_message) : '<i>[Bắt đầu hội thoại]</i>'}
                </div>

                <div class="card-bottom-row">
                    <span class="card-tag-badge tag-${conv.tag}">${tagLabel}</span>
                    <div class="assigned-staff-badge" title="Người phụ trách ca">
                        <span class="mini-staff-avatar">${assignedAvatar}</span>
                        <span>${escapeHtml(assignedName)}</span>
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
    const channelCfg = CHANNEL_CONFIG[conversation.channel] || { icon: '<i class="fa-solid fa-comment"></i>', label: conversation.channel };
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('rightSidebar').style.display = 'flex';
    document.getElementById('activeSenderName').innerText = conversation.sender_name;
    document.getElementById('activeAvatar').innerText = conversation.sender_name.charAt(0);
    document.getElementById('activeChannelBadge').innerHTML = `${channelCfg.icon} ${channelCfg.label}`;
    
    const tagBadge = document.getElementById('activeTagBadge');
    tagBadge.innerText = TAG_LABELS[conversation.tag] || conversation.tag;
    tagBadge.className = `card-tag-badge tag-${conversation.tag}`;

    // 2. Xử lý cơ chế khóa View-Only (UC2.2)
    AppState.isViewOnly = is_view_only;
    const lockBanner = document.getElementById('viewOnlyLockBanner');
    const inputArea = document.getElementById('chatInputArea');

    if (is_view_only) {
        // Khóa cứng ô chat, hiện banner xám
        lockBanner.style.display = 'flex';
        inputArea.style.display = 'none';
        document.getElementById('viewOnlyLockText').innerText = 
            `🔒 Chế độ Chỉ xem (View-only) – Hội thoại đang được phụ trách bởi ${conversation.assigned_fullname}. Bạn không có quyền gửi tin nhắn.`;
    } else {
        // Mở khóa nhập liệu bình thường
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
                <a href="${msg.attachment_url}" target="_blank">
                    <img src="${msg.attachment_url}" class="message-attachment-img" alt="Ảnh đính kèm">
                </a>
            </div>
        `;
    }

    div.innerHTML = `
        <div class="message-meta-header">${senderTitle} • ${msg.time_formatted || ''}</div>
        <div class="message-bubble">
            ${escapeHtml(msg.content)}
            ${attachmentHtml}
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
            runSyncPolling(); // Lập tức đồng bộ lại danh sách thẻ
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
 * UC3.1: Nhận diện phím tắt mẫu tin nhắn /1
 */
let shortcutTimeout = null;
function handleShortcutDetect(e) {
    const val = e.target.value;
    const previewBar = document.getElementById('shortcutPreviewBar');

    if (val.trim() === '/1' || val.trim().startsWith('/')) {
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
                `<i class="fa-regular fa-lightbulb"></i> Gợi ý: Gõ <strong>${shortcut}</strong> để điền mẫu <em>${escapeHtml(data.data.template.title)}</em>`;
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
 * Cập nhật Sidebar Phải (Hồ sơ Agent & Gắn nhãn)
 */
function renderProfileSidebar(profile, conv) {
    if (!profile) return;

    document.getElementById('profileCustomerName').innerText = profile.customer_name || conv.sender_name;
    document.getElementById('profilePreferredSize').innerText = profile.preferred_size || 'Chưa xác định';
    document.getElementById('profileRecentPurchases').innerText = profile.recent_purchases || 'Chưa có đơn cũ';
    document.getElementById('scanVersionBadge').innerText = profile.scan_version_label || `v${profile.scan_version}.0`;

    // Huy hiệu cảnh báo Boom Hàng
    const boomBadge = document.getElementById('boomRiskBadge');
    if (profile.is_boom_risk == 1) {
        boomBadge.style.display = 'flex';
        if (profile.boom_note) {
            document.getElementById('boomRiskNote').innerText = profile.boom_note;
        }
    } else {
        boomBadge.style.display = 'none';
    }

    // Chọn đúng Radio nhãn hội thoại
    const radios = document.getElementsByName('convTagRadio');
    for (let r of radios) {
        r.checked = (r.value === conv.tag);
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
            setTimeout(() => {
                renderProfileSidebar(data.data, { tag: 'CHO_CHUYEN_KHOAN', sender_name: data.data.customer_name });
                btn.classList.remove('scanning');
                btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>ĐÃ BÓC TÁCH XONG (v2.0)</span>';
                
                setTimeout(() => {
                    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>QUÉT LẠI DỮ LIỆU (AGENT) ⟳</span>';
                }, 2000);
            }, 600); // Tạo độ trễ hiệu ứng quét
        }
    } catch (err) {
        console.error('Lỗi quét dữ liệu Agent:', err);
        btn.classList.remove('scanning');
    }
}

/**
 * UC3.3 (extend): Sửa thủ công thông tin hồ sơ khách hàng
 */
async function editFieldPrompt(fieldName, fieldTitle) {
    if (!AppState.activeConvId) return;

    const currentVal = (fieldName === 'preferred_size') ? 
        document.getElementById('profilePreferredSize').innerText :
        document.getElementById('profileCustomerName').innerText;

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
            // Cập nhật badge trên header
            const tagBadge = document.getElementById('activeTagBadge');
            tagBadge.innerText = TAG_LABELS[tagValue] || tagValue;
            tagBadge.className = `card-tag-badge tag-${tagValue}`;

            // Cập nhật lại danh sách bên trái
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
    document.getElementById('tabAll').classList.toggle('active', tab === 'all');
    document.getElementById('tabMine').classList.toggle('active', tab === 'mine');
    fetchConversations();
}

/**
 * Bật/tắt lọc Chưa trả lời
 */
function toggleUnrepliedFilter() {
    AppState.unrepliedOnly = !AppState.unrepliedOnly;
    document.getElementById('chipUnreplied').classList.toggle('active', AppState.unrepliedOnly);
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
