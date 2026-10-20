# Kế Hoạch Nâng Cấp Toàn Diện: Trải Nghiệm Chat, Avatar Tư Vấn Viên, Bố Cục Ảnh Đa Phương Tiện & Thư Viện Lightbox Gallery

Tài liệu này đặc tả chi tiết kế hoạch triển khai cho đợt nâng cấp lớn (Major Feature Update) nhằm hoàn thiện mỹ quan và tính năng tương tác đa phương tiện giữa **Hệ thống OmniChat Workspace** (`views/chat/workspace.php`) và **Webchat Widget** (`public/widget/webchat.js`).

---

## 1. Phân Tích Yêu Cầu & Đánh Giá Ý Tưởng Của Người Dùng

### 1.1. Câu hỏi về "Chế độ Chỉ Xem khi Hết Ca Trực":
> *Ý kiến người dùng:* "ở box chat, nếu đã chuyển về hết ca thì sẽ view only và có tiêu đề CHẾ ĐỘ CHỈ XEM - Hội thoại sẽ được phân chia cho nhân viên khác. Bạn không có quyền gửi tin nhắn. Bạn thấy nó ổn không?"
- **Đánh giá: CỰC KỲ CHUẨN XÁC VÀ HỢP LÝ THEO NGHIỆP VỤ CSKH CHUYÊN NGHIỆP!**
- **Lý do:** Khi tư vấn viên gạt nút ca trực sang `OFFLINE` (Hết ca):
  - Tư vấn viên không còn trong ca làm việc. Nếu vẫn cho phép gõ tin nhắn trả lời khách, khách hàng sẽ nhắn lại; nhưng khi đó tư vấn viên đã tắt máy/về nhà, dẫn đến khách bị bỏ rơi.
  - Thuật toán chia tải khi có tin mới sẽ tự động chuyển giao cuộc trò chuyện sang cho nhân viên đang `ONLINE`.
  - Việc khóa khung chat và hiển thị banner cảnh báo:
    > **CHẾ ĐỘ CHỈ XEM**
    > *Bạn đã hết ca trực. Hội thoại sẽ được phân chia cho nhân viên khác khi có tin mới. Bạn không có quyền gửi tin nhắn.*
    sẽ ngăn ngừa hoàn toàn tình trạng tư vấn viên chat dở dang ngoài ca trực, đảm bảo tính liền mạch trong dịch vụ khách hàng.

---

## 2. Danh Mục Các Hạng Mục Nâng Cấp Chi Tiết (7 Modules)

### Module 1: Avatar Pool 10 Chân Dung Unsplash Cao Cấp & Đồng Bộ Toàn Hệ Thống
1. **Tuyển chọn 10 URL chân dung độ nét cao từ Unsplash CDN:**
   - Ảnh tỉ lệ 1:1, tối ưu dung lượng (w=150&h=150&fit=crop&crop=face), phong cách tư vấn viên/công sở chuyên nghiệp, thân thiện, đa dạng nam và nữ.
2. **Cấu hình trong Code & Database:**
   - Đặt mảng hằng số `AVATAR_POOL` trong `models/User.php` hoặc `config/constants.php`.
   - Cập nhật avatar thực tế cho các tài khoản mẫu (`nv1` - Nguyễn Văn Quân, `nv2` - Trần Thị Phương).
   - Khi tạo mới tài khoản hoặc nếu tài khoản chưa có avatar, tự động gán xoay vòng 1 trong 10 avatar này.
3. **Đồng bộ hiển thị:**
   - Topbar: Hiển thị avatar tròn thật kèm ảnh sắc nét thay vì chữ cái viết tắt đơn điệu.
   - Sidebar trái & Header chat: Hiển thị avatar người phụ trách.
   - **Bên Webchat Widget:** Khi nhân viên trả lời, tin nhắn của nhân viên hiển thị avatar ảnh chân dung thực tế của nhân viên đó (không dùng icon headset generic).

---

### Module 2: Tối Ưu Khoảng Cách Icon Avatar "Đã Xem" (Seen Indicator)
1. **Hiện trạng:** Icon avatar mini 'Đã xem' ở dưới tin nhắn cuối cùng của nhân viên bị cách một khoảng trống quá xa (thưa thãi).
2. **Giải pháp:**
   - Giảm `margin-top` từ 3-6px xuống **1px**, `margin-bottom: 2px`.
   - Căn lề phải ép sát vào cạnh dưới bên phải của bong bóng tin nhắn cuối cùng.
   - Thêm tooltip nhẹ nhàng: `[Tên khách] đã xem lúc HH:mm`.

---

### Module 3: Chuẩn Hóa Thông Tin Sidebar Phải (Hồ Sơ Khách Hàng)
1. **Gỡ bỏ mã số ID thừa:** Xóa dòng `#1` / `#2` dưới tên khách hàng (chỉ giữ lại Tên khách và Badge kênh Webchat/Zalo/FB).
2. **Chuẩn hóa nhãn thông tin:**
   - Đổi nhãn mập mờ `Địa chỉ / Khu vực:` thành **`Địa chỉ:`**.
   - Chuẩn hóa nhãn `Nhu cầu / Sản phẩm:` thành **`Sản phẩm quan tâm:`**.

---

### Module 4: Cơ Chế Khóa View-Only Khi Nhân Viên "Hết Ca" (Shift View-Only Lock)
1. **Logic kích hoạt:**
   - Khi `currentUser.status === 'OFFLINE'`:
     - Tự động hiển thị Banner cảnh báo màu vàng xám sang trọng ở trên cùng của khung chat:
       - Tiêu đề: `CHẾ ĐỘ CHỈ XEM (HẾT CA TRỰC)`
       - Nội dung: `Bạn đang ở trạng thái hết ca trực. Hội thoại sẽ được tự động phân chia cho nhân viên khác khi có tin nhắn mới. Bạn không có quyền gửi tin nhắn.`
     - Ẩn khung nhập liệu `chatInputArea`.
2. **Mở khóa tức thì:** Khi nhân viên click gạt sang "Sẵn sàng nhận khách" (`ONLINE`), banner tự động ẩn và khung nhập tin nhắn xuất hiện lại ngay mà không cần reload trang.

---

### Module 5: Bố Cục Hiển Thị Ảnh Thông Minh (Loại Bỏ Khung Viền Nền Màu Thô Cộm)
1. **Hiện trạng:** Ảnh gửi đi bị bọc bên trong bong bóng `.message-bubble` có nền tím đậm hoặc trắng, tạo thành một khung viền màu dày cộp, rất thô và không thẩm mỹ.
2. **Giải pháp chuẩn quốc tế (Messenger, Telegram, Zalo):**
   - **Trường hợp tin nhắn CHỈ CÓ ẢNH:**
     - Loại bỏ hoàn toàn khối `.message-bubble` có background màu.
     - Ảnh tự làm viền chính mình, bo góc tròn 14px mềm mại, viền siêu mỏng `1px solid rgba(0,0,0,0.08)`.
     - Timestamp giờ gửi được thiết kế dạng chip bán trong suốt (glassmorphic pill) nằm gọn gàng ở góc dưới phải của ảnh, hoặc đặt ngay dưới chân ảnh.
   - **Trường hợp tin nhắn CÓ CẢ CHỮ VÀ ẢNH:**
     - Chữ hiển thị trong bong bóng bình thường.
     - Ảnh gắn liền kề ngay bên dưới một cách liền mạch, không bị lồng vào nhau.
3. **Bố cục Thông minh khi gửi Nhiều Ảnh (Smart Grid Layout):**
   - **1 ảnh:** Kích thước lớn (max-width: 320px, max-height: 280px).
   - **2 ảnh:** Chia lưới 2 cột đều nhau (2 columns grid).
   - **3 ảnh:** 1 ảnh lớn + 2 ảnh nhỏ xếp bên cạnh/dưới.
   - **4 ảnh:** Lưới 2x2 cân xứng hoàn hảo.
   - **Từ 5 ảnh trở lên:** Hiển thị 4 ảnh đầu dạng lưới 2x2, ảnh thứ 4 có lớp phủ mờ `+N` (ví dụ `+2 ảnh`), click vào sẽ xem toàn bộ album.

---

### Module 6: Thư Viện Lightbox Gallery Overlay Chuyên Nghiệp (Xem Ảnh Đa Năng)
1. **Trải nghiệm mở ảnh:**
   - Click vào bất kỳ ảnh nào trên hệ thống hoặc trên widget: Mở ngay **Lightbox Gallery Overlay** tràn màn hình (không mở tab mới).
   - Nền tối cao cấp: `background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(10px);`.
2. **Tính năng điều hướng & phím tắt:**
   - Nút chuyển ảnh lớn: `<` (ảnh trước) và `>` (ảnh sau).
   - Hỗ trợ phím tắt bàn phím: Mũi tên trái `←` / phải `→`, lên `↑` / xuống `↓`, phím `Esc` để đóng gallery.
3. **Dãy ảnh xem trước (Thumbnail Strip Carousel):**
   - Dãy thumbnail thu nhỏ (60x60px) ở cạnh dưới, có viền sáng màu tím chỉ thị ảnh hiện tại.
   - Click vào thumbnail nào thì ảnh lớn lập tức nhảy sang ảnh đó.
4. **Thanh thông tin & Công cụ (Top Info Bar):**
   - Avatar + Tên người gửi ("Trần Thị Phương" hoặc "Khách nhật").
   - Thời gian gửi cụ thể ("23:43 · 20/10/2026").
   - Bộ đếm ảnh: `Ảnh 2 / 5`.
   - Nút Tải ảnh về máy (Download) + Nút Đóng (X).

---

### Module 7: Nâng Cấp Webchat Widget & Đồng Bộ 2 Chiều Toàn Diện
1. **Bổ sung tính năng gửi ảnh cho khách hàng trên Widget:**
   - Thêm nút icon máy ảnh / đính kèm tệp kế bên ô gõ tin nhắn trong `webchat.js`.
   - Cho phép khách chọn 1 hoặc nhiều ảnh, upload an toàn lên máy chủ.
   - Hiển thị ngay lập tức trên widget theo dạng Smart Grid.
2. **Khắc phục lỗi Widget không nhận được ảnh từ nhân viên:**
   - Sửa endpoint `/api/webchat/reply` trên Webhook Gateway để tiếp nhận `attachment_url` / `attachments` và `staff_avatar`.
   - Sửa `ChatController.php` và `workspace.js` để gửi đầy đủ `attachment_url` sang Gateway.
   - Sửa hàm `pollUpdates()` và `appendMessage()` trong `webchat.js` để bóc tách và render hình ảnh + tích hợp Lightbox Overlay tương tự như hệ thống.

---

## 3. Lộ Trình Triển Khai Từng Bước (Implementation Roadmap)

| Bước | Nội Dung Thực Hiện | Tệp Cần Chỉnh Sửa |
| :---: | :--- | :--- |
| **B1** | Cấu hình 10 Portrait Avatars Unsplash trong `constants.php` & `User.php`. Cập nhật avatar cho NV1 & NV2. | `config/constants.php`, `models/User.php` |
| **B2** | Tinh chỉnh Workspace: Gọt khoảng cách Seen Indicator, sửa Sidebar Phải (bỏ `#2`, sửa "Địa chỉ"), bổ sung khóa View-only khi Hết ca trực. | `views/chat/workspace.php`, `public/js/workspace.js`, `public/css/style.css` |
| **B3** | Thiết kế lại CSS bong bóng ảnh: Bỏ background màu khi gửi ảnh, xây dựng Smart Grid cho 1-5 ảnh. | `public/css/style.css` |
| **B4** | Xây dựng Module Lightbox Gallery Overlay (Stage, Next/Prev, Keyboard, Thumbnail Strip, Info Bar). | `public/js/workspace.js`, `public/css/style.css` |
| **B5** | Cập nhật Backend Gateway & PHP Controller để hỗ trợ gửi nhận ảnh 2 chiều và kèm Avatar nhân viên. | `controllers/ChatController.php`, `omnichannel-webhook-gateway/server.js` |
| **B6** | Cập nhật `public/widget/webchat.js`: Thêm nút gửi ảnh, nhận ảnh từ nhân viên, render ảnh chuẩn và nhúng Lightbox Gallery. | `public/widget/webchat.js` |
| **B7** | Triển khai qua FTP lên InfinityFree, cập nhật CDN jsDelivr và kiểm thử kiểm chứng E2E. | Hosting & CDN |
