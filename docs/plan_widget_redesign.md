# Kế Hoạch Thiết Kế Lại Webchat Widget Đồng Bộ 100% Với OmniChat Workspace

## 1. Mục Tiêu Dự Án
Tái thiết kế toàn diện giao diện và trải nghiệm người dùng của **Webchat Widget** (`public/widget/webchat.js`) nhằm đạt được sự đồng bộ tuyệt đối với ngôn ngữ thiết kế **SaaS Hiện Đại (Respond.io / Intercom Style)** của bàn làm việc tư vấn viên OmniChat (`views/chat/workspace.php`).

Xóa bỏ hoàn toàn tông màu xanh lá cây (`#10B981`) cũ kỹ và bố cục bong bóng đơn điệu, thay thế bằng:
- Hệ thống màu thương hiệu chuẩn mực: **Indigo Blurple (`#4F46E5` / `#6366F1`)**.
- Bố cục bong bóng tin nhắn cao cấp:
  - **Tin nhắn Khách (phải)**: Gradient tím Indigo `#4F46E5 ➔ #6366F1`, bo góc 14px với góc dưới phải 4px, đổ bóng 3D tím mềm, timestamp `#E0E7FF` thanh lịch bên trong bubble.
  - **Tin nhắn Tư vấn viên (trái)**: Bổ sung **Mini Avatar CS chuyên nghiệp** (tròn 28px nền `#EEF2FF` viền `#C7D2FE`, icon headset tím `#4F46E5`). Bong bóng trắng `#FFFFFF`, viền `#E2E8F0`, chữ `#0F172A`, timestamp `#94A3B8`.
- **Thanh cuộn siêu mỏng 5px** bo tròn mượt mà, loại bỏ thanh cuộn xám to dày mặc định của trình duyệt trên Windows/Chrome.
- **Header Box Chat**: Nền Indigo Gradient, Avatar có **Online Status Dot (`#10B981`)**, chip glassmorphic cho nút *"Đổi tên"* và *"Làm mới"*.
- **Khung nhập liệu & Pre-chat Form**: Bo góc hiện đại, focus ring tím `0 0 0 3px rgba(99, 102, 241, 0.18)`, nút gửi máy bay giấy hiệu ứng nổi 3D.

---

## 2. Nguyên Tắc Kiến Trúc: Độc Tôn 1 File Nguồn Duy Nhất (Single Source of Truth)

> [!IMPORTANT]
> **Quy Tắc Bắt Buộc**: Toàn bộ dự án chỉ duy trì **DUY NHẤT 1 file nguồn widget**: `public/widget/webchat.js`. Tuyệt đối KHÔNG nhân bản hay duy trì file phụ ở bất kỳ thư mục nào khác.

- **Đường dẫn phân phối**:
  1. **jsDelivr CDN (cho website đối tác như `mistydev.id.vn`)**:
     `https://cdn.jsdelivr.net/gh/realleesan/OmniChannel@main/public/widget/webchat.js`
  2. **InfinityFree Hosting (Hosting chính của OmniChat)**:
     `htdocs/public/widget/webchat.js` (triển khai qua FTP)
  3. **Node.js Webhook Gateway (`omnichannel-webhook-gateway/`)**:
     Chỉ đóng vai trò là API trung chuyển webhook và polling dữ liệu (`/api/webchat/send`, `/api/webchat/poll`), không phải nơi lưu giữ mã nguồn widget thứ hai.

---

## 3. Bảng Phân Tích So Sánh Chi Tiết Thiết Kế (Trước vs Sau)

| Thành phần | Trước khi thiết kế lại | Sau khi thiết kế lại (Đồng bộ với Hệ Thống) |
| :--- | :--- | :--- |
| **Màu thương hiệu chính** | Xanh lá cây (`#10B981`, `#059669`) | **Indigo Blurple Gradient** (`#4F46E5` ➔ `#6366F1`), bóng mờ `rgba(79, 70, 229, 0.25)`. |
| **Nền khung chat** | Trắng trơn, dễ chói mắt | **Slate nhạt `#F8FAFC`**, viền phân cách mỏng `#E2E8F0` tạo chiều sâu cho tin nhắn. |
| **Bong bóng Khách (Phải)** | Xanh lá phẳng, không có bóng | **Gradient tím Indigo `#4F46E5 ➔ #6366F1`**, chữ trắng tuyền `#FFFFFF`, bo tròn 14px (`border-bottom-right-radius: 4px`), đổ bóng 3D tím mềm `0 2px 8px rgba(79, 70, 229, 0.22)`. Giờ gửi `#E0E7FF` thanh thoát. |
| **Bong bóng Tư vấn viên (Trái)** | Trắng phẳng, không có avatar | Bổ sung **Avatar Tư vấn viên (`.omni-staff-avatar`)** (tròn 28px nền `#EEF2FF` viền `#C7D2FE`, icon headset tím `#4F46E5`). Bong bóng **Trắng `#FFFFFF`**, viền `#E2E8F0`, chữ `#0F172A`, giờ gửi `#94A3B8`. |
| **Thanh cuộn tin nhắn** | Thanh cuộn xám dày mặc định Windows | **Thanh cuộn siêu mỏng 5px**, bo tròn 10px trong suốt, màu `#CBD5E1`, hover `#94A3B8`. |
| **Header Box Chat** | Xanh lá phẳng, text phụ rối | Nền **Indigo Gradient**, Avatar tư vấn viên có **chấm xanh Pulse trực tuyến (Online Dot `#10B981`)**. Nút *"Đổi tên"* / *"Làm mới"* làm dạng chip glassmorphism tinh tế. |
| **Khung nhập tin nhắn** | Ô tròn dài, nút gửi tròn xanh | Khung nhập bo góc 10px, background `#F8FAFC`, khi click có **focus ring tím `0 0 0 3px rgba(99, 102, 241, 0.18)`**. Nút gửi gradient tím `#4F46E5` có icon máy bay giấy. |
| **Launcher Button** | Tròn xanh lá 60px | Tròn **Gradient Indigo `#4F46E5 ➔ #6366F1`**, đổ bóng mềm mại `0 4px 20px rgba(79, 70, 229, 0.45)`, hover phóng to nhẹ 1.08. |
| **Pre-chat Form View** | Tông xanh lá | Tông **Indigo Blurple**, icon chào đón tròn mềm mại, input bo góc hiện đại, nút "Bắt đầu trò chuyện" gradient tím. |

---

## 4. Kế Hoạch Triển Khai Chi Tiết Từng Bước

### Bước 1: Rà Soát & Hoàn Thiện Mã Nguồn `public/widget/webchat.js`
- Đảm bảo 100% token màu đã chuyển sang Indigo (`#4F46E5`, `#6366F1`, `#EEF2FF`, `#C7D2FE`, `#F8FAFC`, `#E2E8F0`).
- Kiểm tra cấu trúc DOM sinh ra trong hàm `appendMessage()`:
  - Nếu `STAFF`: Sinh khối `.omni-staff-avatar` chứa icon headset SVG + `.omni-bubble-wrap`.
  - Nếu `CUSTOMER`: Sinh khối `.omni-bubble-wrap` căn phải với màu tím gradient.
- Kiểm tra thanh cuộn `.omni-chat-messages::-webkit-scrollbar` độ rộng 5px.
- Cập nhật trang `public/widget/demo.html` đồng bộ nhận diện.

### Bước 2: Triển Khai Lên Máy Chủ InfinityFree Qua FTP
- Sử dụng script `scratch/deploy_widget_ftp.php` để đẩy file `public/widget/webchat.js` lên hosting tại đường dẫn `htdocs/public/widget/webchat.js`.
- Xác nhận file trên hosting đã nhận nội dung mới nhất.

### Bước 3: Commit & Push Mã Nguồn Lên GitHub (`origin main`)
- Đưa các thay đổi của `public/widget/webchat.js`, `public/widget/demo.html` và `docs/plan_widget_redesign.md` lên nhánh `main`.
- Lưu ý: Giữ thư mục `omnichannel-webhook-gateway/` sạch sẽ, không tạo bản sao thừa.

### Bước 4: Làm Mới (Purge) Cache jsDelivr CDN
- Gửi yêu cầu HTTP POST/GET đến API purge của jsDelivr:
  `https://purge.jsdelivr.net/gh/realleesan/OmniChannel@main/public/widget/webchat.js`
- Đảm bảo CDN phân phối phiên bản mới nhất cho các website đang nhúng (như `mistydev.id.vn`).

### Bước 5: Kiểm Thử Trực Quan & Kiểm Thử Tính Năng
- Mở trang demo hoặc trang `mistydev.id.vn` bằng Browser Subagent để chụp ảnh giao diện box chat mới.
- Kiểm tra tính năng gửi nhận tin nhắn 2 chiều giữa Webchat Widget và Bàn làm việc OmniChat Workspace (`views/chat/workspace.php`).
- Đánh giá sự đồng nhất thị giác giữa hai bên.
