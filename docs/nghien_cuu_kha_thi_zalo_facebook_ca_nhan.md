# BÁO CÁO NGHIÊN CỨU TÍNH KHẢ THI: TÍCH HỢP ZALO & FACEBOOK CÁ NHÂN (UNOFFICIAL API)

> **Dự án**: OmniChannel Chat System  
> **Tài liệu**: Nghiên cứu tính khả thi, phân tích rủi ro & lộ trình thực thi tích hợp kênh Zalo cá nhân và Facebook Messenger cá nhân  
> **Ngày lập**: 22/10/2026  
> **Trạng thái**: Nghiên cứu & Đề xuất kiến trúc (Chưa viết mã nguồn)

---

## 1. TỔNG QUAN BÀI TOÁN & MỤC TIÊU

Hệ thống OmniChannel hiện tại đã hoàn thiện xuất sắc kênh **Webchat** (đồng bộ 2 chiều thời gian thực giữa Webchat Widget và CRM Workspace, xử lý ảnh đính kèm cục bộ, phân phối nhân viên, template Google Sheet).

Bước tiếp theo là tích hợp 2 kênh mạng xã hội phổ biến nhất tại Việt Nam: **Zalo** và **Facebook Messenger**.
- **Yêu cầu đặc thù**: Sử dụng **Tài khoản cá nhân (Personal Profile)** thay vì Zalo OA (Official Account) hay Facebook Fanpage/App doanh nghiệp.
- **Phương pháp kỹ thuật**: Sử dụng các thư viện **Unofficial API / Reverse-Engineered Client** chạy trên môi trường Node.js Gateway.
- **Mục tiêu**:
  1. Tự động lắng nghe và hút tin nhắn gửi đến tài khoản Zalo/FB cá nhân về CRM.
  2. Hiển thị tin nhắn đa kênh trên giao diện làm việc tập trung (`views/chat/workspace.php`).
  3. Nhân viên có thể trực tiếp gõ tin nhắn phản hồi từ CRM gửi ngược lại cho khách hàng trên Zalo/FB.

---

## 2. NGHIÊN CỨU CHI TIẾT KÊNH ZALO CÁ NHÂN (`zca-js`)

### 2.1. Giới thiệu & Thư viện đề xuất
- **Thư viện**: [`zca-js`](https://github.com/RFS-ADRENO/zca-js) (Tác giả: *RFS-ADRENO / tdung*)
- **Tài liệu**: [zca-js GitBook](https://tdung.gitbook.io/zca-js/) | **NPM**: `zca-js`
- **Nguyên lý hoạt động**:
  - Mô phỏng chính xác giao thức Web Socket và REST API của phiên bản **Zalo Web** (`chat.zalo.me`).
  - Đăng nhập bằng cách giải mã session cookie (`zpw_sek`, `_zlang`, `imei`, `userAgent`) hoặc quét mã **QR Code**.
  - Lắng nghe sự kiện tin nhắn thời gian thực qua WebSocket (`api.listener.on('message', callback)`).

### 2.2. Điểm mạnh (Ưu điểm vượt trội)
1. **Khả năng bắt tin nhắn toàn diện**:
   - Nhận được tin nhắn văn bản, hình ảnh, file đính kèm, sticker, tin nhắn thoại, thông tin người gửi (UID, avatar, tên hiển thị).
2. **Hỗ trợ cơ chế Đăng nhập QR Code trực quan**:
   - Thư viện có sẵn hàm sinh QR Code dạng chuỗi Base64 / Data URL.
   - Ta có thể làm popup trên CRM: *"Quét mã QR để đăng nhập Zalo cá nhân"*. Nhân viên chỉ cần mở điện thoại quét một phát là Gateway lưu session thành công, không cần thao tác F12 copy cookie phức tạp!
3. **Độ ổn định cao tại Việt Nam**:
   - Vì Zalo Web là dịch vụ nội địa, giao thức mã hóa trên Web chưa bắt buộc E2EE (End-to-End Encryption) phức tạp như Messenger. Thư viện đọc được 100% nội dung tin nhắn văn bản thô.
4. **Tương thích hoàn hảo với Node.js Gateway**:
   - `zca-js` viết bằng TypeScript/JavaScript hiện đại, nhúng trực tiếp vào tiến trình `server.js` của Node.js Gateway trên Render mà không cần thêm runtime bên ngoài.

### 2.3. Rủi ro & Thách thức
| Rủi ro | Mức độ | Biện pháp giảm thiểu |
| :--- | :---: | :--- |
| **Vi phạm Điều khoản Zalo** | Trung bình | Zalo cấm dùng bot trên tài khoản cá nhân. **Khuyến cáo**: Sử dụng tài khoản SIM phụ / Zalo tư vấn riêng, không dùng tài khoản cá nhân chính chủ duy nhất. |
| **Hết hạn Session / Đăng xuất từ xa** | Thấp | Khi tài khoản đăng nhập trên quá nhiều thiết bị Zalo Web khác, phiên cũ có thể bị ngắt. Cần lưu lại cookie và có cơ chế thông báo trên CRM: *"Phiên Zalo hết hạn, vui lòng quét lại QR"*. |
| **Spam / Giới hạn tần suất gửi tin** | Trung bình | Không dùng để gửi tin spam hàng loạt (mass messaging). Chỉ dùng để trả lời 1-1 khi khách nhắn tin trước. |

---

## 3. NGHIÊN CỨU CHI TIẾT KÊNH FACEBOOK MESSENGER CÁ NHÂN

### 3.1. Hiện trạng hệ sinh thái Unofficial Facebook API
Dòng họ thư viện gốc `schmavery/facebook-chat-api` đã ngừng bảo trì từ nhiều năm trước do Meta liên tục thay đổi kiến trúc. Hiện nay cộng đồng mã nguồn mở duy trì qua các bản Fork nâng cao:

| Tên Thư Viện / Repo | Nguồn & Trạng Thái | Đánh Giá Kỹ Thuật |
| :--- | :--- | :--- |
| **`ws3-fca`**<br>*(NethGraves / ws3-fca)* | GitHub / NPM phổ biến nhất tại VN | ⭐ **Đề xuất chính**. Được cộng đồng bot Việt Nam cập nhật liên tục để sửa lỗi GraphQL, hỗ trợ nạp `AppState` (JSON cookies) và lắng nghe tin nhắn qua MQTT. |
| **`fca-unofficial`**<br>*(XaviaTeam / fca-unofficial)* | GitHub (XaviaTeam) | ⭐ **Dự phòng tốt**. Cấu trúc module chặt chẽ, tối ưu cho các hệ thống bot lâu dài, quản lý kết nối MQTT khá ổn định. |
| **`Meta-Horizon`** / `fca-horizon` | GitHub (JustKemForFun) | Chuyên dụng cho các bot Messenger tự động, có sẵn hướng dẫn tiếng Việt, tuy nhiên phụ thuộc nhiều vào framework riêng. |

### 3.2. Điểm mạnh
- Tự động hút tin nhắn của khách chat vào nick cá nhân thông qua MQTT WebSocket (`api.listenMqtt`).
- Hỗ trợ gửi tin nhắn văn bản, ảnh, video, audio phản hồi trực tiếp tới UID Facebook của khách.
- Hoạt động thông qua file `appstate.json` (Cookie export từ trình duyệt) mà không cần nhập mật khẩu hay vượt 2FA.

### 3.3. Rủi ro & Thách thức RẤT LỚN (Cần lưu ý đặc biệt)
1. **Làn sóng mã hóa đầu cuối mặc định của Meta (Messenger E2EE)**:
   - Từ năm 2024–2026, Meta bắt đầu bật **End-to-End Encryption** mặc định cho toàn bộ các cuộc trò chuyện Messenger cá nhân.
   - Khi cuộc trò chuyện chuyển sang E2EE, các thư viện MQTT Web API thông thường **KHÔNG THỂ giải mã được nội dung tin nhắn** (chỉ thấy thông báo tin nhắn mã hóa). Đây là rào cản kỹ thuật lớn nhất đối với Messenger cá nhân.
2. **Khóa tài khoản (Checkpoint 956 / 282)**:
   - Server Render Gateway đặt tại nước ngoài (Singapore / US / Frankfurt).
   - Khi một tài khoản Facebook cá nhân Việt Nam đăng nhập qua `AppState` từ một IP Datacenter nước ngoài, Facebook AI sẽ phát hiện "Hành vi đăng nhập bất thường từ thiết bị lạ" và **khóa Checkpoint ngay lập tức** (bắt xác minh khuôn mặt hoặc số điện thoại).
   - Để né checkpoint, hệ thống cần:
     + Chạy thông qua Proxy dân cư Việt Nam (Residential Proxy), HOẶC
     + Đặt Gateway Node.js chạy tại máy cục bộ (Localhost / VPS Việt Nam) thay vì Cloud quốc tế.
3. **Quy trình nạp Cookie phức tạp cho người dùng cuối**:
   - Facebook không có cơ chế quét mã QR cho Web API như Zalo.
   - Nhân viên phải cài extension (ví dụ *c_user, xs exporter* hoặc *EditThisCookie*), copy chuỗi JSON AppState rồi dán vào trang cấu hình CRM.

---

## 4. SO SÁNH TRỰC DIỆN GIỮA ZALO VÀ FACEBOOK CÁ NHÂN

| Tiêu Chí So Sánh | Zalo Cá Nhân (`zca-js`) | Facebook Cá Nhân (`ws3-fca`) |
| :--- | :---: | :---: |
| **Độ khả thi kỹ thuật** | **RẤT CAO (95%)** | **TRUNG BÌNH (60% - 65%)** |
| **Mức độ ổn định API** | Rất ổn định, ít đổi cấu trúc ngầm | Dễ vỡ khi Meta cập nhật frontend |
| **Cơ chế đăng nhập** | **Quét mã QR trực tiếp** (Cực kỳ tiện lợi) | Export JSON Cookie / AppState thủ công |
| **Ảnh hưởng bởi E2EE** | Hầu như không bị ảnh hưởng trên Web | **Bị ảnh hưởng nặng** nếu chat bật E2EE |
| **Nguy cơ Checkpoint IP lạ** | Thấp (Zalo dễ tính với IP Cloud) | **Rất cao** (Facebook quét gắt IP Cloud) |
| **Trải nghiệm nhân viên** | Mở app Zalo quét mã là xong | Phải biết cài extension lấy cookie |
| **Chi phí hạ tầng phụ trợ** | Không tốn thêm (Chạy thẳng trên Render) | Cần Proxy VN nếu muốn chống checkpoint |

---

## 5. KẾT LUẬN & ĐỀ XUẤT LỘ TRÌNH TRIỂN KHAI

### 5.1. Nên làm thằng nào trước?
👉 **KHUYẾN NGHỊ TUYỆT ĐỐI: TRIỂN KHAI ZALO CÁ NHÂN (`zca-js`) TRƯỚC!**

**Lý do:**
1. **Khả năng thành công ngay lập tức**: `zca-js` có thể chạy trơn tru ngay trên Render Node.js Gateway hiện tại mà không sợ bị chặn IP Datacenter.
2. **Tính năng Quét QR Đẳng Cấp**: Ta có thể xây dựng giao diện kết nối Zalo chuyên nghiệp ngay trên CRM:
   - Nhân viên bấm *"Kết nối Zalo cá nhân"*.
   - Màn hình hiển thị mã QR.
   - Nhân viên mở Zalo trên điện thoại quét xác nhận -> Gateway nhận token -> Kênh chuyển sang trạng thái `ONLINE` màu xanh lá!
3. **Độ ổn định cho bài toán kinh doanh**: Tại thị trường Việt Nam, khách hàng mua sắm và chốt đơn qua Zalo cá nhân có tỷ lệ phản hồi và chốt đơn rất cao.

---

### 5.2. Lộ trình triển khai khuyến nghị (2 Giai Đoạn)

#### GIAI ĐOẠN 1: TÍCH HỢP TOÀN DIỆN ZALO CÁ NHÂN (`zca-js`)
1. **Thiết kế giao diện Kết nối Zalo trên CRM Workspace**:
   - Thêm nút trạng thái kênh Zalo trên thanh công cụ hoặc sidebar.
   - Modal hiển thị mã QR lấy từ Gateway để quét đăng nhập.
2. **Cài đặt & Cấu hình `zca-js` trên Gateway Render**:
   - Khởi tạo tiến trình Zalo client.
   - Lắng nghe `api.listener.on('message')`:
     - Chuẩn hóa payload: `{ channel: 'ZALO', external_sender_id: msg.senderID, sender_name: msg.senderName, content: msg.body, attachment_url: ... }`.
     - Đẩy vào hàng đợi `pendingMessages` để CRM Workspace kéo về hiển thị.
3. **Luồng phản hồi từ nhân viên (CRM -> Gateway -> Zalo)**:
   - Khi nhân viên chat trong hội thoại có kênh `ZALO`, CRM gọi API `/api/zalo/send` trên Gateway.
   - Gateway dùng `api.sendMessage(content, threadId)` gửi trực tiếp tới Zalo khách.
4. **Kiểm thử thực tế**: Nhắn tin thử nghiệm từ tài khoản Zalo khác, nhận tin trên CRM và trả lời lại.

#### GIAI ĐOẠN 2: NGHIÊN CỨU & THỬ NGHIỆM FACEBOOK CÁ NHÂN (`ws3-fca`)
1. Tạo môi trường kiểm thử với nick Facebook clone / phụ (tuyệt đối không dùng nick chính để tránh rủi ro checkpoint cá nhân).
2. Tích hợp `ws3-fca` vào Gateway với endpoint nạp AppState (đã có sẵn khung sườn trong `server.js`).
3. Đánh giá tỷ lệ tin nhắn bị mã hóa E2EE và giải pháp vượt qua.
