# HƯỚNG DẪN KHỞI TẠO SERVER RENDER CHO ZALO GATEWAY (`zca-js`)

> **Tài liệu hướng dẫn từng bước (Step-by-Step) thiết lập Web Service độc lập trên Render.com dành cho kênh Zalo Cá Nhân.**

---

## 1. TẠI SAO CẦN 1 SERVER RENDER RIÊNG CHO ZALO?
1. **Chống ngắt kết nối WebSocket**: `zca-js` duy trì kết nối WebSocket thường trực với máy chủ Zalo. Tách riêng giúp bạn dễ dàng cài đặt UptimeRobot ping liên tục để server **không bao giờ bị ngủ đông (Spin-Down)**.
2. **Bảo toàn bộ nhớ**: Render Free cấp 512MB RAM. Chạy riêng giúp Zalo có trọn vẹn tài nguyên để xử lý mã hóa, giải mã ảnh và lưu trữ phiên QR.
3. **Cô lập rủi ro**: Nếu Zalo cần đăng nhập lại hoặc restart tiến trình thì kênh Webchat và hệ thống CRM chính hoàn toàn không bị ảnh hưởng.

---

## 2. CHUẨN BỊ MÃ NGUỒN TRÊN REPO GITHUB

Trong repo `realleesan/OmniChannel`, chúng ta sẽ có sẵn thư mục riêng biệt:
📁 **`omnichannel-zalo-gateway/`** chứa toàn bộ mã nguồn Node.js độc lập của Zalo (`package.json`, `server.js`, thư viện `zca-js`).

Bạn không cần tạo repo GitHub mới, vì Render hỗ trợ tính năng **Root Directory** (trỏ thẳng vào thư mục con của repo hiện tại).

---

## 3. CÁC BƯỚC TẠO SERVICE TRÊN RENDER.COM (MẤT 2 PHÚT)

### Bước 1: Đăng nhập Render.com
1. Truy cập [dashboard.render.com](https://dashboard.render.com).
2. Bấm vào nút **`New +`** (màu xanh ở góc trên bên phải) -> Chọn **`Web Service`**.

---

### Bước 2: Kết nối Repository
1. Tại danh sách GitHub repositories, tìm và chọn repo: **`realleesan/OmniChannel`** (Bấm nút **Connect**).
   *(Nếu dùng tài khoản Render khác tài khoản GitHub, bạn chỉ cần dán link Public Git repository vào ô "Public Git repository").*

---

### Bước 3: Cấu hình thông số Service

Điền các thông số chính xác như sau:

| Mục thiết lập | Giá trị cần điền | Ghi chú giải thích |
|---|---|---|
| **Name** | `omnichannel-zalo-gateway` *(hoặc tên tùy thích)* | Tên định danh cho server của bạn |
| **Region** | **Singapore** *(Khuyến nghị số 1)* | Server gần Việt Nam nhất để kết nối Zalo siêu nhanh |
| **Branch** | `main` | Nhánh code chính |
| **Root Directory** | **`omnichannel-zalo-gateway`** | ⚠️ **RẤT QUAN TRỌNG**: Bắt buộc điền đúng tên thư mục này để Render chỉ build phần Zalo |
| **Runtime** | `Node` | Môi trường thực thi JavaScript |
| **Build Command** | `npm install` | Cài đặt `express`, `cors`, `zca-js` |
| **Start Command** | `npm start` | Khởi chạy service `node server.js` |
| **Instance Type** | **Free** ($0/month) | Miễn phí 512MB RAM |

---

### Bước 4: Cấu hình biến môi trường (Environment Variables)
Kéo xuống mục **Environment Variables** (hoặc bấm **Advanced**), thêm 2 biến sau:

1. **`ZALO_GATEWAY_KEY`** : `omnichannel_zalo_secret_2026` *(Khóa bảo mật webhook)*
2. **`CRM_WEBHOOK_URL`** : `https://omnichannel.gt.tc/api/zalo_action.php` *(Đường dẫn đẩy tin nhắn về CRM)*

---

### Bước 5: Bấm Deploy
1. Nhấn nút **`Create Web Service`** ở cuối trang.
2. Render sẽ tự động kéo code, chạy `npm install` và khởi động server.
3. Khi thấy dòng chữ **`==> Your service is live 🎉`** màu xanh lá, server đã hoạt động thành công!
4. Render sẽ cấp cho bạn một đường link công khai ở góc trên bên trái, có dạng:
   👉 **`https://omnichannel-zalo-gateway.onrender.com`** *(Lưu lại link này để gửi cho tôi)*.

---

## 4. CẤU HÌNH UPTIMEROBOT ĐỂ GIỮ SERVER KHÔNG BAO GIỜ BỊ NGỦ (CHỐNG SPIN-DOWN)

Vì Render Free sẽ tắt server sau 15 phút không có khách, bạn cấu hình UptimeRobot để "đánh thức" server 5 phút/lần:

1. Đăng nhập vào [uptimerobot.com](https://uptimerobot.com/) (miễn phí).
2. Bấm **`+ Add New Monitor`**.
3. Điền thông tin:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `Zalo Gateway Keep-Alive`
   - **URL (or IP):** `https://<ten-service-render-cua-ban>.onrender.com/health`
   - **Monitoring Interval:** `5 minutes`
4. Bấm **`Create Monitor`**.
5. 👉 **Kết quả:** UptimeRobot sẽ tự động gửi tín hiệu "ping" mỗi 5 phút, máy chủ Render Zalo của bạn sẽ **thức liên tục 24/7**, giữ kết nối WebSocket của Zalo luôn sẵn sàng nhận tin nhắn của người thân bất cứ lúc nào!

---

## 5. BẠN CẦN CUNG CẤP GÌ CHO TÔI SAU KHI TẠO XONG?

Sau khi hoàn thành các bước trên, bạn chỉ cần gửi cho tôi **DUY NHẤT 1 THÔNG TIN**:

> 📋 **URL Web Service Zalo của bạn trên Render**  
> *(Ví dụ: `https://omnichannel-zalo-gateway.onrender.com` hoặc tên miền phụ mà Render vừa cấp cho bạn)*

Tôi sẽ dùng URL này để:
1. Cấu hình vào file kết nối CRM phía PHP (`config/gateway.php` hoặc bảng cấu hình).
2. Tích hợp nút quét mã QR Zalo trên màn hình Workspace gọi trực tiếp sang server Render Zalo của bạn.
3. Hoàn tất toàn bộ luồng nhận và trả lời tin nhắn Zalo tự động!
