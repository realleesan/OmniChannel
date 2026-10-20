/**
 * OMNICHANNEL WEBCHAT WIDGET
 * Nhúng dễ dàng vào bất kỳ website nào bằng 1 thẻ <script>
 * Hỗ trợ Pre-Chat Form thu thập thông tin khách hàng (Họ tên, SĐT)
 * Tự động ghi nhớ qua LocalStorage & Đồng bộ 2 chiều thời gian thực với Agent Workspace
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
        customerPhone: '',
        conversationId: null,
        lastMsgId: 0
    };

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            session = Object.assign(session, JSON.parse(saved));
        }
    } catch (e) {}

    // Kiểm tra xem khách đã nhập họ tên thực tế chưa
    function hasRealName() {
        return Boolean(
            session.customerName &&
            session.customerName.trim().length >= 2 &&
            !session.customerName.trim().startsWith('Khách Web ')
        );
    }

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
                height: 540px !important;
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
                flex-shrink: 0 !important;
            }
            .omni-header-info {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                overflow: hidden !important;
            }
            .omni-header-avatar {
                width: 38px !important;
                height: 38px !important;
                border-radius: 50% !important;
                background: rgba(255, 255, 255, 0.2) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex-shrink: 0 !important;
            }
            .omni-header-avatar svg {
                width: 22px !important;
                height: 22px !important;
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
                opacity: 0.95 !important;
                color: #E2E8F0 !important;
                margin-top: 2px !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            .omni-header-subtitle a {
                color: #A7F3D0 !important;
                text-decoration: underline !important;
                cursor: pointer !important;
                margin-left: 4px !important;
            }
            .omni-header-btn {
                background: rgba(255, 255, 255, 0.18) !important;
                border: none !important;
                width: 26px !important;
                height: 26px !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                color: #FFFFFF !important;
                transition: background 0.2s !important;
                padding: 0 !important;
                outline: none !important;
                flex-shrink: 0 !important;
            }
            .omni-header-btn:hover { background: rgba(255, 255, 255, 0.35) !important; }
            .omni-header-btn svg { width: 14px !important; height: 14px !important; fill: #FFFFFF !important; }

            .omni-close-btn {
                background: transparent !important;
                border: none !important;
                color: #FFFFFF !important;
                cursor: pointer !important;
                padding: 4px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                opacity: 0.85 !important;
                transition: opacity 0.2s !important;
                outline: none !important;
                flex-shrink: 0 !important;
            }
            .omni-close-btn:hover { opacity: 1 !important; }
            .omni-close-btn svg { width: 20px !important; height: 20px !important; fill: #FFFFFF !important; }

            /* PRE-CHAT FORM VIEW */
            #omniPrechatView {
                flex: 1 !important;
                display: flex;
                flex-direction: column !important;
                overflow-y: auto !important;
                padding: 20px 22px !important;
                background: #FFFFFF !important;
                box-sizing: border-box !important;
            }
            #omniPrechatView.omni-hidden {
                display: none !important;
            }
            .omni-welcome-box {
                text-align: center !important;
                margin-bottom: 18px !important;
            }
            .omni-welcome-icon {
                width: 48px !important;
                height: 48px !important;
                border-radius: 50% !important;
                background: #ECFDF5 !important;
                color: #10B981 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin: 0 auto 10px auto !important;
            }
            .omni-welcome-icon svg {
                width: 24px !important;
                height: 24px !important;
                fill: #10B981 !important;
            }
            .omni-welcome-title {
                font-size: 16px !important;
                font-weight: 700 !important;
                color: #0F172A !important;
                margin-bottom: 4px !important;
            }
            .omni-welcome-desc {
                font-size: 12.5px !important;
                color: #64748B !important;
                line-height: 1.45 !important;
            }

            .omni-form-group {
                margin-bottom: 14px !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .omni-form-label {
                font-size: 12.5px !important;
                font-weight: 600 !important;
                color: #334155 !important;
                margin-bottom: 6px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
            }
            .omni-req {
                color: #EF4444 !important;
                font-weight: 700 !important;
                margin-left: 2px !important;
            }
            .omni-opt {
                font-size: 11px !important;
                font-weight: 400 !important;
                color: #94A3B8 !important;
            }
            .omni-form-input, .omni-form-textarea {
                width: 100% !important;
                border: 1px solid #CBD5E1 !important;
                border-radius: 9px !important;
                padding: 10px 12px !important;
                font-size: 13.5px !important;
                color: #0F172A !important;
                background: #F8FAFC !important;
                outline: none !important;
                transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s !important;
                box-sizing: border-box !important;
                font-family: inherit !important;
            }
            .omni-form-input:focus, .omni-form-textarea:focus {
                border-color: #10B981 !important;
                background: #FFFFFF !important;
                box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
            }
            .omni-form-input.is-error {
                border-color: #EF4444 !important;
                background: #FEF2F2 !important;
            }
            .omni-form-error {
                font-size: 11.5px !important;
                color: #EF4444 !important;
                margin-top: 4px !important;
                display: none;
            }
            .omni-form-textarea {
                resize: none !important;
                min-height: 56px !important;
            }

            .omni-prechat-actions {
                margin-top: 8px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
            }
            .omni-form-submit-btn {
                width: 100% !important;
                height: 44px !important;
                background: linear-gradient(135deg, #10B981, #059669) !important;
                border: none !important;
                border-radius: 10px !important;
                color: #FFFFFF !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 8px !important;
                box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35) !important;
                transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s !important;
                outline: none !important;
            }
            .omni-form-submit-btn:hover {
                transform: translateY(-1px) !important;
                box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45) !important;
            }
            .omni-form-submit-btn:active {
                transform: translateY(0) !important;
            }
            .omni-form-submit-btn svg {
                width: 18px !important;
                height: 18px !important;
                fill: #FFFFFF !important;
            }

            .omni-cancel-edit-btn {
                width: 100% !important;
                background: transparent !important;
                border: 1px solid #CBD5E1 !important;
                border-radius: 8px !important;
                padding: 8px 12px !important;
                color: #64748B !important;
                font-size: 12.5px !important;
                font-weight: 500 !important;
                cursor: pointer !important;
                transition: background 0.2s !important;
            }
            .omni-cancel-edit-btn:hover {
                background: #F1F5F9 !important;
                color: #334155 !important;
            }

            .omni-form-footer-note {
                font-size: 11px !important;
                color: #94A3B8 !important;
                text-align: center !important;
                margin-top: 14px !important;
                line-height: 1.4 !important;
            }

            /* CONVERSATION VIEW */
            #omniConversationView {
                flex: 1 !important;
                display: none !important;
                flex-direction: column !important;
                overflow: hidden !important;
            }
            #omniConversationView.omni-active {
                display: flex !important;
            }

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
                flex-shrink: 0 !important;
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

        // Nút Launcher nổi mở Chat
        const launcher = document.createElement('div');
        launcher.id = 'omni-chat-launcher';
        launcher.setAttribute('title', 'Hỗ trợ trực tuyến');
        launcher.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        `;

        // Khung cửa sổ chat
        const chatBox = document.createElement('div');
        chatBox.id = 'omni-chat-box';
        chatBox.innerHTML = `
            <!-- HEADER CHUNG -->
            <div class="omni-chat-header">
                <div class="omni-header-info">
                    <div class="omni-header-avatar">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                    </div>
                    <div style="overflow:hidden;">
                        <div class="omni-header-title">Hỗ Trợ Khách Hàng</div>
                        <div class="omni-header-subtitle" id="omniHeaderSubtitle">Thường phản hồi trong vài phút</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <button class="omni-close-btn" id="omniCloseBtn" title="Đóng cửa sổ chat">
                        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                </div>
            </div>

            <!-- VIEW 1: PRE-CHAT FORM (XIN THÔNG TIN KHÁCH) -->
            <div id="omniPrechatView">
                <div class="omni-welcome-box">
                    <div class="omni-welcome-icon">
                        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>
                    </div>
                    <div class="omni-welcome-title">Xin chào quý khách!</div>
                    <div class="omni-welcome-desc">Vui lòng để lại tên để tư vấn viên kết nối và hỗ trợ bạn chu đáo nhất.</div>
                </div>

                <form id="omniPrechatForm" novalidate>
                    <div class="omni-form-group">
                        <label class="omni-form-label" for="omniInputName">
                            <span>Họ và tên <span class="omni-req">*</span></span>
                        </label>
                        <input type="text" id="omniInputName" class="omni-form-input" placeholder="Ví dụ: Hoàng Long" autocomplete="name" required>
                        <div class="omni-form-error" id="omniNameError">Vui lòng nhập họ và tên (tối thiểu 2 ký tự)</div>
                    </div>

                    <div class="omni-form-group">
                        <label class="omni-form-label" for="omniInputPhone">
                            <span>SĐT</span>
                            <span class="omni-opt">Không bắt buộc</span>
                        </label>
                        <input type="tel" id="omniInputPhone" class="omni-form-input" placeholder="Ví dụ: 0912 345 678" autocomplete="tel">
                    </div>

                    <div class="omni-form-group">
                        <label class="omni-form-label" for="omniInputInitialMsg">
                            <span>Lời nhắn đầu tiên</span>
                            <span class="omni-opt">Không bắt buộc</span>
                        </label>
                        <textarea id="omniInputInitialMsg" class="omni-form-textarea" placeholder="Nhập câu hỏi hoặc sản phẩm cần tư vấn..." rows="2"></textarea>
                    </div>

                    <div class="omni-prechat-actions">
                        <button type="submit" id="omniBtnStartChat" class="omni-form-submit-btn">
                            <span>Bắt đầu trò chuyện</span>
                            <svg viewBox="0 0 24 24"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-7.85-1.42 1.42L16.86 11H5v2z"/></svg>
                        </button>
                        <button type="button" id="omniBtnCancelEdit" class="omni-cancel-edit-btn" style="display:none;">
                            Quay lại cuộc trò chuyện
                        </button>
                    </div>

                    <div class="omni-form-footer-note">
                        Thông tin được lưu tự động cho các lần truy cập tiếp theo.
                        <div id="omniClearDataRow" style="margin-top:8px;display:none;">
                            <a href="javascript:void(0)" id="omniBtnClearStoredData" style="color:#EF4444;text-decoration:underline;cursor:pointer;font-size:11.5px;">Xóa phiên đã lưu & làm mới</a>
                        </div>
                    </div>
                </form>
            </div>

            <!-- VIEW 2: KHUNG HỘI THOẠI TRÒ CHUYỆN -->
            <div id="omniConversationView">
                <div class="omni-chat-messages" id="omniWidgetMessages">
                    <!-- Tin nhắn thời gian thực hiển thị tại đây -->
                </div>
                <div class="omni-chat-input-area">
                    <input type="text" class="omni-input" id="omniWidgetInput" placeholder="Nhập tin nhắn của bạn...">
                    <button class="omni-send-btn" id="omniWidgetSend" title="Gửi tin nhắn">
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(launcher);
        document.body.appendChild(chatBox);

        // Gắn sự kiện Launcher, Close và Reset Session
        launcher.addEventListener('click', toggleChat);
        chatBox.querySelector('#omniCloseBtn').addEventListener('click', toggleChat);

        const resetBtn = chatBox.querySelector('#omniResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', resetSession);

        const btnClearData = chatBox.querySelector('#omniBtnClearStoredData');
        if (btnClearData) btnClearData.addEventListener('click', resetSession);

        // Sự kiện gửi tin nhắn trong Conversation View
        const input = chatBox.querySelector('#omniWidgetInput');
        const sendBtn = chatBox.querySelector('#omniWidgetSend');
        sendBtn.addEventListener('click', () => handleSend());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
            }
        });

        // Sự kiện Submit Form Pre-Chat
        const prechatForm = chatBox.querySelector('#omniPrechatForm');
        prechatForm.addEventListener('submit', handlePrechatSubmit);

        // Sự kiện Nút Hủy Sửa thông tin (Quay lại chat)
        const btnCancelEdit = chatBox.querySelector('#omniBtnCancelEdit');
        btnCancelEdit.addEventListener('click', () => {
            showConversationView();
        });

        // Sự kiện bỏ đỏ input khi khách gõ
        const inputName = chatBox.querySelector('#omniInputName');
        inputName.addEventListener('input', () => {
            inputName.classList.remove('is-error');
            const errEl = chatBox.querySelector('#omniNameError');
            if (errEl) errEl.style.display = 'none';
        });

        // Thiết lập trạng thái view ban đầu
        if (hasRealName()) {
            showConversationView();
        } else {
            showPrechatView();
        }
    }

    // 4. Bật / Tắt khung chat
    function toggleChat() {
        const chatBox = document.getElementById('omni-chat-box');
        if (!chatBox) return;

        isOpen = !isOpen;
        chatBox.classList.toggle('open', isOpen);

        if (isOpen) {
            if (hasRealName()) {
                // Đã có tên -> Vào thẳng phòng chat
                showConversationView();
                initSession();
                startPolling();
            } else {
                // Chưa có tên -> Hiển thị Pre-Chat Form
                showPrechatView();
            }
        } else {
            stopPolling();
        }
    }

    // Hiển thị giao diện Pre-Chat Form
    function showPrechatView(isEditing = false) {
        const prechatView = document.getElementById('omniPrechatView');
        const convView = document.getElementById('omniConversationView');
        const btnCancelEdit = document.getElementById('omniBtnCancelEdit');
        const inputName = document.getElementById('omniInputName');
        const inputPhone = document.getElementById('omniInputPhone');
        const inputInitial = document.getElementById('omniInputInitialMsg');
        const subtitle = document.getElementById('omniHeaderSubtitle');

        if (prechatView) {
            prechatView.classList.remove('omni-hidden');
            prechatView.style.setProperty('display', 'flex', 'important');
        }
        if (convView) {
            convView.classList.remove('omni-active');
            convView.style.setProperty('display', 'none', 'important');
        }

        if (subtitle) {
            subtitle.innerHTML = 'Vui lòng cung cấp thông tin liên hệ';
        }

        if (inputName) {
            inputName.value = (session.customerName && !session.customerName.startsWith('Khách Web ')) ? session.customerName : '';
            inputName.classList.remove('is-error');
        }
        if (inputPhone) {
            inputPhone.value = session.customerPhone || '';
        }
        if (inputInitial) {
            inputInitial.value = '';
        }

        if (btnCancelEdit) {
            btnCancelEdit.style.display = isEditing ? 'block' : 'none';
        }

        const clearRow = document.getElementById('omniClearDataRow');
        if (clearRow) {
            clearRow.style.display = (session.customerName || session.customerId) ? 'block' : 'none';
        }

        setTimeout(() => {
            if (inputName) inputName.focus();
        }, 100);
    }

    // Hiển thị giao diện Hội thoại Chat
    function showConversationView() {
        const prechatView = document.getElementById('omniPrechatView');
        const convView = document.getElementById('omniConversationView');
        const subtitle = document.getElementById('omniHeaderSubtitle');
        const input = document.getElementById('omniWidgetInput');

        if (prechatView) {
            prechatView.classList.add('omni-hidden');
            prechatView.style.setProperty('display', 'none', 'important');
        }
        if (convView) {
            convView.classList.add('omni-active');
            convView.style.setProperty('display', 'flex', 'important');
        }

        // Cập nhật Subtitle hiển thị tên khách, nút đổi tên và nút bắt đầu mới
        if (subtitle) {
            const displayName = session.customerName || 'Quý khách';
            subtitle.innerHTML = `Xin chào, <strong>${escapeHtml(displayName)}</strong> · <a href="javascript:void(0)" id="omniBtnEditProfile">Đổi tên</a> · <a href="javascript:void(0)" id="omniBtnResetSession" style="color:#FEE2E2;margin-left:4px;" title="Xóa lịch sử và bắt đầu lại">Bắt đầu mới</a>`;
            const editBtn = subtitle.querySelector('#omniBtnEditProfile');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    showPrechatView(true);
                });
            }
            const resetLink = subtitle.querySelector('#omniBtnResetSession');
            if (resetLink) {
                resetLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    resetSession();
                });
            }
        }

        setTimeout(() => {
            if (input) input.focus();
        }, 100);
    }

    // Xóa sạch phiên chat và bắt đầu mới hoàn toàn
    function resetSession() {
        if (!confirm('Bạn có chắc chắn muốn xóa phiên chat hiện tại và bắt đầu cuộc trò chuyện mới?')) {
            return;
        }
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        session = {
            customerId: '',
            customerName: '',
            customerPhone: '',
            conversationId: null,
            lastMsgId: 0
        };
        stopPolling();
        const msgContainer = document.getElementById('omniWidgetMessages');
        if (msgContainer) msgContainer.innerHTML = '';
        const inputName = document.getElementById('omniInputName');
        const inputPhone = document.getElementById('omniInputPhone');
        const inputInitial = document.getElementById('omniInputInitialMsg');
        if (inputName) inputName.value = '';
        if (inputPhone) inputPhone.value = '';
        if (inputInitial) inputInitial.value = '';
        showPrechatView(false);
    }

    // Xử lý nộp form Pre-Chat
    async function handlePrechatSubmit(e) {
        e.preventDefault();

        const inputName = document.getElementById('omniInputName');
        const inputPhone = document.getElementById('omniInputPhone');
        const inputInitial = document.getElementById('omniInputInitialMsg');
        const nameError = document.getElementById('omniNameError');

        const name = (inputName?.value || '').trim();
        const phone = (inputPhone?.value || '').trim();
        const initialMsg = (inputInitial?.value || '').trim();

        if (name.length < 2) {
            if (inputName) inputName.classList.add('is-error');
            if (nameError) nameError.style.display = 'block';
            if (inputName) inputName.focus();
            return;
        }

        // Tạo customerId duy nhất nếu chưa có
        if (!session.customerId) {
            session.customerId = 'web_' + Math.random().toString(36).substring(2, 10);
        }

        session.customerName = name;
        session.customerPhone = phone;
        saveSession();

        // Chuyển ngay sang màn hình trò chuyện
        showConversationView();

        // Khởi động đồng bộ với Backend Gateway
        try {
            await apiCall('init', {
                customer_id: session.customerId,
                customer_name: session.customerName,
                customer_phone: session.customerPhone
            });
        } catch (err) {}

        // Nếu khách có nhập lời nhắn đầu tiên, gửi ngay lập tức
        if (initialMsg) {
            handleSend(initialMsg);
        } else {
            initSession();
        }

        startPolling();
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
                customer_name: session.customerName,
                customer_phone: session.customerPhone
            });

            if (data && data.success) {
                session.customerId = data.customer_id;
                if (data.customer_name && !data.customer_name.startsWith('Khách Web ')) {
                    session.customerName = data.customer_name;
                }
                session.conversationId = data.conversation_id;
                saveSession();

                const container = document.getElementById('omniWidgetMessages');
                if (data.messages && data.messages.length > 0) {
                    renderMessageHistory(data.messages);
                } else {
                    session.lastMsgId = 0;
                    saveSession();
                    if (container && container.children.length === 0) {
                        container.innerHTML = `
                            <div id="omniEmptyHint" style="text-align:center;padding:26px 16px;color:#94a3b8;font-size:13px;">
                                <div style="font-weight:600;color:#334155;margin-bottom:6px;">Chào mừng ${escapeHtml(session.customerName || 'bạn')}!</div>
                                Hãy nhập tin nhắn bên dưới để trò chuyện cùng nhân viên tư vấn.
                            </div>
                        `;
                    }
                }
            }
        } catch (e) {
            console.warn('Lỗi kết nối Webchat Gateway:', e);
        }
    }

    // 7. Gửi tin nhắn thực tế lên hệ thống
    async function handleSend(customText = null) {
        const chatBox = document.getElementById('omni-chat-box');
        if (!chatBox) return;
        const input = chatBox.querySelector('#omniWidgetInput');
        const text = customText !== null ? customText.trim() : (input ? input.value.trim() : '');
        if (!text || isSending) return;

        isSending = true;
        if (customText === null && input) {
            input.value = '';
        }

        // Xóa gợi ý trống nếu có
        const emptyHint = document.getElementById('omniEmptyHint');
        if (emptyHint) emptyHint.remove();

        // Hiển thị ngay tin nhắn của khách
        appendMessage('CUSTOMER', text, 'Vừa xong');

        try {
            const data = await apiCall('send', {
                customer_id: session.customerId,
                customer_name: session.customerName,
                customer_phone: session.customerPhone,
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
                            appendMessage('STAFF', msg.content, msg.time_formatted || 'Vừa xong', msg.id);
                        }
                    }
                });
                saveSession();
            }
        } catch (e) {}
    }

    function appendMessage(senderType, content, time, msgId = null) {
        const container = document.getElementById('omniWidgetMessages');
        if (!container) return;

        if (msgId && document.getElementById(`omni-msg-${msgId}`)) return;

        const div = document.createElement('div');
        if (msgId) div.id = `omni-msg-${msgId}`;
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
        let maxId = 0;
        messages.forEach(msg => {
            appendMessage(msg.sender_type, msg.content, msg.time_formatted || '', msg.id);
            if (msg.id && msg.id > maxId) maxId = msg.id;
        });
        session.lastMsgId = maxId;
        saveSession();
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
