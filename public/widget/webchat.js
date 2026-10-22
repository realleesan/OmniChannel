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
        lastMsgId: 0,
        unreadCount: 0,
        staffName: '',
        staffAvatar: ''
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
                background: linear-gradient(135deg, #4F46E5, #6366F1) !important;
                box-shadow: 0 4px 20px rgba(79, 70, 229, 0.45) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                z-index: 2147483647 !important;
                color: #FFFFFF !important;
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease !important;
                box-sizing: border-box !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                outline: none !important;
            }
            #omni-chat-launcher:hover {
                transform: scale(1.08) !important;
                box-shadow: 0 6px 24px rgba(79, 70, 229, 0.6) !important;
            }
            #omni-chat-launcher svg {
                width: 28px !important;
                height: 28px !important;
                fill: #FFFFFF !important;
                pointer-events: none !important;
            }
            #omni-unread-badge {
                position: absolute !important;
                top: -3px !important;
                right: -3px !important;
                background: #EF4444 !important;
                color: #FFFFFF !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                min-width: 20px !important;
                height: 20px !important;
                border-radius: 10px !important;
                display: none !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 5px !important;
                box-shadow: 0 2px 6px rgba(239, 68, 68, 0.6) !important;
                border: 2px solid #FFFFFF !important;
                box-sizing: border-box !important;
                animation: omniBadgePulse 1.8s infinite !important;
                z-index: 2147483647 !important;
                line-height: 1 !important;
            }
            #omni-unread-badge.omni-badge-visible {
                display: flex !important;
            }
            @keyframes omniBadgePulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.12); }
                100% { transform: scale(1); }
            }

            #omni-chat-box {
                position: fixed !important;
                bottom: 96px !important;
                right: 24px !important;
                width: 380px !important;
                max-width: calc(100vw - 32px) !important;
                height: 560px !important;
                max-height: calc(100vh - 120px) !important;
                background: #FFFFFF !important;
                border-radius: 16px !important;
                box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18) !important;
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
                background: linear-gradient(135deg, #4F46E5, #6366F1) !important;
                color: #FFFFFF !important;
                padding: 14px 18px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                box-sizing: border-box !important;
                flex-shrink: 0 !important;
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25) !important;
            }
            .omni-header-info {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                overflow: hidden !important;
            }
            .omni-header-avatar {
                position: relative !important;
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
                width: 20px !important;
                height: 20px !important;
                fill: #FFFFFF !important;
            }
            .omni-status-online-dot {
                position: absolute !important;
                bottom: 0px !important;
                right: 0px !important;
                width: 10px !important;
                height: 10px !important;
                border-radius: 50% !important;
                background: #10B981 !important;
                border: 2px solid #4F46E5 !important;
            }
            .omni-header-title {
                font-size: 15px !important;
                font-weight: 700 !important;
                line-height: 1.2 !important;
                color: #FFFFFF !important;
                letter-spacing: -0.2px !important;
            }
            .omni-header-subtitle {
                font-size: 11.5px !important;
                opacity: 0.95 !important;
                color: #E0E7FF !important;
                margin-top: 3px !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                display: flex !important;
                align-items: center !important;
                flex-wrap: wrap !important;
                gap: 4px !important;
            }
            .omni-chip-link {
                background: rgba(255, 255, 255, 0.2) !important;
                color: #FFFFFF !important;
                padding: 1px 7px !important;
                border-radius: 10px !important;
                text-decoration: none !important;
                font-size: 10.5px !important;
                font-weight: 600 !important;
                transition: background 0.15s !important;
                display: inline-block !important;
            }
            .omni-chip-link:hover {
                background: rgba(255, 255, 255, 0.35) !important;
            }
            .omni-chip-reset {
                background: rgba(239, 68, 68, 0.25) !important;
                color: #FEE2E2 !important;
            }
            .omni-chip-reset:hover {
                background: rgba(239, 68, 68, 0.4) !important;
            }
            .omni-close-btn {
                background: rgba(255, 255, 255, 0.15) !important;
                border: none !important;
                color: #FFFFFF !important;
                cursor: pointer !important;
                width: 28px !important;
                height: 28px !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: background 0.2s !important;
                outline: none !important;
                flex-shrink: 0 !important;
            }
            .omni-close-btn:hover { background: rgba(255, 255, 255, 0.3) !important; }
            .omni-close-btn svg { width: 16px !important; height: 16px !important; fill: #FFFFFF !important; }

            /* PRE-CHAT FORM VIEW */
            #omniPrechatView {
                flex: 1 !important;
                display: flex;
                flex-direction: column !important;
                overflow-y: auto !important;
                padding: 22px !important;
                background: #FFFFFF !important;
                box-sizing: border-box !important;
            }
            #omniPrechatView.omni-hidden {
                display: none !important;
            }
            .omni-welcome-box {
                text-align: center !important;
                margin-bottom: 20px !important;
            }
            .omni-welcome-icon {
                width: 50px !important;
                height: 50px !important;
                border-radius: 50% !important;
                background: #EEF2FF !important;
                border: 1px solid #C7D2FE !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin: 0 auto 12px auto !important;
            }
            .omni-welcome-icon svg {
                width: 24px !important;
                height: 24px !important;
                fill: #4F46E5 !important;
            }
            .omni-welcome-title {
                font-size: 16.5px !important;
                font-weight: 700 !important;
                color: #0F172A !important;
                margin-bottom: 4px !important;
            }
            .omni-welcome-desc {
                font-size: 12.5px !important;
                color: #64748B !important;
                line-height: 1.5 !important;
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
                border-radius: 10px !important;
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
                border-color: #4F46E5 !important;
                background: #FFFFFF !important;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15) !important;
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
                min-height: 60px !important;
            }

            .omni-prechat-actions {
                margin-top: 10px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
            }
            .omni-form-submit-btn {
                width: 100% !important;
                height: 44px !important;
                background: linear-gradient(135deg, #4F46E5, #6366F1) !important;
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
                box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35) !important;
                transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s !important;
                outline: none !important;
            }
            .omni-form-submit-btn:hover {
                background: linear-gradient(135deg, #4338CA, #4F46E5) !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 6px 18px rgba(79, 70, 229, 0.45) !important;
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
                scrollbar-width: thin !important;
                scrollbar-color: #CBD5E1 transparent !important;
            }
            .omni-chat-messages::-webkit-scrollbar {
                width: 5px !important;
                height: 5px !important;
            }
            .omni-chat-messages::-webkit-scrollbar-track {
                background: transparent !important;
            }
            .omni-chat-messages::-webkit-scrollbar-thumb {
                background: #CBD5E1 !important;
                border-radius: 10px !important;
            }
            .omni-chat-messages::-webkit-scrollbar-thumb:hover {
                background: #94A3B8 !important;
            }

            .omni-msg {
                max-width: 86% !important;
                box-sizing: border-box !important;
            }
            .omni-msg.customer {
                align-self: flex-end !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-end !important;
            }
            .omni-msg.staff {
                align-self: flex-start !important;
                display: flex !important;
                flex-direction: row !important;
                align-items: flex-end !important;
                gap: 8px !important;
            }

            .omni-staff-avatar {
                width: 28px !important;
                height: 28px !important;
                border-radius: 50% !important;
                background: #EEF2FF !important;
                border: 1px solid #C7D2FE !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex-shrink: 0 !important;
                margin-bottom: 2px !important;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
            }
            .omni-staff-avatar svg {
                width: 14px !important;
                height: 14px !important;
                fill: #4F46E5 !important;
            }

            .omni-bubble-wrap {
                display: flex !important;
                flex-direction: column !important;
                max-width: 100% !important;
            }

            .omni-bubble {
                padding: 10px 14px !important;
                border-radius: 14px !important;
                font-size: 13.5px !important;
                line-height: 1.45 !important;
                word-break: break-word !important;
                white-space: pre-wrap !important;
                box-sizing: border-box !important;
                position: relative !important;
                max-width: 100% !important;
            }
            .omni-bubble-content {
                word-break: break-word !important;
                white-space: pre-wrap !important;
            }

            .omni-msg.customer .omni-bubble {
                background: linear-gradient(135deg, #4F46E5, #6366F1) !important;
                color: #FFFFFF !important;
                border-bottom-right-radius: 4px !important;
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.22) !important;
            }
            .omni-msg.staff .omni-bubble {
                background: #FFFFFF !important;
                color: #0F172A !important;
                border: 1px solid #E2E8F0 !important;
                border-bottom-left-radius: 4px !important;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
            }

            .omni-time {
                font-size: 10px !important;
                margin-top: 4px !important;
                line-height: 1 !important;
                display: block !important;
            }
            .omni-msg.customer .omni-time {
                color: #E0E7FF !important;
                text-align: right !important;
                opacity: 0.9 !important;
            }
            .omni-msg.staff .omni-time {
                color: #94A3B8 !important;
                text-align: left !important;
                opacity: 0.85 !important;
            }

            /* CHAT INPUT AREA */
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
                border-radius: 10px !important;
                padding: 9px 13px !important;
                font-size: 13.5px !important;
                outline: none !important;
                transition: all 0.2s ease !important;
                box-sizing: border-box !important;
                color: #0F172A !important;
                background: #F8FAFC !important;
            }
            .omni-input:focus {
                border-color: #4F46E5 !important;
                background: #FFFFFF !important;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18) !important;
            }
            .omni-attach-btn {
                width: 38px !important;
                height: 38px !important;
                border-radius: 10px !important;
                background: #F1F5F9 !important;
                border: 1px solid #CBD5E1 !important;
                color: #475569 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                flex-shrink: 0 !important;
                outline: none !important;
                padding: 0 !important;
            }
            .omni-attach-btn:hover {
                background: #E2E8F0 !important;
                color: #4F46E5 !important;
                border-color: #C7D2FE !important;
            }
            .omni-attach-btn svg { width: 18px !important; height: 18px !important; fill: currentColor !important; }

            /* MEDIA SMART GRID */
            .omni-media-wrap {
                display: flex !important;
                flex-direction: column !important;
                max-width: 100% !important;
                margin-top: 4px !important;
                position: relative !important;
            }
            .omni-msg.customer .omni-media-wrap {
                align-items: flex-end !important;
            }
            .omni-msg.staff .omni-media-wrap {
                align-items: flex-start !important;
            }
            .omni-media-grid {
                display: grid !important;
                gap: 4px !important;
                max-width: 260px !important;
                border-radius: 12px !important;
                overflow: hidden !important;
                position: relative !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
            }
            .omni-media-grid.grid-1 {
                display: block !important;
                max-width: 240px !important;
            }
            .omni-media-grid.grid-1 img {
                max-width: 100% !important;
                max-height: 220px !important;
                object-fit: cover !important;
                display: block !important;
                border-radius: 12px !important;
            }
            .omni-media-grid.grid-2 {
                grid-template-columns: 1fr 1fr !important;
                max-width: 250px !important;
            }
            .omni-media-grid.grid-2 .omni-media-item {
                aspect-ratio: 1 !important;
            }
            .omni-media-grid.grid-3 {
                grid-template-columns: 2fr 1fr !important;
                grid-template-rows: 1fr 1fr !important;
                max-width: 250px !important;
                height: 180px !important;
            }
            .omni-media-grid.grid-3 .omni-media-item:first-child {
                grid-row: span 2 !important;
                height: 100% !important;
            }
            .omni-media-grid.grid-4, .omni-media-grid.grid-5-plus {
                grid-template-columns: 1fr 1fr !important;
                grid-template-rows: 1fr 1fr !important;
                max-width: 250px !important;
                height: 190px !important;
            }
            .omni-media-item {
                position: relative !important;
                overflow: hidden !important;
                cursor: pointer !important;
                background: #E2E8F0 !important;
                width: 100% !important;
                height: 100% !important;
            }
            .omni-media-item img {
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
                display: block !important;
                transition: transform 0.25s ease !important;
            }
            .omni-media-item:hover img {
                transform: scale(1.05) !important;
            }
            .omni-media-more {
                position: absolute !important;
                inset: 0 !important;
                background: rgba(15, 23, 42, 0.65) !important;
                color: #FFFFFF !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 18px !important;
                font-weight: 800 !important;
                backdrop-filter: blur(2px) !important;
            }
            .omni-media-pill {
                position: absolute !important;
                bottom: 6px !important;
                right: 8px !important;
                background: rgba(15, 23, 42, 0.65) !important;
                color: #FFFFFF !important;
                padding: 2px 6px !important;
                border-radius: 10px !important;
                font-size: 9.5px !important;
                font-weight: 600 !important;
                backdrop-filter: blur(4px) !important;
                pointer-events: none !important;
                z-index: 2 !important;
            }

            /* WIDGET LIGHTBOX OVERLAY */
            .omni-w-lightbox {
                position: fixed !important;
                inset: 0 !important;
                z-index: 2147483647 !important;
                background: rgba(15, 23, 42, 0.95) !important;
                backdrop-filter: blur(10px) !important;
                display: none !important;
                flex-direction: column !important;
                box-sizing: border-box !important;
                user-select: none !important;
            }
            .omni-w-lightbox.is-open { display: flex !important; }
            .omni-w-topbar {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding: 14px 20px !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
                color: #FFFFFF !important;
                flex-shrink: 0 !important;
            }
            .omni-w-info {
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
            }
            .omni-w-avt {
                width: 32px !important;
                height: 32px !important;
                border-radius: 50% !important;
                background: #4F46E5 !important;
                color: #FFFFFF !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-weight: 700 !important;
                font-size: 13px !important;
                overflow: hidden !important;
                border: 1.5px solid rgba(255, 255, 255, 0.2) !important;
            }
            .omni-w-avt img { width: 100% !important; height: 100% !important; object-fit: cover !important; }
            .omni-w-sender { font-size: 14px !important; font-weight: 700 !important; color: #FFFFFF !important; }
            .omni-w-time { font-size: 11.5px !important; color: #94A3B8 !important; }
            .omni-w-counter {
                background: rgba(255, 255, 255, 0.15) !important;
                padding: 3px 10px !important;
                border-radius: 14px !important;
                font-size: 12px !important;
                color: #E2E8F0 !important;
                font-weight: 600 !important;
            }
            .omni-w-actions {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
            }
            .omni-w-btn {
                width: 34px !important;
                height: 34px !important;
                border-radius: 50% !important;
                background: rgba(255, 255, 255, 0.12) !important;
                border: none !important;
                color: #FFFFFF !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                transition: background 0.2s !important;
                outline: none !important;
                text-decoration: none !important;
            }
            .omni-w-btn:hover { background: rgba(255, 255, 255, 0.25) !important; }
            .omni-w-btn svg { width: 16px !important; height: 16px !important; fill: #FFFFFF !important; }
            .omni-w-stage {
                flex: 1 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding: 8px 16px !important;
                position: relative !important;
                overflow: hidden !important;
            }
            .omni-w-nav {
                width: 44px !important;
                height: 44px !important;
                border-radius: 50% !important;
                background: rgba(255, 255, 255, 0.12) !important;
                border: 1px solid rgba(255, 255, 255, 0.18) !important;
                color: #FFFFFF !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                transition: all 0.2s !important;
                outline: none !important;
            }
            .omni-w-nav:hover { background: #6366F1 !important; transform: scale(1.08) !important; }
            .omni-w-nav svg { width: 18px !important; height: 18px !important; fill: #FFFFFF !important; }
            .omni-w-main-box {
                flex: 1 !important;
                height: 100% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 10px !important;
            }
            .omni-w-main-img {
                max-width: 86vw !important;
                max-height: 72vh !important;
                object-fit: contain !important;
                border-radius: 8px !important;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
            }
            .omni-w-strip {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 8px !important;
                padding: 12px 16px !important;
                background: rgba(15, 23, 42, 0.8) !important;
                border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
                overflow-x: auto !important;
                flex-shrink: 0 !important;
            }
            .omni-w-thumb {
                width: 48px !important;
                height: 48px !important;
                border-radius: 6px !important;
                overflow: hidden !important;
                cursor: pointer !important;
                border: 2px solid transparent !important;
                opacity: 0.55 !important;
                transition: all 0.2s !important;
                flex-shrink: 0 !important;
            }
            .omni-w-thumb img { width: 100% !important; height: 100% !important; object-fit: cover !important; }
            .omni-w-thumb:hover { opacity: 0.9 !important; }
            .omni-w-thumb.active {
                opacity: 1 !important;
                border-color: #6366F1 !important;
                transform: scale(1.06) !important;
            }

            .omni-send-btn {
                width: 38px !important;
                height: 38px !important;
                border-radius: 10px !important;
                background: linear-gradient(135deg, #4F46E5, #6366F1) !important;
                border: none !important;
                color: #FFFFFF !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                flex-shrink: 0 !important;
                outline: none !important;
                padding: 0 !important;
                box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25) !important;
            }
            .omni-send-btn:hover {
                background: linear-gradient(135deg, #4338CA, #4F46E5) !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 4px 10px rgba(79, 70, 229, 0.35) !important;
            }
            .omni-send-btn svg { width: 16px !important; height: 16px !important; fill: #FFFFFF !important; }
        `;
        document.head.appendChild(style);

        // Nút Launcher nổi mở Chat
        const launcher = document.createElement('div');
        launcher.id = 'omni-chat-launcher';
        launcher.setAttribute('title', 'Hỗ trợ trực tuyến');
        launcher.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
            <div id="omni-unread-badge" style="display:none;">0</div>
        `;

        // Khung cửa sổ chat
        const chatBox = document.createElement('div');
        chatBox.id = 'omni-chat-box';
        chatBox.innerHTML = `
            <!-- HEADER CHUNG -->
            <div class="omni-chat-header">
                <div class="omni-header-info">
                    <div class="omni-header-avatar" id="omniHeaderAvatar">
                        <svg viewBox="0 0 24 24"><path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/></svg>
                        <span class="omni-status-online-dot"></span>
                    </div>
                    <div style="overflow:hidden;">
                        <div class="omni-header-title" id="omniHeaderTitle">Hỗ Trợ Khách Hàng</div>
                        <div class="omni-header-subtitle" id="omniHeaderSubtitle">Thường phản hồi ngay lập tức</div>
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
                    <input type="file" id="omniWidgetFileInput" accept="image/*" multiple style="display:none;">
                    <button class="omni-attach-btn" id="omniWidgetAttachBtn" type="button" title="Gửi ảnh">
                        <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3 3 0 0 0 6 0V5C15 2.24 12.76 0 10 0S5 2.24 5 5v12.5C5 20.54 7.46 23 10.5 23s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
                    </button>
                    <input type="text" class="omni-input" id="omniWidgetInput" placeholder="Nhập tin nhắn của bạn...">
                    <button class="omni-send-btn" id="omniWidgetSend" title="Gửi tin nhắn">
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(launcher);
        document.body.appendChild(chatBox);

        // Khởi tạo Lightbox Gallery xem ảnh phóng to cho Widget
        const lightbox = document.createElement('div');
        lightbox.id = 'omniWidgetLightbox';
        lightbox.className = 'omni-w-lightbox';
        lightbox.innerHTML = `
            <div class="omni-w-topbar">
                <div class="omni-w-info">
                    <div class="omni-w-avt" id="omniWLightboxAvt">NV</div>
                    <div>
                        <div class="omni-w-sender" id="omniWLightboxSender">Nhân viên tư vấn</div>
                        <div class="omni-w-time" id="omniWLightboxTime">12:00</div>
                    </div>
                </div>
                <div class="omni-w-counter" id="omniWLightboxCounter">Ảnh 1 / 1</div>
                <div class="omni-w-actions">
                    <a id="omniWLightboxDownload" href="#" download target="_blank" class="omni-w-btn" title="Tải xuống">
                        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </a>
                    <button id="omniWLightboxClose" type="button" class="omni-w-btn" title="Đóng (Esc)">
                        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                </div>
            </div>
            <div class="omni-w-stage">
                <button id="omniWLightboxPrev" type="button" class="omni-w-nav" title="Ảnh trước (←)">
                    <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <div class="omni-w-main-box">
                    <img id="omniWLightboxImg" class="omni-w-main-img" src="" alt="Ảnh phóng to" />
                </div>
                <button id="omniWLightboxNext" type="button" class="omni-w-nav" title="Ảnh sau (→)">
                    <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
            </div>
            <div class="omni-w-strip" id="omniWLightboxStrip"></div>
        `;
        document.body.appendChild(lightbox);

        // Đóng lightbox khi click ra nền tối
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.classList.contains('omni-w-stage') || e.target.classList.contains('omni-w-main-box')) {
                closeWidgetLightbox();
            }
        });
        const wCloseBtn = lightbox.querySelector('#omniWLightboxClose');
        if (wCloseBtn) wCloseBtn.addEventListener('click', closeWidgetLightbox);

        const wPrevBtn = lightbox.querySelector('#omniWLightboxPrev');
        if (wPrevBtn) wPrevBtn.addEventListener('click', () => navigateWidgetLightbox(-1));

        const wNextBtn = lightbox.querySelector('#omniWLightboxNext');
        if (wNextBtn) wNextBtn.addEventListener('click', () => navigateWidgetLightbox(1));

        // Phím tắt bàn phím cho Lightbox
        document.addEventListener('keydown', (e) => {
            const lb = document.getElementById('omniWidgetLightbox');
            if (lb && lb.classList.contains('is-open')) {
                if (e.key === 'Escape') closeWidgetLightbox();
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigateWidgetLightbox(-1);
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigateWidgetLightbox(1);
            }
        });

        // Gắn sự kiện gửi file ảnh đính kèm
        const fileInput = chatBox.querySelector('#omniWidgetFileInput');
        const attachBtn = chatBox.querySelector('#omniWidgetAttachBtn');
        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                await handleWidgetFileUpload(files);
                fileInput.value = '';
            });
        }

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
        // Khi người dùng click/focus vào bất kỳ vị trí nào trong chat box -> đánh dấu đã đọc
        chatBox.addEventListener('click', markConversationAsRead);
        input.addEventListener('focus', markConversationAsRead);

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

        // Tự động đánh dấu đã đọc khi chuyển tab quay lại trang nếu widget đang mở
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && isOpen) {
                markConversationAsRead();
            }
        });

        // Khôi phục avatar & tên nhân viên nếu đã lưu trước đó
        if (session.staffName || session.staffAvatar) {
            updateWidgetStaffHeader(session.staffName, session.staffAvatar);
        }

        // Khôi phục hiển thị badge đếm tin chưa đọc
        updateUnreadBadge();

        // Thiết lập trạng thái view ban đầu
        if (hasRealName()) {
            showConversationView();
        } else {
            showPrechatView();
        }

        // Nếu đã từng có phiên chat, chạy Polling ngay lập tức để nhận tin kể cả khi chưa mở widget
        if (session.customerId) {
            startPolling();
        }
    }

    /**
     * Cập nhật thông tin nhân viên (Tên + Avatar chân dung thật) trên thanh Header của Widget
     */
    function updateWidgetStaffHeader(staffName, staffAvatar) {
        if (staffName) session.staffName = staffName;
        if (staffAvatar) session.staffAvatar = staffAvatar;
        saveSession();

        const titleEl = document.getElementById('omniHeaderTitle');
        const avtEl = document.getElementById('omniHeaderAvatar');

        if (titleEl && session.staffName) {
            titleEl.textContent = `${session.staffName} (Tư vấn viên)`;
        }
        if (avtEl && session.staffAvatar) {
            avtEl.innerHTML = `
                <img src="${escapeHtml(session.staffAvatar)}" alt="NV" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
                <span class="omni-status-online-dot"></span>
            `;
        }
    }

    /**
     * Âm thanh thông báo tin nhắn mới phía Widget khách hàng (Synthesizer Chime)
     * Âm lượng to, chuẩn tiêu chuẩn 0.95
     */
    function playWidgetNotificationSound() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const now = ctx.currentTime;

            // Nốt 1 (G5 - 784 Hz, âm lượng to rõ chuẩn 0.90)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(784, now);
            gain1.gain.setValueAtTime(0.90, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            // Nốt 2 (C6 - 1046.5 Hz) ngân sau 0.08s, âm lượng 0.95
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1046.5, now + 0.08);
            gain2.gain.setValueAtTime(0.95, now + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.55);
        } catch (e) {
            console.warn('Widget sound notification warn:', e);
        }
    }

    function isWidgetOpen() {
        const box = document.getElementById('omni-chat-box');
        return Boolean(isOpen || (box && box.classList.contains('open')));
    }

    /**
     * Cập nhật vòng đỏ đếm số tin nhắn chưa đọc trên nút Launcher
     */
    function updateUnreadBadge() {
        const badge = document.getElementById('omni-unread-badge');
        if (!badge) return;
        const currentlyOpen = isWidgetOpen();
        if (currentlyOpen) {
            session.unreadCount = 0;
            badge.textContent = '0';
            badge.style.setProperty('display', 'none', 'important');
            badge.classList.remove('omni-badge-visible');
            return;
        }

        const count = session.unreadCount || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.setProperty('display', 'flex', 'important');
            badge.classList.add('omni-badge-visible');
        } else {
            badge.style.setProperty('display', 'none', 'important');
            badge.textContent = '0';
            badge.classList.remove('omni-badge-visible');
        }
    }

    /**
     * Đánh dấu cuộc trò chuyện đã đọc và gửi báo nhận tới hệ thống
     */
    function markConversationAsRead() {
        session.unreadCount = 0;
        updateUnreadBadge();
        saveSession();
        if (session.customerId) {
            apiCall('read', { customer_id: session.customerId, conversation_id: session.conversationId }).catch(e => {});
            try {
                fetch('http://omnichannel.gt.tc/api/customer_read.php?customer_id=' + encodeURIComponent(session.customerId), { mode: 'cors' }).catch(e => {});
            } catch (e) {}
        }
    }

    // 4. Bật / Tắt khung chat
    function toggleChat() {
        const chatBox = document.getElementById('omni-chat-box');
        if (!chatBox) return;

        isOpen = !isOpen;
        chatBox.classList.toggle('open', isOpen);

        if (isOpen) {
            // Khi mở box chat -> Xóa sạch badge ngay lập tức và gửi báo đã đọc
            session.unreadCount = 0;
            updateUnreadBadge();
            markConversationAsRead();
            if (hasRealName()) {
                // Đã có tên -> Vào thẳng phòng chat
                showConversationView();
                initSession();
            } else {
                // Chưa có tên -> Hiển thị Pre-Chat Form
                showPrechatView();
            }
        } else {
            updateUnreadBadge();
        }
        startPolling();
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
            subtitle.innerHTML = `Xin chào, <strong>${escapeHtml(displayName)}</strong> <a href="javascript:void(0)" class="omni-chip-link" id="omniBtnEditProfile">Đổi tên</a> <a href="javascript:void(0)" class="omni-chip-link omni-chip-reset" id="omniBtnResetSession" title="Xóa lịch sử và bắt đầu lại">Làm mới</a>`;
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
            lastMsgId: 0,
            unreadCount: 0,
            staffName: '',
            staffAvatar: ''
        };
        updateUnreadBadge();
        const titleEl = document.getElementById('omniHeaderTitle');
        const avtEl = document.getElementById('omniHeaderAvatar');
        if (titleEl) titleEl.textContent = 'Hỗ Trợ Khách Hàng';
        if (avtEl) {
            avtEl.innerHTML = `
                <svg viewBox="0 0 24 24"><path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/></svg>
                <span class="omni-status-online-dot"></span>
            `;
        }
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
                if (data.staff_name || data.staff_avatar) {
                    updateWidgetStaffHeader(data.staff_name, data.staff_avatar);
                }
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

    // 7. Gửi tin nhắn thực tế lên hệ thống (hỗ trợ cả văn bản và nhiều ảnh)
    async function handleSend(customText = null, attachments = []) {
        const chatBox = document.getElementById('omni-chat-box');
        if (!chatBox) return;
        const input = chatBox.querySelector('#omniWidgetInput');
        const text = customText !== null ? customText.trim() : (input ? input.value.trim() : '');
        
        let attachmentList = [];
        if (Array.isArray(attachments)) {
            attachmentList = attachments.filter(Boolean);
        } else if (typeof attachments === 'string' && attachments.trim()) {
            attachmentList = parseAttachmentUrls(attachments);
        }

        if (!text && attachmentList.length === 0) return;
        if (isSending) return;

        isSending = true;
        if (customText === null && input) {
            input.value = '';
        }

        // Xóa gợi ý trống nếu có
        const emptyHint = document.getElementById('omniEmptyHint');
        if (emptyHint) emptyHint.remove();

        const attachmentUrlStr = attachmentList.length > 0 ? attachmentList.join(',') : null;

        // Hiển thị ngay tin nhắn của khách lên màn hình
        appendMessage('CUSTOMER', text, '', null, attachmentUrlStr);

        try {
            const data = await apiCall('send', {
                customer_id: session.customerId,
                customer_name: session.customerName,
                customer_phone: session.customerPhone,
                content: text,
                attachment_url: attachmentUrlStr
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

    // Helper: Đọc file thành chuỗi Base64
    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
        });
    }

    // Xử lý tải lên nhiều ảnh từ Webchat Widget
    async function handleWidgetFileUpload(files) {
        const attachBtn = document.getElementById('omniWidgetAttachBtn');
        if (attachBtn) {
            attachBtn.style.opacity = '0.5';
            attachBtn.style.pointerEvents = 'none';
        }

        const uploadedUrls = [];
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const base64Data = await readFileAsBase64(file);
                const res = await fetch(`${endpointUrl}/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: base64Data })
                });
                const resData = await res.json();
                if (resData && resData.success && resData.url) {
                    uploadedUrls.push(resData.url);
                }
            } catch (err) {
                console.error('Lỗi upload ảnh widget:', err);
            }
        }

        if (attachBtn) {
            attachBtn.style.opacity = '1';
            attachBtn.style.pointerEvents = 'auto';
        }

        if (uploadedUrls.length > 0) {
            await handleSend('', uploadedUrls);
        }
    }

    // 8. Polling kéo tin nhắn trả lời từ nhân viên
    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        const intervalTime = isOpen ? 2500 : 4000;
        pollInterval = setInterval(pollUpdates, intervalTime);
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

                let hasNewStaffMsg = false;
                data.messages.forEach(msg => {
                    if (msg.id > session.lastMsgId) {
                        session.lastMsgId = msg.id;
                        if (msg.sender_type === 'STAFF') {
                            hasNewStaffMsg = true;
                            if (msg.staff_name || msg.staff_avatar) {
                                updateWidgetStaffHeader(msg.staff_name, msg.staff_avatar);
                            }
                            appendMessage('STAFF', msg.content, msg.time_formatted || '', msg.id, msg.attachment_url || null, msg.staff_avatar || null, msg.staff_name || null);
                        }
                    }
                });

                if (hasNewStaffMsg) {
                    playWidgetNotificationSound();
                    const currentlyOpen = isWidgetOpen();
                    if (!currentlyOpen) {
                        session.unreadCount = (session.unreadCount || 0) + 1;
                        updateUnreadBadge();
                    } else {
                        session.unreadCount = 0;
                        updateUnreadBadge();
                        markConversationAsRead();
                    }
                }
                saveSession();
            }
        } catch (e) {}
    }

    function formatWidgetTime(timeInput) {
        if (!timeInput || timeInput === 'Vừa xong') {
            const now = new Date();
            return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        }
        if (typeof timeInput === 'string' && /^\d{1,2}:\d{2}$/.test(timeInput.trim())) {
            return timeInput.trim();
        }
        const d = new Date(typeof timeInput === 'string' ? timeInput.replace(/-/g, '/') : timeInput);
        if (!isNaN(d.getTime())) {
            return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }
        return timeInput;
    }

    // Helper: Tách chuỗi URL ảnh thành mảng
    function parseAttachmentUrls(urlInput) {
        if (!urlInput) return [];
        if (Array.isArray(urlInput)) return urlInput.filter(Boolean);
        const trimmed = String(urlInput).trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.filter(Boolean);
            } catch(e) {}
        }
        return trimmed.split(',').map(u => u.trim()).filter(Boolean);
    }

    // Helper: Xây dựng HTML Grid ảnh thông minh (1, 2, 3, 4, 5+ ảnh)
    function buildWidgetMediaGrid(images, timeStr) {
        const count = images.length;
        let gridClass = 'grid-1';
        if (count === 2) gridClass = 'grid-2';
        else if (count === 3) gridClass = 'grid-3';
        else if (count >= 4) gridClass = (count === 4 ? 'grid-4' : 'grid-5-plus');

        let itemsHtml = '';
        const displayCount = Math.min(count, 4);
        for (let i = 0; i < displayCount; i++) {
            const imgUrl = escapeHtml(images[i]);
            const isLastAndMore = (i === 3 && count > 4);
            itemsHtml += `
                <div class="omni-media-item" data-idx="${i}">
                    <img src="${imgUrl}" alt="Ảnh đính kèm" loading="lazy">
                    ${isLastAndMore ? `<div class="omni-media-more">+${count - 4}</div>` : ''}
                </div>
            `;
        }

        return `
            <div class="omni-media-wrap">
                <div class="omni-media-grid ${gridClass}">
                    ${itemsHtml}
                </div>
                <span class="omni-media-pill">${escapeHtml(timeStr)}</span>
            </div>
        `;
    }

    // LIGHTBOX GALLERY TRONG WIDGET
    let widgetGallery = {
        images: [],
        currentIndex: 0,
        senderName: '',
        senderAvatar: '',
        time: ''
    };

    function openWidgetLightbox(images, startIndex, senderName, senderAvatar, time) {
        if (!images || images.length === 0) return;
        widgetGallery = {
            images: images,
            currentIndex: startIndex || 0,
            senderName: senderName || 'Tư vấn viên',
            senderAvatar: senderAvatar || '',
            time: time || ''
        };
        renderWidgetLightbox();
        const modal = document.getElementById('omniWidgetLightbox');
        if (modal) modal.classList.add('is-open');
    }

    function closeWidgetLightbox() {
        const modal = document.getElementById('omniWidgetLightbox');
        if (modal) modal.classList.remove('is-open');
    }

    function navigateWidgetLightbox(step) {
        if (!widgetGallery.images || widgetGallery.images.length === 0) return;
        const total = widgetGallery.images.length;
        widgetGallery.currentIndex = (widgetGallery.currentIndex + step + total) % total;
        renderWidgetLightbox();
    }

    function renderWidgetLightbox() {
        const total = widgetGallery.images.length;
        const currentUrl = widgetGallery.images[widgetGallery.currentIndex];

        const img = document.getElementById('omniWLightboxImg');
        if (img) img.src = currentUrl;

        const counter = document.getElementById('omniWLightboxCounter');
        if (counter) counter.textContent = `Ảnh ${widgetGallery.currentIndex + 1} / ${total}`;

        const senderEl = document.getElementById('omniWLightboxSender');
        if (senderEl) senderEl.textContent = widgetGallery.senderName;

        const timeEl = document.getElementById('omniWLightboxTime');
        if (timeEl) timeEl.textContent = widgetGallery.time;

        const dlBtn = document.getElementById('omniWLightboxDownload');
        if (dlBtn) dlBtn.href = currentUrl;

        const avtEl = document.getElementById('omniWLightboxAvt');
        if (avtEl) {
            if (widgetGallery.senderAvatar) {
                avtEl.innerHTML = `<img src="${widgetGallery.senderAvatar}" alt="">`;
            } else {
                avtEl.textContent = (widgetGallery.senderName || 'NV').substring(0, 2).toUpperCase();
            }
        }

        const prevBtn = document.getElementById('omniWLightboxPrev');
        const nextBtn = document.getElementById('omniWLightboxNext');
        if (prevBtn) prevBtn.style.visibility = (total > 1) ? 'visible' : 'hidden';
        if (nextBtn) nextBtn.style.visibility = (total > 1) ? 'visible' : 'hidden';

        const strip = document.getElementById('omniWLightboxStrip');
        if (strip) {
            if (total <= 1) {
                strip.style.display = 'none';
                strip.innerHTML = '';
            } else {
                strip.style.display = 'flex';
                strip.innerHTML = widgetGallery.images.map((url, idx) => `
                    <div class="omni-w-thumb ${idx === widgetGallery.currentIndex ? 'active' : ''}" data-idx="${idx}">
                        <img src="${url}" alt="">
                    </div>
                `).join('');
                strip.querySelectorAll('.omni-w-thumb').forEach(thumb => {
                    thumb.addEventListener('click', () => {
                        const idx = parseInt(thumb.getAttribute('data-idx'), 10);
                        widgetGallery.currentIndex = idx;
                        renderWidgetLightbox();
                    });
                });
            }
        }
    }

    // Hiển thị tin nhắn dạng bong bóng hoặc lưới ảnh thông minh không bọc khung
    function appendMessage(senderType, content, time, msgId = null, attachmentUrl = null, staffAvatar = null, staffName = null) {
        const container = document.getElementById('omniWidgetMessages');
        if (!container) return;

        if (msgId && document.getElementById(`omni-msg-${msgId}`)) return;

        const isStaff = (senderType === 'STAFF');
        const displayTime = formatWidgetTime(time);
        const images = parseAttachmentUrls(attachmentUrl);
        const hasText = !!(content && content.trim().length > 0);
        const hasImages = (images.length > 0);

        if (!hasText && !hasImages) return;

        const div = document.createElement('div');
        if (msgId) div.id = `omni-msg-${msgId}`;
        div.className = `omni-msg ${isStaff ? 'staff' : 'customer'}`;

        let avatarHtml = '';
        if (isStaff) {
            if (staffAvatar) {
                avatarHtml = `
                    <div class="omni-staff-avatar" title="${escapeHtml(staffName || 'Tư vấn viên')}">
                        <img src="${escapeHtml(staffAvatar)}" alt="NV" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
                    </div>
                `;
            } else {
                avatarHtml = `
                    <div class="omni-staff-avatar" title="Tư vấn viên">
                        <svg viewBox="0 0 24 24"><path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/></svg>
                    </div>
                `;
            }
        }

        let bodyHtml = '';
        if (hasText && !hasImages) {
            // Chỉ có văn bản -> Bong bóng chuẩn
            bodyHtml = `
                <div class="omni-bubble-wrap">
                    <div class="omni-bubble">
                        <div class="omni-bubble-content">${escapeHtml(content)}</div>
                        <div class="omni-time">${escapeHtml(displayTime)}</div>
                    </div>
                </div>
            `;
        } else if (hasText && hasImages) {
            // Có cả văn bản và ảnh -> Bong bóng chữ + Lưới ảnh bên dưới
            bodyHtml = `
                <div class="omni-bubble-wrap">
                    <div class="omni-bubble">
                        <div class="omni-bubble-content">${escapeHtml(content)}</div>
                        <div class="omni-time">${escapeHtml(displayTime)}</div>
                    </div>
                    ${buildWidgetMediaGrid(images, displayTime)}
                </div>
            `;
        } else {
            // CHỈ CÓ ẢNH -> KHÔNG BỌC BUBBLE MÀU NỀN! Chỉ hiển thị ảnh sạch sẽ và pill thời gian
            bodyHtml = `
                <div class="omni-bubble-wrap">
                    ${buildWidgetMediaGrid(images, displayTime)}
                </div>
            `;
        }

        div.innerHTML = avatarHtml + bodyHtml;

        // Gắn sự kiện click mở Lightbox Gallery cho các ảnh trong tin nhắn
        if (hasImages) {
            const senderDisplayName = isStaff ? (staffName || 'Nhân viên tư vấn') : (session.customerName || 'Bạn');
            const senderAvtUrl = isStaff ? staffAvatar : '';
            div.querySelectorAll('.omni-media-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(item.getAttribute('data-idx') || '0', 10);
                    openWidgetLightbox(images, idx, senderDisplayName, senderAvtUrl, displayTime);
                });
            });
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function renderMessageHistory(messages) {
        const container = document.getElementById('omniWidgetMessages');
        if (!container) return;
        container.innerHTML = '';
        let maxId = 0;
        messages.forEach(msg => {
            appendMessage(msg.sender_type, msg.content, msg.time_formatted || '', msg.id, msg.attachment_url || null, msg.staff_avatar || null, msg.staff_name || null);
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
