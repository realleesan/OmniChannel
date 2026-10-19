/**
 * OMNICHANNEL WEBCHAT WIDGET
 * Nhúng dễ dàng vào bất kỳ website nào bằng 1 thẻ <script>
 * Tự động đồng bộ tin nhắn 2 chiều với hệ thống OmniChannel CRM
 */

(function () {
    // 1. Xác định URL Backend API
    const currentScript = document.currentScript;
    let endpointUrl = '';
    if (currentScript && currentScript.getAttribute('data-endpoint')) {
        endpointUrl = currentScript.getAttribute('data-endpoint');
    } else if (currentScript && currentScript.src) {
        const urlObj = new URL(currentScript.src);
        endpointUrl = `${urlObj.origin}${urlObj.pathname.substring(0, urlObj.pathname.indexOf('/public/'))}/api/webchat_endpoint.php`;
    } else {
        endpointUrl = 'https://omnichannel.gt.tc/api/webchat_endpoint.php';
    }

    // 2. Khởi tạo trạng thái Widget
    const STORAGE_KEY = 'omni_webchat_session';
    let session = {
        customerId: '',
        customerName: '',
        conversationId: null,
        lastMsgId: 0
    };

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            session = Object.assign(session, JSON.parse(saved));
        }
    } catch (e) {}

    let isOpen = false;
    let isSending = false;
    let pollInterval = null;

    // 3. Chèn CSS Styling trực tiếp vào DOM (Không gây xung đột với website chủ)
    const style = document.createElement('style');
    style.innerHTML = `
        .omni-chat-launcher {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 58px;
            height: 58px;
            border-radius: 50%;
            background: linear-gradient(135deg, #10B981, #059669);
            box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 999999;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            color: #FFFFFF;
        }
        .omni-chat-launcher:hover {
            transform: scale(1.08) rotate(5deg);
            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5);
        }
        .omni-chat-launcher svg {
            width: 26px;
            height: 26px;
            fill: currentColor;
            transition: transform 0.2s;
        }

        .omni-chat-box {
            position: fixed;
            bottom: 96px;
            right: 24px;
            width: 360px;
            max-width: calc(100vw - 32px);
            height: 520px;
            max-height: calc(100vh - 120px);
            background: #FFFFFF;
            border-radius: 16px;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            z-index: 999999;
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            pointer-events: none;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            border: 1px solid rgba(0, 0, 0, 0.08);
        }
        .omni-chat-box.open {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }

        .omni-chat-header {
            background: linear-gradient(135deg, #10B981, #059669);
            color: #FFFFFF;
            padding: 16px 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .omni-header-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .omni-header-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }
        .omni-header-title {
            font-size: 15px;
            font-weight: 700;
            line-height: 1.2;
        }
        .omni-header-subtitle {
            font-size: 11.5px;
            opacity: 0.9;
        }
        .omni-close-btn {
            background: transparent;
            border: none;
            color: #FFFFFF;
            cursor: pointer;
            padding: 4px;
            font-size: 18px;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        .omni-close-btn:hover { opacity: 1; }

        .omni-chat-messages {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            background: #F8FAFC;
        }
        .omni-msg {
            max-width: 80%;
            display: flex;
            flex-direction: column;
        }
        .omni-msg.customer {
            align-self: flex-end;
            align-items: flex-end;
        }
        .omni-msg.staff {
            align-self: flex-start;
            align-items: flex-start;
        }
        .omni-bubble {
            padding: 9px 13px;
            border-radius: 14px;
            font-size: 13.5px;
            line-height: 1.4;
            word-break: break-word;
        }
        .omni-msg.customer .omni-bubble {
            background: #10B981;
            color: #FFFFFF;
            border-bottom-right-radius: 4px;
        }
        .omni-msg.staff .omni-bubble {
            background: #FFFFFF;
            color: #0F172A;
            border: 1px solid #E2E8F0;
            border-bottom-left-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .omni-time {
            font-size: 10px;
            color: #94A3B8;
            margin-top: 3px;
        }

        .omni-chat-input-area {
            padding: 12px;
            background: #FFFFFF;
            border-top: 1px solid #E2E8F0;
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .omni-input {
            flex: 1;
            border: 1px solid #CBD5E1;
            border-radius: 20px;
            padding: 9px 14px;
            font-size: 13.5px;
            outline: none;
            transition: border-color 0.2s;
        }
        .omni-input:focus {
            border-color: #10B981;
        }
        .omni-send-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #10B981;
            border: none;
            color: #FFFFFF;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
            flex-shrink: 0;
        }
        .omni-send-btn:hover { background: #059669; }
        .omni-send-btn svg { width: 16px; height: 16px; fill: currentColor; }
    `;
    document.head.appendChild(style);

    // 4. Tạo các phần tử HTML của Widget
    const launcher = document.createElement('div');
    launcher.className = 'omni-chat-launcher';
    launcher.setAttribute('title', 'Nhắn tin hỗ trợ');
    launcher.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
    `;

    const chatBox = document.createElement('div');
    chatBox.className = 'omni-chat-box';
    chatBox.innerHTML = `
        <div class="omni-chat-header">
            <div class="omni-header-info">
                <div class="omni-header-avatar">💬</div>
                <div>
                    <div class="omni-header-title">Hỗ Trợ Khách Hàng</div>
                    <div class="omni-header-subtitle">Thường phản hồi trong vài phút</div>
                </div>
            </div>
            <button class="omni-close-btn">&times;</button>
        </div>
        <div class="omni-chat-messages" id="omniWidgetMessages">
            <div class="omni-msg staff">
                <div class="omni-bubble">Xin chào bạn! Shop có thể tư vấn sản phẩm gì cho bạn hôm nay ạ?</div>
                <div class="omni-time">Vừa xong</div>
            </div>
        </div>
        <div class="omni-chat-input-area">
            <input type="text" class="omni-input" id="omniWidgetInput" placeholder="Nhập tin nhắn của bạn...">
            <button class="omni-send-btn" id="omniWidgetSend">
                <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
        </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(chatBox);

    // 5. Gắn sự kiện tương tác
    launcher.addEventListener('click', toggleChat);
    chatBox.querySelector('.omni-close-btn').addEventListener('click', toggleChat);

    const input = chatBox.querySelector('#omniWidgetInput');
    const sendBtn = chatBox.querySelector('#omniWidgetSend');

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    });

    function toggleChat() {
        isOpen = !isOpen;
        chatBox.classList.toggle('open', isOpen);
        if (isOpen) {
            input.focus();
            initSession();
            startPolling();
        } else {
            stopPolling();
        }
    }

    // 6. Khởi tạo phiên trò chuyện với Backend API
    async function initSession() {
        try {
            const formData = new FormData();
            formData.append('action', 'init');
            if (session.customerId) formData.append('customer_id', session.customerId);
            if (session.customerName) formData.append('customer_name', session.customerName);

            const res = await fetch(endpointUrl, { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                session.customerId = data.customer_id;
                session.customerName = data.customer_name;
                session.conversationId = data.conversation_id;
                saveSession();

                // Nạp lịch sử tin nhắn cũ nếu có
                if (data.messages && data.messages.length > 0) {
                    renderMessageHistory(data.messages);
                }
            }
        } catch (e) {
            console.warn('Lỗi kết nối Webchat Backend:', e);
        }
    }

    // 7. Gửi tin nhắn từ Widget lên Backend
    async function handleSend() {
        const text = input.value.trim();
        if (!text || isSending) return;

        isSending = true;
        input.value = '';

        // Hiển thị tin nhắn ngay lập tức trên UI
        appendMessage('CUSTOMER', text, 'Vừa xong');

        try {
            const formData = new FormData();
            formData.append('action', 'send');
            formData.append('customer_id', session.customerId);
            formData.append('customer_name', session.customerName);
            formData.append('content', text);

            const res = await fetch(endpointUrl, { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                session.customerId = data.customer_id;
                session.conversationId = data.conversation_id;
                session.lastMsgId = Math.max(session.lastMsgId, data.message_id || 0);
                saveSession();
            }
        } catch (e) {
            console.error('Lỗi gửi tin nhắn Webchat:', e);
        } finally {
            isSending = false;
        }
    }

    // 8. Polling nhận tin nhắn phản hồi từ nhân viên
    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(pollUpdates, 3000);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    async function pollUpdates() {
        if (!session.conversationId) return;

        try {
            const res = await fetch(`${endpointUrl}?action=poll&conversation_id=${session.conversationId}&last_msg_id=${session.lastMsgId}`);
            const data = await res.json();

            if (data.success && data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    if (msg.id > session.lastMsgId) {
                        session.lastMsgId = msg.id;
                        if (msg.sender_type === 'STAFF') {
                            appendMessage('STAFF', msg.content, msg.time_formatted || 'Vừa xong');
                        }
                    }
                });
                saveSession();
            }
        } catch (e) {}
    }

    function appendMessage(senderType, content, time) {
        const container = chatBox.querySelector('#omniWidgetMessages');
        const div = document.createElement('div');
        div.className = `omni-msg ${senderType.toLowerCase()}`;
        div.innerHTML = `
            <div class="omni-bubble">${escapeHtml(content)}</div>
            <div class="omni-time">${time}</div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function renderMessageHistory(messages) {
        const container = chatBox.querySelector('#omniWidgetMessages');
        container.innerHTML = '';
        messages.forEach(msg => {
            appendMessage(msg.sender_type, msg.content, msg.time_formatted || '');
            if (msg.id > session.lastMsgId) session.lastMsgId = msg.id;
        });
    }

    function saveSession() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (e) {}
    }

    function escapeHtml(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
})();
