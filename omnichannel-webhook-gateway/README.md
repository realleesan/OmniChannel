# OMNICHANNEL WEBHOOK GATEWAY (RENDER.COM)

Module tiếp nhận Webhook trung gian dành cho hệ thống **Omnichannel Chat Management System**, giải quyết triệt để rào cản tường lửa chống bot của **InfinityFree**.

---

## 1. Mục Đích Của Gateway Này
* **InfinityFree** có cơ chế bảo mật *vBot JavaScript Cookie (`__test`)*. Bất kỳ request POST nào từ bên ngoài (như Meta/Facebook Webhook, Zalo OA Webhook) mà không có cookie trình duyệt sẽ bị chặn mã lỗi `403 Forbidden`.
* **Render.com** cung cấp môi trường Web Service miễn phí, có domain HTTPS công khai (`https://*.onrender.com`), tiếp nhận 100% các request webhook từ Meta/Facebook/Zalo mà không gặp bất kỳ trở ngại nào.

---

## 2. Hướng Dẫn Triển Khai Lên Render.com (3 Phút)

### Bước 1: Đưa Thư Mục Này Lên GitHub
1. Mở terminal tại thư mục `omnichannel-webhook-gateway/`:
   ```bash
   git init
   git add .
   git commit -m "Deploy Omnichannel Webhook Gateway"
   ```
2. Đẩy lên một repository mới trên tài khoản GitHub cá nhân của bạn.

### Bước 2: Tạo Web Service Trên Render
1. Đăng nhập vào [Render.com](https://render.com).
2. Nhấn nút **New +** -> Chọn **Web Service**.
3. Chọn Repository GitHub vừa tạo.
4. Cấu hình thông số:
   * **Name:** `omnichannel-webhook-gateway` (hoặc tên tùy thích)
   * **Region:** Singapore (để có tốc độ về Việt Nam nhanh nhất)
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `node server.js`
   * **Plan Type:** `Free`
5. Nhấn **Advanced** -> Thêm **Environment Variables**:
   * `VERIFY_TOKEN`: `omnichannel_fb_token_ba2026`
   * `GATEWAY_KEY`: `omnichannel_secret_ba_2026`
6. Nhấn **Deploy Web Service**.
7. Sau ~1 phút, Render sẽ cấp cho bạn một URL công khai dạng:
   👉 `https://omnichannel-webhook-gateway.onrender.com`

---

## 3. Cấu Hình Webhook Trên Meta Facebook Developers (Tùy chọn)

Nếu bạn muốn kết nối với một Fanpage Facebook thật:
1. Truy cập [developers.facebook.com](https://developers.facebook.com).
2. Vào ứng dụng của bạn -> Chọn sản phẩm **Webhooks** (hoặc **Messenger**).
3. Tại phần Webhook Settings:
   * **Callback URL:** `https://omnichannel-webhook-gateway.onrender.com/webhook/facebook`
   * **Verify Token:** `omnichannel_fb_token_ba2026` (khớp với biến môi trường trên Render)
4. Bấm **Verify and Save**. Meta sẽ gọi `GET /webhook/facebook` và xác thực thành công ngay lập tức!
5. Đăng ký nhận sự kiện `messages`.

---

## 4. Các Endpoint Của Gateway

| Phương thức | Endpoint | Chức năng |
| :--- | :--- | :--- |
| `GET` | `/` | Kiểm tra trạng thái hoạt động (Health Check) |
| `GET` | `/webhook/facebook` | Xác thực handshake với Meta Developers |
| `POST` | `/webhook/facebook` | Tiếp nhận tin nhắn gửi từ khách Facebook |
| `POST` | `/webhook/zalo` | Tiếp nhận tin nhắn từ Zalo OA / zca-js |
| `GET` | `/api/messages/poll` | Rút danh sách tin nhắn đang chờ trong hàng đợi |
