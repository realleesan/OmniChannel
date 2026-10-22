# KẾ HOẠCH TRIỂN KHAI (PLAN)
## NÂNG CẤP SIDEBAR PHẢI & TÍCH HỢP GEMINI AI TRÍCH XUẤT THÔNG TIN KHÁCH HÀNG

> **Ngày lập kế hoạch**: 22/10/2026  
> **Mục tiêu**: Tái cấu trúc khối Thông Tin Khách Hàng ở Sidebar phải (loại bỏ toàn bộ icon rườm rà, tinh gọn 8 trường chuẩn, 1 nút Sửa tổng trên tiêu đề) và tích hợp Google Gemini AI đọc hội thoại từ đầu đến cuối, trích xuất chính xác 8 trường dữ liệu (Zero Hallucination, Free 100%, tốc độ < 2s).

---

## I. YÊU CẦU ĐẶC TẢ CHI TIẾT

### 1. Giao diện khối Thông Tin Khách Hàng (`zone-sidebar-right`)
1. **Loại bỏ toàn bộ icon rườm rà**:
   - Bỏ icon người ở tiêu đề `THÔNG TIN KHÁCH HÀNG`.
   - Bỏ tất cả icon phía trước từng trường (bỏ icon chữ ký, phone, location, giỏ hàng, v.v.).
   - Bỏ icon lịch ở dòng `Dữ liệu từ: ... đến ...`.
   - Bỏ icon xoay ở nút `CẬP NHẬT HỒ SƠ` (chỉ để chữ sạch sẽ).
2. **Cấu trúc 8 trường thông tin chuẩn**:
   - 1. **Họ và tên** (`crmRealName`)
   - 2. **Số điện thoại** (`crmPhone`)
   - 3. **Địa chỉ** (`crmAddress`)
   - 4. **Số đo** (`crmBodyMeasurements`)
   - 5. **Sản phẩm quan tâm** (`crmCustomerNeeds`)
   - 6. **Đơn hàng từng mua** (`crmRecentPurchases`)
   - 7. **Ghi chú** (`crmNotes`)
   - 8. **Tóm tắt hội thoại** (`crmSummary`)
   - *Mặc định khi chưa có dữ liệu: tất cả đều hiển thị `Chưa có thông tin` (riêng tóm tắt: `Chưa có tóm tắt`).*
3. **Cơ chế nút "Sửa"**:
   - Xóa bỏ toàn bộ các nút "Sửa" con ở từng dòng.
   - Chỉ có **1 nút Sửa duy nhất** đặt ở góc phải thanh tiêu đề `THÔNG TIN KHÁCH HÀNG`.
   - Khi bấm vào nút Sửa: Mở Modal chỉnh sửa hồ sơ khách hàng (`#modalEditCustomerProfile`) cho phép sửa nhanh cả 8 trường trên cùng 1 biểu mẫu và bấm "Lưu thay đổi".

---

### 2. Tích hợp Google Gemini AI
1. **Model & Chi phí**:
   - Model: `gemini-1.5-flash` / `gemini-2.0-flash`.
   - Gói: Google AI Studio Free Tier (15 RPM / 1.500 RPD / 100% Miễn phí).
   - API Key cấu hình trong `.env` (`GEMINI_API_KEY`).
2. **Nguyên tắc đọc & Trích xuất**:
   - Backend truy vấn MySQL toàn bộ tin nhắn từ đầu đến tin mới nhất của `conversation_id`.
   - Nén sạch hội thoại loại bỏ rác, system messages, link ảnh dài.
   - Prompt cưỡng chế **Zero Hallucination**: Trường nào không có thông tin trong hội thoại bắt buộc trả về `null` (không đoán, không bịa).
   - Sử dụng **Structured Outputs (JSON Schema)** đảm bảo format trả về đúng 100%.
   - Cập nhật vào bảng `customer_profiles` và render lên Sidebar tức thì.
3. **Hiệu ứng UX**:
   - Khi bấm `CẬP NHẬT HỒ SƠ`: Nút hiển thị `ĐANG PHÂN TÍCH...` (disabled chống spam click), các ô có hiệu ứng loading mờ nhẹ.
   - Khi hoàn tất: Fill dữ liệu vào các ô, trường mới có highlight xanh lá, nút báo `ĐÃ CẬP NHẬT XONG!` trong 2s.

---

## II. LỘ TRÌNH TRIỂN KHAI CHI TIẾT (TASKS)

- [x] **Bước 1: Cập nhật CSDL & Model (`models/CustomerProfile.php`)**
  - Cập nhật self-healing schema bổ sung các cột `body_measurements`, `notes` vào bảng `customer_profiles` nếu chưa có.
  - Cập nhật hàm `getByConversationId`, `updateCrmProfile` hỗ trợ đầy đủ 8 trường.
  - Thêm phương thức `saveAiExtractedProfile` cập nhật dữ liệu từ AI.
- [x] **Bước 2: Xây dựng Service tích hợp Gemini AI Backend (`controllers/CustomerController.php` & `api/customer_action.php`)**
  - Đọc `GEMINI_API_KEY` từ `.env` / `constants.php`.
  - Viết hàm `extractProfileWithAI($conversationId)`:
    - Lấy toàn bộ messages của hội thoại `ORDER BY id ASC`.
    - Nén hội thoại thành transcript sạch (loại bỏ tin rác/system).
    - Gửi request đến Gemini API (`gemini-1.5-flash`) với System Instruction Zero-Hallucination & JSON Schema.
    - Lưu dữ liệu trích xuất vào CSDL.
    - Thêm case `ai_extract_profile` trong `api/customer_action.php`.
- [x] **Bước 3: Tái cấu trúc Giao diện Sidebar phải (`views/chat/workspace.php`)**
  - Bỏ icon ở tiêu đề `THÔNG TIN KHÁCH HÀNG`.
  - Thêm 1 nút `Sửa` duy nhất trên header của khối thông tin khách hàng.
  - Render đúng 8 trường thông tin chuẩn (không icon phía trước, không nút sửa con).
  - Bỏ icon lịch ở dòng dữ liệu từ, bỏ icon ở nút `CẬP NHẬT HỒ SƠ`.
  - Thêm Modal popup chỉnh sửa hồ sơ khách hàng (`#modalEditCustomerProfile`).
- [x] **Bước 4: Cập nhật CSS hiển thị (`public/css/style.css`)**
  - Style khối 8 trường thông tin tối giản, hiện đại, dễ nhìn.
  - Thêm class `.attr-value-text.is-empty` và `.attr-highlight-updated`.
- [x] **Bước 5: Cập nhật JavaScript xử lý (`public/js/workspace.js`)**
  - Cập nhật hàm `renderProfileSidebar`: render đúng 8 trường, hiển thị "Chưa có thông tin" nếu rỗng.
  - Cập nhật hàm `handleUpdateCustomerProfile`: gọi action `ai_extract_profile`, xử lý loading & highlight xanh.
  - Thêm hàm `openEditCustomerProfileModal()`, `closeEditCustomerProfileModal()` và `handleSaveCustomerProfileModal()` cho nút Sửa tổng.
- [x] **Bước 6: Kiểm thử toàn diện & Hoàn thiện**
  - Cú pháp JavaScript `public/js/workspace.js` kiểm tra thành công.
  - Hoàn tất toàn bộ yêu cầu đề ra.
