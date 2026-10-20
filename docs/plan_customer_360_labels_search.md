# KẾ HOẠCH CHI TIẾT: CHUẨN HÓA SIDEBAR PHẢI (CUSTOMER 360), HỢP NHẤT NHÃN, SỬA SEARCH & ĐỒNG BỘ AVATAR
> **File tài liệu**: `docs/plan_customer_360_labels_search.md`  
> **Mục tiêu**: Chuẩn hóa toàn bộ trải nghiệm người dùng theo nghiệp vụ thực tế CRM đa kênh, loại bỏ các chi tiết thừa thãi/giả lập, hợp nhất nhãn, sửa triệt để tìm kiếm và thiết kế hoàn chỉnh Sidebar phải.

---

## I. TỔNG QUAN CÁC VẤN ĐỀ CẦN GIẢI QUYẾT

1. **Đồng bộ màu sắc Avatar Khách Hàng**:
   * *Hiện trạng*: Avatar khách ở Sidebar trái và Bong bóng chat đang dùng tím đậm (`#6366F1`), trong khi ở Topbar và Sidebar phải lại dùng xanh tím pastel (`#EEF2FF`).
   * *Yêu cầu*: Thống nhất 100% màu sắc Avatar khách hàng trên toàn bộ 4 vị trí giao diện. Phân định rõ màu của Nhân viên (Tím đậm `#6366F1`) và Khách hàng (Pastel `#EEF2FF`).

2. **Thanh tìm kiếm (Search) ở Sidebar trái chưa hoạt động đúng**:
   * *Hiện trạng*: Khi gõ tìm kiếm, câu lệnh SQL bị kẹt trong điều kiện `assigned_user_id` của tab "Của tôi", đồng thời chỉ tìm ở tin nhắn cuối cùng (`last_message`).
   * *Yêu cầu*: Tìm kiếm theo cả Tên khách hàng và Toàn bộ nội dung tin nhắn trong lịch sử chat (`messages`). Khi tìm kiếm, mở rộng phạm vi ra toàn bộ khách hàng để tìm là thấy ngay.

3. **Hợp nhất cơ chế Nhãn (Loại bỏ "Tiến độ tư vấn")**:
   * *Hiện trạng*: Hệ thống đang tồn tại song song 2 loại nhãn gây rối: `Tiến độ tư vấn` (cố định) và `Nhãn hội thoại` (tùy biến).
   * *Yêu cầu*: Xóa bỏ hoàn toàn "Tiến độ tư vấn". Đưa danh sách nhãn tùy biến ra hiển thị trực tiếp dạng Chip/Pill chọn nhanh tại Sidebar phải. Hỗ trợ 1 khách chọn nhiều nhãn, cơ chế Click 2 lần để hủy nhãn (Toggle). Phân quyền: Khách của người khác (View-only) thì không được gắn/hủy nhãn.

4. **Thiết kế hoàn chỉnh Sidebar Phải (Tóm Tắt Khách Hàng CRM)**:
   * *Hiện trạng*: Chứa version `v1.0` và các trường regex giả lập ("Size thường mặc", "Mua gần nhất").
   * *Yêu cầu*: Bỏ version `v1.0`. Xây dựng các trường dữ liệu thực tế của một hệ thống CRM (Tên kênh, Tên thật, SĐT, Địa chỉ, Nhu cầu, Tóm tắt). Thêm mốc thời gian `Cập nhật từ dd/mm/yyyy đến dd/mm/yyyy`. Nút bấm tinh gọn `[Cập nhật hồ sơ]` (chuẩn bị sẵn cấu trúc để tích hợp AI sau). Phân quyền: Chế độ chỉ xem không cho sửa.

---

## II. ĐẶC TẢ CHI TIẾT & GIẢI PHÁP KỸ THUẬT

### Hạng mục 1: Đồng bộ Avatar Khách Hàng (Customer Avatar Uniformity)

* **Vị trí áp dụng**:
  1. Thẻ hội thoại danh sách bên trái (`.card-avatar-circle`)
  2. Bong bóng chat tin nhắn của khách (`.message-customer-avatar`)
  3. Header topbar giữa màn hình (`.partner-avatar`)
  4. Thẻ tóm tắt trên Sidebar phải (`.customer-avatar-large`)
  5. Icon báo đã xem mini dưới tin nhắn (`.seen-avatar-mini`)
* **Quy chuẩn màu sắc CSS**:
  * **Khách hàng**: 
    * `background: linear-gradient(135deg, #EEF2FF, #E0E7FF);`
    * `color: #4F46E5;`
    * `border: 1px solid #C7D2FE;`
    * `font-weight: 700;`
  * **Nhân viên (Agent)**:
    * `background: linear-gradient(135deg, #6366F1, #8B5CF6);`
    * `color: #FFFFFF;`
    * `font-weight: 700;`
* **Kết quả**: Giao diện đạt độ liền mạch, người dùng nhìn vào là nhận diện được ngay ai là khách, ai là nhân viên.

---

### Hạng mục 2: Tối ưu hóa Thanh Tìm Kiếm (Universal Search)

* **Logic tìm kiếm trong `models/Conversation.php`**:
  * Khi `!empty($search)`:
    * Tự động bỏ qua điều kiện `c.assigned_user_id = :current_user_id` của tab "Của tôi", cho phép tìm kiếm xuyên suốt toàn bộ cơ sở dữ liệu.
    * Nâng cấp câu truy vấn SQL tìm kiếm sâu vào bảng tin nhắn:
      ```sql
      AND (
          c.sender_name LIKE :search 
          OR c.last_message LIKE :search 
          OR EXISTS (
              SELECT 1 FROM messages m 
              WHERE m.conversation_id = c.id 
              AND m.content LIKE :search
          )
      )
      ```
* **Trải nghiệm tương tác tại Frontend (`public/js/workspace.js`)**:
  * Hàm `handleSearch(val)` áp dụng cơ chế debounce 300ms.
  * Hiển thị nút `X` (Clear search) khi có ký tự. Bấm `X` sẽ xóa trắng ô tìm kiếm và nạp lại danh sách theo tab hiện tại.
  * Nếu không tìm thấy, hiển thị empty state: *"Không tìm thấy hội thoại nào phù hợp với từ khóa '{từ khóa}'"*.

---

### Hạng mục 3: Hợp nhất Cơ Chế Nhãn & Cơ Chế Toggle 2 Lần Hủy

* **Bỏ "Tiến độ tư vấn"**:
  * Gỡ bỏ hoàn toàn khối HTML `<div class="tag-selector-widget">` trong `views/chat/workspace.php`.
  * Xóa bỏ các tham chiếu đến `convTagRadio`, `handleTagChange` trong JavaScript.
* **Tái thiết kế khối Nhãn Hội Thoại ở Sidebar Phải**:
  * Hiển thị trực tiếp danh sách tất cả các nhãn (Labels) dưới dạng các Chip/Pill màu sắc nổi bật, bo góc mềm mại ngay tại Sidebar phải.
  * Mỗi Chip gồm: Icon nhãn + Tên nhãn + Trạng thái đã chọn (Active border / Check icon).
  * Bên cạnh có nút nhỏ `[+ Tạo nhãn]` để mở modal tạo thêm nhãn mới vào hệ thống nếu cần.
* **Cơ chế Toggle chọn nhiều & hủy nhanh**:
  * Khi click vào 1 nhãn:
    * *Nếu khách chưa có nhãn này*: Gửi AJAX gán nhãn -> Chip sáng lên, có viền màu đậm và dấu tick -> Thẻ hội thoại bên trái cập nhật hiển thị nhãn ngay lập tức.
    * *Nếu khách đã có nhãn này (Click lần 2)*: Gửi AJAX gỡ nhãn -> Chip trở về trạng thái bình thường (Inactive) -> Thẻ bên trái tự động gỡ nhãn.
* **Kiểm soát phân quyền (Permission Guard)**:
  * Nếu cuộc trò chuyện đang ở chế độ chỉ xem (`is_view_only = true`):
    * Khối nhãn hiển thị ở chế độ đọc, con trỏ chuột dạng `not-allowed`, click vào sẽ hiện thông báo: *"Hội thoại do nhân viên khác phụ trách, bạn không thể thay đổi nhãn"*.

---

### Hạng mục 4: Thiết Kế Đầy Đủ Sidebar Phải (Customer 360 CRM)

* **Loại bỏ**:
  * Bỏ chip hiển thị `v1.0` (`#scanVersionBadge`).
  * Bỏ các trường regex giả lập ("Size thường mặc", "Mua gần nhất", "Cảnh báo boom hàng").
* **Cấu trúc trường dữ liệu CRM thực tế**:
  1. **Khối Header Khách Hàng**:
     * Avatar khách hàng chuẩn màu đồng bộ.
     * Tên hiển thị từ kênh (kèm badge icon Webchat / Zalo / Facebook).
     * Mã định danh hội thoại (ví dụ: `#1`).
  2. **Khối Thông Tin Chi Tiết (Có nút chỉnh sửa nhanh từng trường)**:
     * **Tên thật khách hàng** (`real_name`): Tên thật do khách cung cấp.
     * **Số điện thoại** (`phone`): SĐT liên hệ của khách.
     * **Địa chỉ giao hàng** (`address`): Địa chỉ nhận hàng hoặc khu vực/tỉnh thành.
     * **Nhu cầu / Sản phẩm quan tâm** (`customer_needs`): Sản phẩm hoặc dịch vụ khách muốn tư vấn.
     * **Tóm tắt trao đổi** (`conversation_summary`): Tóm tắt ngắn gọn tình trạng tư vấn hiện tại.
  3. **Khối Thời Gian Ghi Nhận**:
     * Dòng hiển thị: `Dữ liệu ghi nhận từ: [dd/mm/yyyy] đến [dd/mm/yyyy]`.
  4. **Nút Thao Tác Cập Nhật**:
     * Nút bấm: `<button class="btn-update-profile"><i class="fa-solid fa-arrows-rotate"></i> CẬP NHẬT HỒ SƠ</button>`.
     * *Chức năng hiện tại*: Lưu các trường thông tin cập nhật vào CSDL, làm mới thời gian ghi nhận.
     * *Chuẩn bị cho tương lai*: Điểm móc (hook) sẵn sàng để khi cần chỉ việc gắn API AI (Gemini Flash) vào là tự động quét nội dung chat đổ vào các trường này.
  5. **Kiểm soát phân quyền (View-only)**:
     * Khi `is_view_only = true`, nút `Cập nhật hồ sơ` và các nút chỉnh sửa tay chuyển sang trạng thái disabled (hoặc ẩn), chỉ người đang phụ trách mới được cập nhật.

---

## III. BẢNG THAY ĐỔI CƠ SỞ DỮ LIỆU & FILE MÃ NGUỒN

### 1. Nâng cấp bảng `customer_profiles` (MySQL)
Bổ sung các cột thực tế phục vụ CRM:
* `real_name VARCHAR(150) NULL` - Tên thật
* `phone VARCHAR(50) NULL` - Số điện thoại
* `address VARCHAR(255) NULL` - Địa chỉ
* `customer_needs TEXT NULL` - Nhu cầu / Sản phẩm
* `conversation_summary TEXT NULL` - Tóm tắt hội thoại
* `from_date DATE NULL` - Ngày bắt đầu chat
* `to_date DATE NULL` - Ngày cập nhật hiện tại

### 2. Danh sách file sẽ thực hiện điều chỉnh
1. [`public/css/style.css`](file:///d:/TAI%20LIEU%20HOC/N%C4%82M%204/BA/OmniChannel/public/css/style.css):
   * Đồng bộ màu avatar khách hàng trên cả 4 vị trí.
   * Tạo style mới cho khối Nhãn dạng Chip Toggle trên Sidebar phải.
   * Xây dựng layout thẻ thông tin bóc tách CRM gọn gàng, hiện đại.
2. [`views/chat/workspace.php`](file:///d:/TAI%20LIEU%20HOC/N%C4%82M%204/BA/OmniChannel/views/chat/workspace.php):
   * Xóa bỏ khối `tag-selector-widget` (Tiến độ tư vấn).
   * Thay thế giao diện Sidebar phải với các trường CRM thực tế và nút "Cập nhật hồ sơ".
   * Bỏ version `v1.0`.
3. [`models/Conversation.php`](file:///d:/TAI%20LIEU%20HOC/N%C4%82M%204/BA/OmniChannel/models/Conversation.php):
   * Viết lại điều kiện `search`: tìm xuyên suốt toàn bộ tin nhắn và bỏ qua kẹp tab "Của tôi" khi có từ khóa tìm kiếm.
4. [`models/CustomerProfile.php`](file:///d:/TAI%20LIEU%20HOC/N%C4%82M%204/BA/OmniChannel/models/CustomerProfile.php):
   * Cập nhật các trường dữ liệu CRM mới (`real_name`, `phone`, `address`, `customer_needs`, `conversation_summary`, `from_date`, `to_date`).
5. [`public/js/workspace.js`](file:///d:/TAI%20LIEU%20HOC/N%C4%82M%204/BA/OmniChannel/public/js/workspace.js):
   * Viết hàm xử lý Toggle nhãn (Click 1 lần thêm, click lần 2 hủy).
   * Viết hàm render danh sách nhãn dạng chip trên Sidebar phải.
   * Cập nhật hàm render thông tin hồ sơ khách hàng CRM và xử lý nút "Cập nhật hồ sơ".
   * Thêm logic chặn thao tác khi `is_view_only = true`.
6. [`api/customer_action.php`](file:///d:/TAI%20LIEU%20HOC/N%C4%82M%204/BA/OmniChannel/api/customer_action.php) & [`api/label_action.php`](file:///d:/TAI%20LIEU%20HOC/N%C4%82M%204/BA/OmniChannel/api/label_action.php):
   * Hỗ trợ API toggle gán/hủy nhãn và lưu thông tin CRM.

---

## IV. QUY TRÌNH THỰC HIỆN TUẦN TỰ (EXECUTION PHASES)

* **Bước 1**: Cập nhật CSDL tự động qua script (bổ sung các cột CRM cho `customer_profiles`).
* **Bước 2**: Sửa SQL tìm kiếm trong `models/Conversation.php` và kiểm tra thanh Search.
* **Bước 3**: Đồng bộ màu Avatar khách hàng trong `public/css/style.css` và `public/js/workspace.js`.
* **Bước 4**: Xóa bỏ "Tiến độ tư vấn", triển khai cơ chế Nhãn Toggle chọn nhiều trên Sidebar phải.
* **Bước 5**: Dựng lại toàn bộ giao diện và chức năng của Sidebar phải (Thông tin CRM thực tế, ngày tháng, nút cập nhật hồ sơ, phân quyền View-only).
* **Bước 6**: Triển khai FTP lên InfinityFree, commit Git và thông báo người dùng kiểm thử.
