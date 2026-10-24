<!-- ========================================================
     MODAL: QUẢN LÝ KẾT NỐI ZALO CÁ NHÂN (ZCA-JS GATEWAY)
     ======================================================== -->
<div class="crm-modal-backdrop" id="modalZaloConfig" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); z-index:99999; justify-content:center; align-items:center;">
    <div class="crm-modal-box" style="background:#FFFFFF; border-radius:16px; width:95%; max-width:580px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden; display:flex; flex-direction:column; animation:fadeInScale 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <!-- Header Modal -->
        <div class="modal-header" style="padding:16px 20px; background:#F8FAFC; border-bottom:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:36px; height:36px; border-radius:10px; background:#0068FF; display:flex; align-items:center; justify-content:center; color:#fff; font-size:18px;">
                    <i class="fa-solid fa-comment-dots"></i>
                </div>
                <div>
                    <h3 style="margin:0; font-size:16px; font-weight:700; color:#0F172A;">Quản lý Zalo Cá Nhân</h3>
                    <p style="margin:2px 0 0; font-size:12px; color:#64748B;">Tích hợp đa tài khoản Zalo qua Dedicated Gateway (zca-js)</p>
                </div>
            </div>
            <button type="button" class="btn-close-modal" onclick="closeZaloConfigModal()" style="background:none; border:none; font-size:18px; color:#94A3B8; cursor:pointer; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- Navigation Tabs -->
        <div style="display:flex; border-bottom:1px solid #E2E8F0; background:#F8FAFC; padding:0 20px;">
            <button type="button" id="tabBtnZaloAccounts" onclick="switchZaloModalTab('accounts')" 
                    style="padding:12px 16px; font-size:13px; font-weight:600; color:#0068FF; border:none; background:none; border-bottom:2px solid #0068FF; cursor:pointer; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-list-check"></i>
                <span>Tài khoản đã kết nối (<span id="zaloAccountCountBadge">0</span>)</span>
            </button>
            <button type="button" id="tabBtnZaloAddQR" onclick="switchZaloModalTab('qr')" 
                    style="padding:12px 16px; font-size:13px; font-weight:600; color:#64748B; border:none; background:none; border-bottom:2px solid transparent; cursor:pointer; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-qrcode"></i>
                <span>Thêm tài khoản (Quét QR)</span>
            </button>
        </div>

        <!-- Body Modal -->
        <div class="modal-body" style="padding:20px; max-height:480px; overflow-y:auto;">
            
            <!-- TAB 1: DANH SÁCH TÀI KHOẢN -->
            <div id="zaloTabAccounts">
                <div id="zaloAccountsLoading" style="text-align:center; padding:30px 0; color:#64748B;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#0068FF; margin-bottom:8px;"></i>
                    <p style="font-size:13px; margin:0;">Đang tải danh sách tài khoản Zalo...</p>
                </div>

                <div id="zaloAccountsList" style="display:none; flex-direction:column; gap:12px;">
                    <!-- Danh sách tài khoản render tự động bằng JS -->
                </div>

                <div id="zaloAccountsEmpty" style="display:none; text-align:center; padding:36px 16px; background:#F8FAFC; border-radius:12px; border:1px dashed #CBD5E1;">
                    <div style="width:48px; height:48px; border-radius:50%; background:#EFF6FF; display:flex; align-items:center; justify-content:center; margin:0 auto 12px; color:#0068FF; font-size:20px;">
                        <i class="fa-solid fa-qrcode"></i>
                    </div>
                    <h4 style="margin:0 0 6px; font-size:14px; font-weight:600; color:#1E293B;">Chưa có tài khoản Zalo nào được kết nối</h4>
                    <p style="margin:0 0 16px; font-size:12.5px; color:#64748B;">Quét mã QR bằng ứng dụng Zalo trên điện thoại để bắt đầu nhận tin nhắn khách hàng.</p>
                    <button type="button" onclick="switchZaloModalTab('qr')" style="background:#0068FF; color:#fff; border:none; border-radius:8px; padding:9px 18px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-plus"></i>
                        <span>Quét mã QR kết nối ngay</span>
                    </button>
                </div>
            </div>

            <!-- TAB 2: QUÉT MÃ QR KẾT NỐI MỚI -->
            <div id="zaloTabQR" style="display:none;">
                <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:10px; padding:12px 14px; margin-bottom:16px; display:flex; gap:10px; font-size:12px; color:#1E40AF; line-height:1.5;">
                    <i class="fa-solid fa-shield-halved" style="font-size:16px; margin-top:2px; flex-shrink:0;"></i>
                    <div>
                        <strong>Quy tắc bảo vệ dữ liệu:</strong> Hệ thống chỉ lắng nghe tin nhắn cá nhân 1-1 phát sinh <u>từ lúc kết nối trở đi</u>, tuyệt đối không tải lại tin nhắn cũ của bạn bè hoặc người thân trước đó.
                    </div>
                </div>

                <!-- Khu vực hiển thị mã QR -->
                <div style="text-align:center; padding:10px 0;">
                    <div id="zaloQRBox" style="display:inline-block; position:relative; width:220px; height:220px; border-radius:12px; border:2px solid #E2E8F0; padding:10px; background:#fff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
                        
                        <!-- Spinner loading khi chưa có ảnh -->
                        <div id="zaloQRLoader" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fff; border-radius:10px;">
                            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:32px; color:#0068FF; margin-bottom:12px;"></i>
                            <span style="font-size:12px; color:#64748B;" id="zaloQRLoaderText">Đang khởi tạo mã QR...</span>
                        </div>

                        <!-- Ảnh QR code -->
                        <img id="zaloQRImage" src="" alt="Mã QR Zalo" style="width:200px; height:200px; object-fit:contain; display:none; border-radius:6px;" />
                    </div>

                    <!-- Trạng thái quét trực tiếp -->
                    <div style="margin-top:14px;">
                        <span id="zaloQRStatusBadge" style="display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; padding:6px 14px; border-radius:20px; background:#F1F5F9; color:#475569;">
                            <span style="width:8px; height:8px; border-radius:50%; background:#94A3B8;"></span>
                            <span id="zaloQRStatusText">Đang chuẩn bị...</span>
                        </span>
                    </div>

                    <div style="margin-top:14px; display:flex; justify-content:center; gap:10px;">
                        <button type="button" id="btnRefreshZaloQR" onclick="startZaloQRGeneration()" 
                                style="background:#F8FAFC; border:1px solid #CBD5E1; color:#334155; border-radius:8px; padding:7px 14px; font-size:12.5px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-arrows-rotate"></i>
                            <span>Làm mới mã QR</span>
                        </button>
                    </div>

                    <div style="margin-top:16px; font-size:12px; color:#64748B; text-align:left; background:#F8FAFC; border-radius:8px; padding:12px 14px;">
                        <div style="font-weight:600; color:#334155; margin-bottom:4px;">Các bước kết nối:</div>
                        <div>1. Mở ứng dụng Zalo trên điện thoại</div>
                        <div>2. Chọn biểu tượng <strong>Quét mã QR</strong> ở góc trên bên phải</div>
                        <div>3. Quét mã QR ở trên và nhấn <strong>Đăng nhập</strong> trên điện thoại</div>
                    </div>
                </div>
            </div>

        </div>

        <!-- Footer Modal -->
        <div class="modal-footer" style="padding:12px 20px; background:#F8FAFC; border-top:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:11.5px; color:#64748B;">
                Gateway Render: <code style="color:#0068FF;">online</code>
            </div>
            <button type="button" onclick="closeZaloConfigModal()" style="background:#E2E8F0; color:#334155; border:none; border-radius:8px; padding:8px 18px; font-size:13px; font-weight:600; cursor:pointer;">
                Đóng
            </button>
        </div>

    </div>
</div>
