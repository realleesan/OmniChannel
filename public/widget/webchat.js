/**
 * JAVASCRIPT: widget/webchat.js
 * Widget chat trực tiếp nhúng trên website bán hàng của shop
 * Tự động đồng bộ tin nhắn 2 chiều giữa khách hàng và nhân viên tư vấn
 */

(function () {
    // Tự động tìm URL gốc API
    const scripts = document.getElementsByTagName('script');
    let baseUrl = '';
    for (let s of scripts) {
        if (s.src && s.src.includes('webchat.js')) {
            baseUrl = s.src.replace(/\/public\/widget\/webchat\.js.*$/, '');
            break;
        }
    }
    if (!baseUrl) {
        baseUrl = window.location.origin + (window.location.pathname.includes('/OmniChannel') ? '/OmniChannel' : '');
    }

    // Nạp file CSS của widget
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${baseUrl}/public/css/widget.css`;
    document.head.appendChild(link);

    // Quản lý danh tính khách hàng bằng LocalStorage
    let customerId = localStorage.getItem('omnichannel_customer_id');
    if (!customerId) {
        customerId = 'web_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('omnichannel_customer_id', customerId);
    }

    let customerName = localStorage.getItem('omnichannel_customer_name') || 'Khách Webchat';
    let activeConvId = localStorage.getItem('omnichannel_active_conv_id') || null;
    let lastMsgId = 0;
    let isWidgetOpen = false;

    // Tạo DOM HTML của Widget
    const root = document.createElement('div');
    root.id = 'omnichannel-webchat-root';
    root.innerHTML = `
        <div class="webchat-window" id="wcWindow">
            <div class="webchat-header">
                <div class="webchat-header-info">
                    <div class="webchat-avatar-badge">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <div class="webchat-title-group">
                        <h4>Tư Vấn Trực Tuyến</h4>
                        <p>Thường trả lời trong vài giây</p>
                    </div>
                </div>
                <button type="button" class="webchat-close-btn" id="wcCloseBtn">&times;</button>
            </div>

            <div class="webchat-customer-intro">
                <span style="font-size:12px;color:#475569;font-weight:600;">Bạn là:</span>
                <input type="text" id="wcCustomerNameInput" class="webchat-name-input" value="${customerName}" title="Nhập tên của bạn">
            </div>

            <div class="webchat-body" id="wcMessagesBody">
                <div class="wc-msg staff">
                    Xin chào! Chúng tôi có thể hỗ trợ thông tin hoặc giải đáp thắc mắc gì cho bạn hôm nay?
                </div>
            </div>

            <div class="webchat-footer">
                <input type="text" id="wcTextInput" class="webchat-input" placeholder="Nhập tin nhắn..." autocomplete="off">
                <button type="button" id="wcSendBtn" class="webchat-send-btn" title="Gửi tin nhắn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>

        <div class="webchat-bubble-toggle" id="wcToggleBtn" title="Chat với nhân viên tư vấn">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        </div>
    `;
    document.body.appendChild(root);

    // Gán sự kiện tương tác
    const toggleBtn = document.getElementById('wcToggleBtn');
    const closeBtn = document.getElementById('wcCloseBtn');
    const windowEl = document.getElementById('wcWindow');
    const sendBtn = document.getElementById('wcSendBtn');
    const textInput = document.getElementById('wcTextInput');
    const nameInput = document.getElementById('wcCustomerNameInput');
    const messagesBody = document.getElementById('wcMessagesBody');

    toggleBtn.addEventListener('click', () => {
        isWidgetOpen = !isWidgetOpen;
        windowEl.style.display = isWidgetOpen ? 'flex' : 'none';
        if (isWidgetOpen) {
            textInput.focus();
            scrollToBottom();
        }
    });

    closeBtn.addEventListener('click', () => {
        isWidgetOpen = false;
        windowEl.style.display = 'none';
    });

    nameInput.addEventListener('change', () => {
        customerName = nameInput.value.trim() || 'Khách Webchat';
        localStorage.setItem('omnichannel_customer_name', customerName);
    });

    sendBtn.addEventListener('click', sendWebchatMessage);
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendWebchatMessage();
        }
    });

    async function sendWebchatMessage() {
        const text = textInput.value.trim();
        if (!text) return;

        textInput.value = '';
        appendMessage(text, 'customer');

        try {
            const formData = new FormData();
            formData.append('action', 'send');
            formData.append('customer_id', customerId);
            formData.append('customer_name', customerName);
            formData.append('content', text);

            const res = await fetch(`${baseUrl}/api/webchat_endpoint.php`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success && data.data) {
                activeConvId = data.data.conversation_id;
                localStorage.setItem('omnichannel_active_conv_id', activeConvId);
                lastMsgId = data.data.message_id;
            }
        } catch (err) {
            console.error('Lỗi gửi webchat:', err);
        }
    }

    function appendMessage(content, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `wc-msg ${type}`;
        msgDiv.innerText = content;
        messagesBody.appendChild(msgDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        messagesBody.scrollTop = messagesBody.scrollHeight;
    }

    // Polling lấy phản hồi từ nhân viên
    setInterval(async () => {
        if (!activeConvId) return;

        try {
            const res = await fetch(`${baseUrl}/api/webchat_endpoint.php?action=get_messages&conversation_id=${activeConvId}&last_msg_id=${lastMsgId}`);
            const data = await res.json();

            if (data.success && data.data && data.data.messages) {
                data.data.messages.forEach(msg => {
                    if (msg.sender_type === 'STAFF') {
                        appendMessage(msg.content, 'staff');
                    }
                    if (msg.id > lastMsgId) {
                        lastMsgId = msg.id;
                    }
                });
            }
        } catch (err) {
            // bỏ qua lỗi polling ngầm
        }
    }, 2500);

})();
