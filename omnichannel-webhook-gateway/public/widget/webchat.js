/**
 * OMNICHANNEL WEBCHAT WIDGET
 * Nhúng dễ dàng vào bất kỳ website nào bằng 1 thẻ <script>
 * Kết nối đồng bộ 2 chiều thời gian thực với OmniChannel Agent Workspace
 */

(function () {
    if (window.__OMNICHANNEL_WEBCHAT_LOADED__) return;
    window.__OMNICHANNEL_WEBCHAT_LOADED__ = true;

    // 1. Xác định URL Backend API Gateway
    const currentScript = document.currentScript || document.querySelector('script[src*="webchat.js"]');
    const endpointUrl = currentScript?.getAttribute('data-endpoint') || 'https://omnichannel-gateway.onrender.com/api/webchat';

    // 2. Trạng thái phiên chat (lưu trữ theo LocalStorage của trình duyệt khách)
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

    // 3. Khởi tạo Widget an toàn khi DOM sẵn sàng
    function mountWidget() {
        if (!document.body) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', mountWidget);
            } else {
                window.addEventListener('load', mountWidget);
            }
            return;
        }

        if (document.getElementById('omni-chat-launcher')) return;

        // Chèn CSS độc lập với độ ưu tiên cao nhất
        const style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.innerHTML = `
            #omni-chat-launcher {
                position: fixed !important;
                bottom: 24px !important;
                right: 24px !important;
                width: 60px !important;
                height: 60px !important;
                border-radius: 50% !important;
                background: linear-gradient(135deg, #10B981, #059669) !important;
                box-shadow: 0 4px 20px rgba(16, 185, 129, 0.45) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                z-index: 2147483647 !important;
                color: #FFFFFF !important;
                transition: transform 0.25s ease, box-shadow 0.25s ease !important;
                box-sizing: border-box !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                outline: none !important;
            }
            #omni-chat-launcher:hover {
                transform: scale(1.08) !important;
                box-shadow: 0 6px 24px rgba(16, 185, 129, 0.6) !important;
            }
            #omni-chat-launcher svg {
                width: 28px !important;
                height: 28px !important;
                fill: #FFFFFF !important;
                pointer-events: none !important;
            }

            #omni-chat-box {
                position: fixed !important;
                bottom: 96px !important;
                right: 24px !important;
                width: 380px !important;
                max-width: calc(100vw - 32px) !important;
                height: 520px !important;
                max-height: calc(100vh - 120px) !important;
                background: #FFFFFF !important;
                border-radius: 16px !important;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18) !important;
                display: none !important;
                flex-direction: column !important;
                overflow: hidden !important;
                z-index: 2147483647 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                border: 1px solid rgba(0, 0, 0, 0.08) !important;
                box-sizing: border-box !important;
            }
            #omni-chat-box.open {
                display: flex !important;
            }

            .omni-chat-header {
                background: linear-gradient(135deg, #10B981, #059669) !important;
                color: #FFFFFF !important;
                padding: 14px 18px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                box-sizing: border-box !important;
            }
            .omni-header-info {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
            }
            .omni-header-avatar {
                width: 36px !important;
                height: 36px !important;
                border-radius: 50% !important;
                background: rgba(255, 255, 255, 0.2) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            .omni-header-avatar svg {
                width: 20px !important;
                height: 20px !important;
                fill: #FFFFFF !important;
            }
            .omni-header-title {
                font-size: 15px !important;
                font-weight: 700 !important;
                line-height: 1.2 !important;
                color: #FFFFFF !important;
            }
            .omni-header-subtitle {
                font-size: 11.5px !important;
                opacity: 0.9 !important;
                color: #E2E8F0 !important;
            }
            .omni-close-btn {
                background: transparent !important;
                border: none !important;
                color: #FFFFFF !important;
                cursor: pointer !important;
                padding: 4px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                opacity: 0.8 !important;
                transition: opacity 0.2s !important;
                outline: none !important;
            }
            .omni-close-btn:hover { opacity: 1 !important; }
            .omni-close-btn svg { width: 20px !important; height: 20px !important; fill: #FFFFFF !important; }

            .omni-chat-messages {
                flex: 1 !important;
                padding: 16px !important;
                overflow-y: auto !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 12px !important;
                background: #F8FAFC !important;
                box-sizing: border-box !important;
            }
            .omni-msg {
                max-width: 82% !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .omni-msg.customer {
                align-self: flex-end !important;
                align-items: flex-end !important;
            }
            .omni-msg.staff {
                align-self: flex-start !important;
                align-items: flex-start !important;
            }
            .omni-bubble {
                padding: 10px 14px !important;
                border-radius: 14px !important;
                font-size: 13.5px !important;
                line-height: 1.45 !important;
                word-break: break-word !important;
                box-sizing: border-box !important;
            }
            .omni-msg.customer .omni-bubble {
                background: #10B981 !important;
                color: #FFFFFF !important;
                border-bottom-right-radius: 4px !important;
            }
            .omni-msg.staff .omni-bubble {
                background: #FFFFFF !important;
                color: #0F172A !important;
                border: 1px solid #E2E8F0 !important;
                border-bottom-left-radius: 4px !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
            }
            .omni-time {
                font-size: 10.5px !important;
                color: #94A3B8 !important;
                margin-top: 3px !important;
                padding: 0 4px !important;
            }

            .omni-chat-input-area {
                padding: 12px 14px !important;
                background: #FFFFFF !important;
                border-top: 1px solid #E2E8F0 !important;
                display: flex !important;
                gap: 8px !important;
                align-items: center !important;
                box-sizing: border-box !important;
            }
            .omni-input {
                flex: 1 !important;
                border: 1px solid #CBD5E1 !important;
                border-radius: 20px !important;
                padding: 9px 14px !important;
                font-size: 13.5px !important;
                outline: none !important;
                transition: border-color 0.2s !important;
                box-sizing: border-box !important;
                color: #0F172A !important;
                background: #FFFFFF !important;
            }
            .omni-input:focus {
                border-color: #10B981 !important;
            }
            .omni-send-btn {
                width: 36px !important;
                height: 36px !important;
                border-radius: 50% !important;
                background: #10B981 !important;
                border: none !important;
                color: #FFFFFF !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                transition: background 0.2s !important;
                flex-shrink: 0 !important;
                outline: none !important;
                padding: 0 !important;
            }
            .omni-send-btn:hover { background: #059669 !important; }
            .omni-send-btn svg { width: 16px !important; height: 16px !important; fill: #FFFFFF !important; }
        `;
        document.head.appendChild(style);

        // Nút mở Chat
        const launcher = document.createElement('div');
        launcher.id = 'omni-chat-launcher';
        launcher.setAttribute('title', 'Hỗ trợ trực tuyến');
        launcher.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        `;

        // Khung cửa sổ chat (Không có tin nhắn mẫu ảo)
        const chatBox = document.createElement('div');
        chatBox.id = 'omni-chat-box';
        chatBox.innerHTML = `
            <div class="omni-chat-header">
                <div class="omni-header-info">
                    <div class="omni-header-avatar">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                    </div>
                    <div>
                        <div class="omni-header-title">Hỗ Trợ Khách Hàng</div>
                        <div class="omni-header-subtitle">Thường phản hồi trong vài phút</div>
                    </div>
                </div>
                <button class="omni-close-btn" title="Đóng cửa sổ chat">
                    <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
            <div class="omni-chat-messages" id="omniWidgetMessages">
                <!-- Tin nhắn thật từ cơ sở dữ liệu sẽ tải vào đây -->
            </div>
            <div class="omni-chat-input-area">
                <input type="text" class="omni-input" id="omniWidgetInput" placeholder="Nhập tin nhắn của bạn...">
                <button class="omni-send-btn" id="omniWidgetSend" title="Gửi tin nhắn">
                    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
            </div>
        `;

        document.body.appendChild(launcher);
        document.body.appendChild(chatBox);

        // Gắn sự kiện
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
    }

    // 4. Bật / Tắt khung chat
    function toggleChat() {
        const chatBox = document.getElementById('omni-chat-box');
        if (!chatBox) return;

        isOpen = !isOpen;
        chatBox.classList.toggle('open', isOpen);

        if (isOpen) {
            const input = chatBox.querySelector('#omniWidgetInput');
            if (input) input.focus();
            initSession();
            startPolling();
        } else {
            stopPolling();
        }
    }

    // 5. Gọi API đồng bộ 2 chiều
    async function apiCall(action, payload = {}) {
        let url = endpointUrl;
        let options = {};

        if (action === 'poll') {
            url = `${endpointUrl}/poll?customer_id=${encodeURIComponent(payload.customer_id || '')}&last_msg_id=${payload.last_msg_id || 0}`;
            options = { method: 'GET', mode: 'cors' };
        } else {
            url = `${endpointUrl}/${action}`;
            options = {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            };
        }

        const res = await fetch(url, options);
        return await res.json();
    }

    // 6. Khởi tạo phiên trò chuyện thực tế
    async function initSession() {
        try {
            const data = await apiCall('init', {
                customer_id: session.customerId,
                customer_name: session.customerName
            });

            if (data && data.success) {
                session.customerId = data.customer_id;
                session.customerName = data.customer_name;
                session.conversationId = data.conversation_id;
                saveSession();

                const container = document.getElementById('omniWidgetMessages');
                if (data.messages && data.messages.length > 0) {
                    renderMessageHistory(data.messages);
                } else if (container && container.children.length === 0) {
                    // Hiển thị lời nhắn hướng dẫn nhẹ nhàng khi chưa có tin nhắn nào
                    container.innerHTML = `
                        <div id="omniEmptyHint" style="text-align:center;padding:30px 16px;color:#94a3b8;font-size:13px;">
                            <div style="font-weight:600;color:#475569;margin-bottom:6px;">Chào mừng bạn đến với hỗ trợ trực tuyến!</div>
                            Hãy nhập tin nhắn bên dưới để bắt đầu kết nối với nhân viên tư vấn.
                        </div>
                    `;
                }
            }
        } catch (e) {
            console.warn('Lỗi kết nối Webchat Gateway:', e);
        }
    }

    // 7. Gửi tin nhắn thực tế lên hệ thống
    async function handleSend() {
        const chatBox = document.getElementById('omni-chat-box');
        if (!chatBox) return;
        const input = chatBox.querySelector('#omniWidgetInput');
        const text = input.value.trim();
        if (!text || isSending) return;

        isSending = true;
        input.value = '';

        // Xóa gợi ý trống nếu có
        const emptyHint = document.getElementById('omniEmptyHint');
        if (emptyHint) emptyHint.remove();

        // Hiển thị ngay tin nhắn của khách
        appendMessage('CUSTOMER', text, 'Vừa xong');

        try {
            const data = await apiCall('send', {
                customer_id: session.customerId,
                customer_name: session.customerName,
                content: text
            });

            if (data && data.success) {
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

    // 8. Polling kéo tin nhắn trả lời từ nhân viên
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
        if (!session.customerId) return;

        try {
            const data = await apiCall('poll', {
                customer_id: session.customerId,
                last_msg_id: session.lastMsgId
            });

            if (data && data.success && data.messages && data.messages.length > 0) {
                const emptyHint = document.getElementById('omniEmptyHint');
                if (emptyHint) emptyHint.remove();

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
        const container = document.getElementById('omniWidgetMessages');
        if (!container) return;
        const div = document.createElement('div');
        div.className = `omni-msg ${senderType.toLowerCase()}`;
        div.innerHTML = `
            <div class="omni-bubble">${escapeHtml(content)}</div>
            <div class="omni-time">${escapeHtml(time)}</div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function renderMessageHistory(messages) {
        const container = document.getElementById('omniWidgetMessages');
        if (!container) return;
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountWidget);
    } else {
        mountWidget();
    }
})();
