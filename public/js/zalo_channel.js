/**
 * ZALO_CHANNEL.JS
 * Module Frontend độc lập phụ trách quản lý kết nối Zalo Cá Nhân qua Dedicated Gateway (zca-js)
 * Tự động đồng bộ và polling sự kiện hai chiều, tương thích mọi loại hosting (kể cả InfinityFree có Anti-Bot)
 */

(function () {
    let currentQRSessionId = null;
    let qrPollingInterval = null;
    let isPolling = false;
    let isGatewayPolling = false;

    // Lấy URL Gateway Render từ config hoặc fallback
    function getGatewayUrl() {
        const url = (window.APP_CONFIG && window.APP_CONFIG.ZALO_GATEWAY_URL) 
            ? window.APP_CONFIG.ZALO_GATEWAY_URL 
            : 'https://omnichannel-zalo-gateway.onrender.com';
        return url.replace(/\/+$/, '');
    }

    /**
     * Mở modal Quản lý Zalo
     */
    window.openZaloConfigModal = function () {
        const modal = document.getElementById('modalZaloConfig');
        if (modal) {
            modal.style.display = 'flex';
            switchZaloModalTab('accounts');
            loadZaloAccounts();
        }
    };

    /**
     * Đóng modal Quản lý Zalo
     */
    window.closeZaloConfigModal = function () {
        const modal = document.getElementById('modalZaloConfig');
        if (modal) {
            modal.style.display = 'none';
        }
        stopQRPolling();
    };

    /**
     * Chuyển đổi tab trong modal
     */
    window.switchZaloModalTab = function (tab) {
        const tabAccounts = document.getElementById('zaloTabAccounts');
        const tabQR = document.getElementById('zaloTabQR');
        const btnAccounts = document.getElementById('tabBtnZaloAccounts');
        const btnQR = document.getElementById('tabBtnZaloAddQR');

        if (tab === 'accounts') {
            if (tabAccounts) tabAccounts.style.display = 'block';
            if (tabQR) tabQR.style.display = 'none';
            if (btnAccounts) {
                btnAccounts.style.color = '#0068FF';
                btnAccounts.style.borderBottom = '2px solid #0068FF';
            }
            if (btnQR) {
                btnQR.style.color = '#64748B';
                btnQR.style.borderBottom = '2px solid transparent';
            }
            stopQRPolling();
            loadZaloAccounts();
        } else if (tab === 'qr') {
            if (tabAccounts) tabAccounts.style.display = 'none';
            if (tabQR) tabQR.style.display = 'block';
            if (btnAccounts) {
                btnAccounts.style.color = '#64748B';
                btnAccounts.style.borderBottom = '2px solid transparent';
            }
            if (btnQR) {
                btnQR.style.color = '#0068FF';
                btnQR.style.borderBottom = '2px solid #0068FF';
            }
            startZaloQRGeneration();
        }
    };

    /**
     * Tải danh sách tài khoản Zalo đã kết nối (Đồng bộ đa nguồn: CSDL CRM + Render Gateway)
     */
    window.loadZaloAccounts = async function () {
        const loading = document.getElementById('zaloAccountsLoading');
        const list = document.getElementById('zaloAccountsList');
        const empty = document.getElementById('zaloAccountsEmpty');
        const countBadge = document.getElementById('zaloAccountCountBadge');
        const headerBadge = document.getElementById('zaloConnectedCountBadge');

        if (loading) loading.style.display = 'block';
        if (list) list.style.display = 'none';
        if (empty) empty.style.display = 'none';

        let accounts = [];

        // 1. Thử lấy trực tiếp từ Gateway Render (nơi đang duy trì session socket live)
        try {
            const gwUrl = getGatewayUrl();
            const gwRes = await fetch(`${gwUrl}/api/zalo/accounts`, { mode: 'cors' });
            if (gwRes.ok) {
                const gwData = await gwRes.json();
                if (gwData.success && Array.isArray(gwData.accounts)) {
                    accounts = gwData.accounts;

                    // Đồng bộ ngay các tài khoản từ Gateway về CSDL CRM PHP nếu chưa có
                    const gwKey = (window.APP_CONFIG && window.APP_CONFIG.ZALO_GATEWAY_KEY) || 'omnichannel_zalo_secret_2026';
                    for (const acc of accounts) {
                        try {
                            await fetch('../../api/zalo_action.php', {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'X-Gateway-Key': gwKey
                                },
                                body: JSON.stringify({
                                    action: 'account_connected',
                                    account_id: acc.id,
                                    account_name: acc.name,
                                    account_avatar: acc.avatar,
                                    configured_at: acc.configured_at,
                                    gateway_key: gwKey
                                })
                            });
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {
            console.warn('[ZaloChannel] Không thể fetch trực tiếp từ Render Gateway:', e.message);
        }

        // 2. Nếu Gateway chưa trả hoặc rỗng, lấy từ CSDL CRM PHP
        if (accounts.length === 0) {
            try {
                const res = await fetch('../../api/zalo_action.php?action=get_accounts');
                const data = await res.json();
                if (data.success && Array.isArray(data.accounts)) {
                    accounts = data.accounts;
                }
            } catch (err) {
                console.error('[ZaloChannel] Lỗi tải tài khoản từ CSDL CRM:', err);
            }
        }

        if (loading) loading.style.display = 'none';

        const activeCount = accounts.filter(a => a.status === 'CONNECTED').length;
        if (countBadge) countBadge.textContent = accounts.length;
        if (headerBadge) {
            headerBadge.textContent = activeCount;
            headerBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
        }

        if (accounts.length === 0) {
            if (empty) empty.style.display = 'block';
        } else {
            renderAccountsList(accounts);
            if (list) list.style.display = 'flex';
        }
    };

    /**
     * Render danh sách tài khoản ra HTML
     */
    function renderAccountsList(accounts) {
        const list = document.getElementById('zaloAccountsList');
        if (!list) return;

        list.innerHTML = accounts.map(acc => {
            const isConnected = acc.status === 'CONNECTED';
            const statusLabel = isConnected ? 'Đang hoạt động' : 'Đã ngắt kết nối';
            const statusBg = isConnected ? '#DCFCE7' : '#F1F5F9';
            const statusColor = isConnected ? '#15803D' : '#64748B';
            const dotColor = isConnected ? '#22C55E' : '#94A3B8';

            const avatarHtml = acc.avatar 
                ? `<img src="${escapeHtml(acc.avatar)}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:1.5px solid #CBD5E1;" alt="Avatar" />`
                : `<div style="width:42px; height:42px; border-radius:50%; background:#0068FF; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px;">${escapeHtml((acc.name || 'Z').charAt(0).toUpperCase())}</div>`;

            return `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                        ${avatarHtml}
                        <div style="min-width:0;">
                            <div style="font-weight:700; font-size:14px; color:#1E293B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtml(acc.name || 'Zalo Account')}
                            </div>
                            <div style="font-size:12px; color:#64748B; margin-top:2px;">
                                Zalo ID: <code>${escapeHtml(acc.id)}</code>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
                        <span style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; padding:4px 10px; border-radius:12px; background:${statusBg}; color:${statusColor};">
                            <span style="width:6px; height:6px; border-radius:50%; background:${dotColor};"></span>
                            ${statusLabel}
                        </span>
                        <button type="button" onclick="disconnectZaloAccount('${escapeHtml(acc.id)}')" 
                                title="Ngắt kết nối tài khoản này"
                                style="background:#FEE2E2; border:none; color:#DC2626; width:32px; height:32px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:13px;">
                            <i class="fa-solid fa-power-off"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Bắt đầu phiên sinh mã QR
     */
    window.startZaloQRGeneration = async function () {
        stopQRPolling();

        const qrLoader = document.getElementById('zaloQRLoader');
        const qrLoaderText = document.getElementById('zaloQRLoaderText');
        const qrImg = document.getElementById('zaloQRImage');

        if (qrLoader) qrLoader.style.display = 'flex';
        if (qrLoaderText) qrLoaderText.textContent = 'Đang kết nối Zalo Gateway...';
        if (qrImg) {
            qrImg.style.display = 'none';
            qrImg.src = '';
        }

        updateQRStatusUI('Đang tạo mã QR...', '#F1F5F9', '#475569', '#94A3B8');

        try {
            const gwUrl = getGatewayUrl();
            const res = await fetch(`${gwUrl}/api/zalo/qr/generate`, { mode: 'cors' });
            const data = await res.json();

            if (!data.success || !data.session_id) {
                updateQRStatusUI('Lỗi: ' + (data.message || 'Không thể tạo mã QR'), '#FEE2E2', '#DC2626', '#EF4444');
                if (qrLoaderText) qrLoaderText.textContent = 'Không thể tạo mã QR';
                return;
            }

            currentQRSessionId = data.session_id;
            console.log('[ZaloChannel] Bắt đầu polling session QR:', currentQRSessionId);

            if (qrLoaderText) qrLoaderText.textContent = 'Đang chờ mã QR từ Zalo...';

            // Khởi động vòng lặp polling kiểm tra trạng thái
            isPolling = true;
            qrPollingInterval = setInterval(() => pollQRStatus(currentQRSessionId), 1500);

        } catch (err) {
            console.error('[ZaloChannel] Lỗi gọi API generate_qr:', err);
            updateQRStatusUI('Lỗi kết nối tới Gateway', '#FEE2E2', '#DC2626', '#EF4444');
            if (qrLoaderText) qrLoaderText.textContent = 'Lỗi kết nối máy chủ';
        }
    };

    /**
     * Vòng lặp polling kiểm tra trạng thái QR
     */
    async function pollQRStatus(sessionId) {
        if (!isPolling || !sessionId) return;

        try {
            const gwUrl = getGatewayUrl();
            const res = await fetch(`${gwUrl}/api/zalo/qr/status?session_id=${encodeURIComponent(sessionId)}`, { mode: 'cors' });
            const data = await res.json();

            if (!data.success && data.message) {
                console.warn('[ZaloChannel] Polling response error:', data.message);
                return;
            }

            const qrLoader = document.getElementById('zaloQRLoader');
            const qrImg = document.getElementById('zaloQRImage');

            // 1. Khi có ảnh QR code
            if (data.qr_code && qrImg && qrImg.src !== data.qr_code) {
                qrImg.src = data.qr_code;
                qrImg.style.display = 'block';
                if (qrLoader) qrLoader.style.display = 'none';
            }

            // 2. Cập nhật trạng thái
            switch (data.status) {
                case 'WAITING_SCAN':
                    updateQRStatusUI('Mã QR đã sẵn sàng. Vui lòng quét mã trên điện thoại', '#EFF6FF', '#1D4ED8', '#3B82F6');
                    break;

                case 'SCANNED':
                    updateQRStatusUI('Đã quét! Vui lòng bấm "Đăng nhập" trên điện thoại...', '#FEF3C7', '#B45309', '#F59E0B');
                    break;

                case 'CONFIRMED':
                    updateQRStatusUI('Đã xác nhận! Đang hoàn tất lưu phiên...', '#E0E7FF', '#4338CA', '#6366F1');
                    break;

                case 'SUCCESS':
                    stopQRPolling();
                    updateQRStatusUI('Đăng nhập thành công!', '#DCFCE7', '#15803D', '#22C55E');

                    // Đồng bộ ngay vào CSDL CRM
                    try {
                        await fetch('../../api/zalo_action.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'account_connected',
                                account_id: data.account_id,
                                account_name: data.account_name,
                                configured_at: Date.now()
                            })
                        });
                    } catch (e) {}
                    
                    if (window.showToastNotification) {
                        window.showToastNotification(`Đã kết nối tài khoản Zalo: ${data.account_name || ''}`, 'success');
                    }

                    // Tự động chuyển về tab danh sách tài khoản
                    setTimeout(() => {
                        switchZaloModalTab('accounts');
                        loadZaloAccounts();
                    }, 1000);
                    break;

                case 'EXPIRED':
                    stopQRPolling();
                    updateQRStatusUI('Mã QR đã hết hạn. Vui lòng bấm làm mới.', '#FEE2E2', '#DC2626', '#EF4444');
                    break;

                case 'DECLINED':
                    stopQRPolling();
                    updateQRStatusUI('Đăng nhập bị từ chối trên thiết bị.', '#FEE2E2', '#DC2626', '#EF4444');
                    break;

                case 'ERROR':
                    stopQRPolling();
                    updateQRStatusUI(data.error || 'Lỗi đăng nhập', '#FEE2E2', '#DC2626', '#EF4444');
                    break;

                default:
                    break;
            }

        } catch (e) {
            console.warn('[ZaloChannel] Lỗi pollQRStatus:', e);
        }
    }

    /**
     * Dừng vòng lặp polling QR
     */
    function stopQRPolling() {
        isPolling = false;
        if (qrPollingInterval) {
            clearInterval(qrPollingInterval);
            qrPollingInterval = null;
        }
    }

    /**
     * Cập nhật giao diện badge trạng thái QR
     */
    function updateQRStatusUI(text, bgColor, textColor, dotColor) {
        const badge = document.getElementById('zaloQRStatusBadge');
        const textElem = document.getElementById('zaloQRStatusText');
        if (badge && textElem) {
            badge.style.background = bgColor;
            badge.style.color = textColor;
            textElem.textContent = text;
            const dot = badge.querySelector('span');
            if (dot) dot.style.background = dotColor;
        }
    }

    /**
     * Ngắt kết nối tài khoản Zalo
     */
    window.disconnectZaloAccount = async function (accountId) {
        if (!confirm('Bạn có chắc muốn ngắt kết nối tài khoản Zalo này? Hệ thống sẽ ngừng nhận tin nhắn mới từ tài khoản này.')) {
            return;
        }

        try {
            // 1. Gọi trực tiếp sang Render Gateway để dừng listener ngay lập tức
            try {
                const gwUrl = getGatewayUrl();
                const gwKey = getGatewayKey();
                await fetch(`${gwUrl}/api/zalo/disconnect`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Gateway-Key': gwKey 
                    },
                    body: JSON.stringify({ account_id: accountId, gateway_key: gwKey })
                });
            } catch (gwErr) {
                console.warn('[ZaloChannel] Lỗi gọi ngắt kết nối Gateway trực tiếp:', gwErr);
            }

            // 2. Cập nhật trạng thái tài khoản trên CRM CSDL
            const formData = new FormData();
            formData.append('action', 'disconnect');
            formData.append('account_id', accountId);

            const res = await fetch('../../api/zalo_action.php', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.success) {
                if (window.showToastNotification) {
                    window.showToastNotification('Đã ngắt kết nối tài khoản Zalo', 'info');
                }
                loadZaloAccounts();
            } else {
                alert(data.message || 'Lỗi ngắt kết nối');
            }
        } catch (err) {
            alert('Lỗi kết nối máy chủ');
        }
    };

    /**
     * POLLING TIẾP NHẬN SỰ KIỆN & TIN NHẮN TỪ RENDER GATEWAY (Bypass Anti-Bot InfinityFree)
     */
    async function pollZaloGateway() {
        if (isGatewayPolling) return;
        isGatewayPolling = true;

        try {
            const gwUrl = getGatewayUrl();
            const res = await fetch(`${gwUrl}/api/zalo/poll`, { mode: 'cors' });
            if (!res.ok) return;

            const data = await res.json();
            if (data.success && Array.isArray(data.events) && data.events.length > 0) {
                let hasInboundMessage = false;

                for (const event of data.events) {
                    console.log('[ZaloChannel] Kéo sự kiện mới từ Gateway:', event);

                    // Đẩy sự kiện vào backend CRM (trình duyệt gửi cục bộ cùng domain nên không bị chặn)
                    try {
                        const gwKey = (window.APP_CONFIG && window.APP_CONFIG.ZALO_GATEWAY_KEY) || 'omnichannel_zalo_secret_2026';
                        const syncRes = await fetch('../../api/zalo_action.php', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'X-Gateway-Key': gwKey
                            },
                            body: JSON.stringify({
                                ...event,
                                gateway_key: gwKey
                            })
                        });
                        const syncData = await syncRes.json();
                        console.log('[ZaloChannel] Kết quả đồng bộ sự kiện vào CRM:', syncData);

                        if (event.action === 'inbound_message') {
                            hasInboundMessage = true;
                        } else if (event.action === 'account_connected') {
                            loadZaloAccounts();
                        }
                    } catch (err) {
                        console.error('[ZaloChannel] Lỗi gửi sự kiện vào CRM PHP:', err);
                    }
                }

                // Nếu có tin nhắn mới, kích hoạt cập nhật danh sách hội thoại và tin nhắn ngay lập tức
                if (hasInboundMessage) {
                    if (typeof window.fetchConversations === 'function') {
                        window.fetchConversations(false);
                    }
                    if (typeof window.runSyncPolling === 'function') {
                        window.runSyncPolling();
                    }
                }
            }
        } catch (e) {
            // Gateway Render có thể đang spin-up
        } finally {
            isGatewayPolling = false;
        }
    }

    /**
     * Helper escape HTML
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Khởi động khi tải trang
    document.addEventListener('DOMContentLoaded', () => {
        loadZaloAccounts();
        // Vòng lặp kéo tin nhắn Zalo mỗi 2.5 giây
        setInterval(pollZaloGateway, 2500);
    });
})();
