# KẾ HOẠCH NÂNG CẤP TOÀN DIỆN OMNICHAT & WEBCHAT WIDGET
*Tài liệu đặc tả kỹ thuật và lộ trình thực thi theo yêu cầu người dùng*

---

## 1. MỤC TIÊU VÀ DANH SÁCH NHIỆM VỤ

| STT | Nhiệm vụ | Phạm vi ảnh hưởng | Giải pháp kỹ thuật |
|---|---|---|---|
| **1** | **Widget: Nhận diện & hiển thị Nhân viên tư vấn** | `public/widget/webchat.js`, Gateway | Header widget hiển thị avatar thật và tên nhân viên tư vấn đang phụ trách. Mỗi tin nhắn của nhân viên hiển thị avatar và tên tương ứng. |
| **2** | **Sửa logic ghi đè Banner CHẾ ĐỘ CHỈ XEM** | `public/js/workspace.js` | Ưu tiên số 1: Hội thoại của nhân viên khác (`isOtherStaff`) thì giữ nguyên thông báo `Hội thoại đang được phụ trách bởi [Tên NV]`. Chỉ khi là hội thoại của chính mình và bản thân OFFLINE thì mới hiện thông báo `Hội thoại sẽ được phân chia cho nhân viên khác do bạn đang hết ca`. |
| **3** | **Sửa hiện tượng `[Bắt đầu trò chuyện]`** | `models/Message.php`, `models/Conversation.php`, `public/js/workspace.js` | Khi tin nhắn chỉ có ảnh, cập nhật `last_message = '[Hình ảnh]'` (hoặc `Bạn: [Hình ảnh]`). Sửa logic hiển thị snippet để không bị rỗng. |
| **4** | **Chuẩn hóa bộ lọc Tất cả / Của tôi / Chưa đọc** | `views/chat/workspace.php`, `public/js/workspace.js`, `models/Conversation.php` | Click thẳng vào `Chưa đọc` sẽ kích hoạt ngay tab lọc unreplied. Phân tách rõ ràng tab `all`, `mine`, `unreplied`. |
| **5** | **Tìm kiếm Sidebar Trái chuẩn phong cách Zalo** | `views/chat/workspace.php`, `public/js/workspace.js`, `public/css/style.css`, `api/search_action.php` | Khi focus/nhập search, sidebar chuyển sang Search View chuyên dụng với 3 sub-tab: **Tất cả** (tối đa 5 khách, 5 tin nhắn + nút Xem thêm), **Khách hàng** (danh sách đầy đủ), **Tin nhắn** (danh sách tin nhắn có highlight từ khóa). Click vào kết quả sẽ chuyển về hội thoại và tab tương ứng. |
| **6** | **Cơ chế Đã Đọc & Badge đếm tin chưa đọc bên Widget** | `public/widget/webchat.js`, `omnichannel-webhook-gateway/server.js` | Khi Widget đóng, tin nhắn mới từ nhân viên chưa tính là đã đọc và hiển thị Badge đỏ đếm số lượng trên launcher icon. Khi khách mở widget và focus box chat mới gửi tín hiệu đã đọc và xóa badge. |
| **7** | **Âm thanh thông báo tin nhắn mới (Sound Notification)** | `public/js/workspace.js`, `public/widget/webchat.js` | Tích hợp âm thanh chuông nhẹ nhàng thông qua Web Audio API (Synthesizer Chime) không lo bị lỗi 404 mạng, phát khi có tin mới ở cả CRM và Widget. |

---

## 2. CHI TIẾT THIẾT KẾ & LUỒNG XỬ LÝ

### 2.1. Widget Header: Hiển thị thông tin Nhân viên tư vấn
- **Trạng thái ban đầu (chưa có NV chat):**
  - Avatar: Icon tai nghe mặc định.
  - Tiêu đề: *Hỗ Trợ Khách Hàng*.
  - Phụ đề: *Thường phản hồi ngay lập tức*.
- **Khi nhân viên gửi tin nhắn / được phân công:**
  - `staff_name` và `staff_avatar` được gateway và CRM truyền về.
  - Avatar: Đổi sang ảnh chân dung Unsplash của nhân viên phụ trách.
  - Tiêu đề: `[Tên Nhân Viên] (Tư vấn viên)`.
  - Phụ đề: `Đang trực tuyến` (kèm chấm xanh online).

### 2.2. Khắc phục logic Banner Chế Độ Chỉ Xem
- Cập nhật hàm `evaluateViewOnlyLock()` trong `public/js/workspace.js`:
  ```javascript
  const isOtherStaff = Boolean(activeConv && activeConv.assigned_user_id && activeConv.assigned_user_id != window.APP_CONFIG?.CURRENT_USER_ID);
  const isShiftOffline = (window.APP_CONFIG?.CURRENT_STATUS === 'OFFLINE');

  if (isOtherStaff) {
      // ƯU TIÊN 1: Khách của người khác -> LUÔN LUÔN BẢO VỆ ĐƠN HÀNG CỦA ĐỒNG NGHIỆP
      AppState.isViewOnly = true;
      lockBanner.style.display = 'flex';
      inputArea.style.display = 'none';
      lockTitle.innerText = 'CHẾ ĐỘ CHỈ XEM';
      lockDesc.innerText = `Hội thoại đang được phụ trách bởi ${activeConv.assigned_fullname || 'nhân viên khác'}. Bạn không có quyền gửi tin nhắn.`;
  } else if (isShiftOffline) {
      // ƯU TIÊN 2: Khách của mình nhưng bản thân ĐÃ HẾT CA
      AppState.isViewOnly = true;
      lockBanner.style.display = 'flex';
      inputArea.style.display = 'none';
      lockTitle.innerText = 'CHẾ ĐỘ CHỈ XEM';
      lockDesc.innerText = 'Hội thoại sẽ được phân chia cho nhân viên khác do bạn đang hết ca. Bạn không có quyền gửi tin nhắn.';
  } else {
      // Bình thường -> Mở khóa chat
      AppState.isViewOnly = false;
      lockBanner.style.display = 'none';
      inputArea.style.display = 'block';
  }
  ```

### 2.3. Sửa triệt để hiện tượng `[Bắt đầu trò chuyện]`
1. Trong `models/Message.php`:
   - Khi lưu tin nhắn mới, nếu `content` rỗng và có `attachment_url`:
     `$summary = '[Hình ảnh]';`
   - Gọi `updateLastMessage($conversationId, $summary, $senderType, $newStatus)`.
2. Trong `public/js/workspace.js`:
   - Nếu `conv.last_message` rỗng hoặc null:
     Kiểm tra `conv.last_message_at`: nếu có mốc thời gian thì hiển thị `[Tin nhắn]` hoặc `[Hình ảnh]`.
     Chỉ khi không hề có tin nhắn nào mới hiển thị `<i>[Chưa có tin nhắn]</i>`.

### 2.4. Thiết kế hệ thống Tìm kiếm Sidebar Trái (Chuẩn Zalo)
- **Giao diện khi kích hoạt tìm kiếm:**
  - Ô search có nút `X` để xóa và nút `Đóng` để quay về sidebar bình thường.
  - Phía dưới thanh search là thanh chuyển 3 tab:
    `[ Tất cả ] [ Khách hàng ] [ Tin nhắn ]`
  - **Tab Tất cả:**
    - Khối 1: *KHÁCH HÀNG* (Tối đa 5 thẻ). Nếu > 5 thẻ, có nút bấm `Xem thêm (N) >` tự động chuyển sang tab *Khách hàng*.
    - Khối 2: *TIN NHẮN* (Tối đa 5 kết quả). Hiển thị tên khách, đoạn tin nhắn có chữ in đậm khớp từ khóa, thời gian. Nếu > 5 thì có nút `Xem thêm (N) >` chuyển sang tab *Tin nhắn*.
  - **Tab Khách hàng:** Danh sách đầy đủ toàn bộ khách hàng khớp tên/SĐT.
  - **Tab Tin nhắn:** Danh sách đầy đủ toàn bộ tin nhắn khớp nội dung trong lịch sử chat.
  - **Hành vi khi click vào kết quả:**
    - Xác định khách hàng thuộc về ai tại thời điểm click.
    - Chuyển `currentTab` về `mine` (nếu của mình) hoặc `all` (nếu của người khác/chưa gán).
    - Mở cuộc trò chuyện đó (`selectConversation`), cuộn tới thẻ khách hàng ở sidebar, và highlight tin nhắn khớp nếu có!

### 2.5. Cơ chế Đã Đọc & Badge đếm tin chưa đọc Widget
- Thêm biến `unreadCount = 0` trong `webchat.js`.
- Trên launcher chat: Thêm badge tròn đỏ `#omni-unread-badge`.
- Khi có tin nhắn mới từ `STAFF`:
  - Nếu `!isOpen` (Widget đang đóng) hoặc document không focus:
    - `unreadCount++`
    - Cập nhật số trên badge đỏ `#omni-unread-badge` (nếu > 0 thì `display: flex`).
    - Phát âm thanh tin nhắn mới.
    - **KHÔNG** gửi tín hiệu đã đọc về server.
  - Nếu `isOpen` và đang mở:
    - Xóa badge (`unreadCount = 0`).
    - Gửi API mark read về server.
- Khi người dùng click mở launcher:
  - `unreadCount = 0`, ẩn badge đỏ.
  - Gửi API mark read về server.

### 2.6. Âm thanh thông báo tin nhắn mới (Web Audio API Synthesizer)
- Sử dụng AudioContext để tổng hợp âm thanh chuông "Ting-Ting" hai nốt trong trẻo (tần số 587Hz -> 880Hz, decay êm ái), độc lập hoàn toàn với việc tải file audio ngoài, đảm bảo 100% không bị lỗi mạng hay chặn CORS.
- Tích hợp cả trên CRM Workspace (khi khách gửi tin) và Webchat Widget (khi nhân viên gửi tin).

---

## 3. LỘ TRÌNH THỰC THI

1. **Bước 1**: Cập nhật logic backend (`models/Message.php`, `models/Conversation.php`, `api/search_action.php`).
2. **Bước 2**: Nâng cấp `public/css/style.css` (Giao diện tìm kiếm Zalo, badge unread widget, tab unread).
3. **Bước 3**: Cập nhật `views/chat/workspace.php` (Markup tìm kiếm Zalo 3 tab, nút unread cải tiến).
4. **Bước 4**: Cập nhật `public/js/workspace.js` (Search Zalo, fix view-only lock, fix unread filter, Web Audio chime).
5. **Bước 5**: Cập nhật `public/widget/webchat.js` (Staff header avatar & name, badge đếm tin chưa đọc, Web Audio chime, mark read event).
6. **Bước 6**: Triển khai FTP lên máy chủ InfinityFree qua `D:\xampp\php\php.exe`.
7. **Bước 7**: Git commit và push `origin main`.
8. **Bước 8**: Kiểm thử toàn diện và báo cáo kết quả.
