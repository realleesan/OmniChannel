
I. Tổng quan Dự án & Mức độ Khả thi của Bản DemoDự án xây dựng phần mềm Hệ thống Quản lý Hội thoại Bán hàng Đa kênh (Omnichannel Chat Management System) theo mô hình kiến trúc MVC (Model – View – Controller) sử dụng PHP thuần, CSS, JavaScript và cơ sở dữ liệu MySQL.   Mức độ hoàn thiện của Bản Demo (Demo Scope)Bản demo được định vị ở mức Ứng dụng chạy thực tế trên môi trường Local (Local Working Program), vượt chuẩn mức Prototype/Mockup tĩnh trên Figma:   Môi trường chạy: XAMPP / WampServer / Docker (PHP 8.x + MySQL).   Cơ chế thời gian thực (Real-time simulation): Sử dụng kỹ thuật AJAX Polling (chu kỳ 2–3 giây) hoặc Server-Sent Events (SSE) bằng JavaScript để mô phỏng luồng tin nhắn đổ về và nhảy số phiên bản mà không cần cài đặt hạ tầng WebSocket phức tạp.   Kịch bản kiểm thử song song: Chạy đồng thời 2 trình duyệt độc lập (ví dụ: Google Chrome cho Nhân viên 1 và Cửa sổ Ẩn danh / Firefox cho Nhân viên 2) để trình diễn trực tiếp cơ chế chia tải và khóa quyền phản hồi (View-only).   Phương án kết nối kênh thực tế (Omnichannel Gateway)Kênh Webchat (Ưu tiên số 1 - Chạy thật 100%):Xây dựng một widget chat nhỏ gọn bằng HTML/JS/CSS nhúng trực tiếp vào website sẵn có thông qua một thẻ  hoặc mở trên một trang web riêng biệt.   Khi khách hàng gõ tin nhắn trên website, widget gửi HTTP POST request đến endpoint API của backend PHP (/api/webchat/send.php). Hệ thống tiếp nhận và lưu vào CSDL, kích hoạt ngay toàn bộ luồng tiếp nhận và chia tải.   Kênh Facebook & Zalo (Phương án Demo an toàn & Ổn định):Thực tế kỹ thuật: Việc sử dụng API Unofficial (như cào cookie, thư viện login cá nhân bên thứ ba) thường xuyên bị checkpoint, khóa tài khoản hoặc hết hạn session giữa chừng khi đang thuyết trình trước giảng viên.   Giải pháp demo chuyên nghiệp: Xây dựng một Màn hình Giả lập Kênh (Channel Simulator / Webhook Mock Dashboard) hoặc các kịch bản cURL/Postman chuẩn JSON payload của Meta/Zalo Webhook. Khi bấm nút "Giả lập khách FB nhắn tin" hoặc "Giả lập khách Zalo gửi ảnh", dữ liệu chuẩn format JSON sẽ bắn thẳng vào API tiếp nhận của hệ thống. Cách làm này vừa chứng minh được kiến trúc tích hợp đa kênh theo đúng Mục 5 của tài liệu SRS, vừa đảm bảo 100% không gặp sự cố mất mạng hay khóa acc khi demo.   II. Cấu trúc Thư mục & Cơ sở Dữ liệu (PHP MVC)Plaintextomnichannel-chat/
│
├── config/
│   └── database.php              # Kết nối PDO MySQL
├── controllers/
│   ├── AuthController.php        # Đăng nhập, đăng xuất, chuyển trạng thái ca trực
│   ├── ChatController.php        # Xem danh sách, lọc tin, khóa View-only, đổi ca
│   ├── CustomerController.php    # Quét hồ sơ Agent, cập nhật thông tin thủ công
│   └── TemplateController.php    # Quản lý kịch bản mẫu, tìm kiếm shortcut
├── models/
│   ├── User.php
│   ├── Conversation.php
│   ├── Message.php
│   ├── Product.php
│   ├── Template.php
│   └── CustomerProfile.php
├── views/
│   ├── auth/
│   │   └── login.php             # Màn hình đăng nhập
│   └── chat/
│       └── workspace.php         # Màn hình Chat Workspace tập trung (3 phân vùng)
├── api/
│   ├── webchat_endpoint.php      # Tiếp nhận tin nhắn từ widget webchat
│   └── sync_polling.php          # Trả về dữ liệu tin nhắn mới thời gian thực
├── public/
│   ├── css/style.css             # Giao diện đồng nhất
│   ├── js/workspace.js           # Xử lý sự kiện click, shortcut, polling
│   └── widget/webchat.js         # Mã nhúng widget chat trên website khách
└── database.sql                  # CSDL và dữ liệu mock ban đầu
Thiết kế Bảng CSDL Tối giản (MySQL Schema)SQL-- 1. Bảng tài khoản nhân viên (Hỗ trợ phân quyền ca trực)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    fullname VARCHAR(100) NOT NULL,
    avatar VARCHAR(255) DEFAULT 'default_avatar.png',
    status ENUM('ONLINE', 'OFFLINE') DEFAULT 'OFFLINE',
    current_chat_count INT DEFAULT 0
);

-- 2. Bảng sản phẩm (Nguồn dữ liệu cố định cấp cho template biến động)
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(255)
);

-- 3. Bảng cuộc trò chuyện (Hội thoại)
CREATE TABLE conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channel ENUM('WEBCHAT', 'FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK') NOT NULL,
    external_sender_id VARCHAR(100) NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    assigned_user_id INT NULL,
    status ENUM('UNREPLIED', 'CHATTING', 'CLOSED') DEFAULT 'UNREPLIED',
    tag ENUM('DANG_TU_VAN', 'DA_CHOT', 'CHO_CHUYEN_KHOAN', 'BOOM_HANG') DEFAULT 'DANG_TU_VAN',
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id)
);

-- 4. Bảng tin nhắn chi tiết
CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_type ENUM('CUSTOMER', 'STAFF') NOT NULL,
    content TEXT NOT NULL,
    attachment_url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- 5. Bảng mẫu tin nhắn (Template có biến động)
CREATE TABLE templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shortcut VARCHAR(20) NOT NULL, -- Ví dụ: /sp1, /size
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL, -- "Mẫu [ten_sp] mã [ma_sp] giá [gia]đ..."
    created_by_user_id INT NOT NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

-- 6. Bảng thẻ hồ sơ khách hàng (Phục vụ Agent bóc tách)
CREATE TABLE customer_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL UNIQUE,
    customer_name VARCHAR(100),
    preferred_size VARCHAR(50),
    recent_purchases TEXT,
    is_boom_risk TINYINT(1) DEFAULT 0,
    scan_version INT DEFAULT 1,
    last_scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
III. Đặc tả Chi tiết Màn hình & Sự Hiện diện của Các Use CaseToàn bộ hệ thống hội tụ tại 02 màn hình chính theo kiến trúc phân vùng, giải quyết dứt điểm tình trạng mở 8–20 tab gây lag máy:   Màn hình 1: Đăng nhập & Điều hướng Ca trực (Auth View)Thành phần giao diện: Form đăng nhập đơn giản gồm Tên tài khoản, Mật khẩu, nút [Đăng nhập].   Cơ chế demo: Cung cấp sẵn 2 tài khoản mock trong CSDL:Tài khoản 1: nv1 / 123456 (Họ tên: Nguyễn Văn Quân).   Tài khoản 2: nv2 / 123456 (Họ tên: Trần Thị Phương).Xử lý phiên (Session): Đăng nhập thành công sẽ lưu user_id, tự động chuyển sang Màn hình Workspace và bật trạng thái status = 'ONLINE' trong CSDL.   Màn hình 2: Không gian Chat tập trung (Unified Chat Workspace)Giao diện gồm 1 Header cố định và 3 Phân vùng (Zones):   Plaintext┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO] HỆ THỐNG QUẢN LÝ HỘI THOẠI ĐA KÊNH        Trực ca: [● Đang trực tuyến ▼] | NV: Quân (⇥)│
├───────────────────────┬──────────────────────────────────────────┬──────────────────────────────┤
│ SIDEBAR TRÁI          │ KHUNG CHAT TRUNG TÂM                     │ SIDEBAR PHẢI                 │
│ (Tiếp nhận & Chia ca) │ (Phản hồi & Khóa View-Only)              │ (Hồ sơ Agent & Gắn nhãn)     │
│                       │                                          │                              │
│ [Tìm kiếm...] (X)     │ [Khách: Thu Hà] [Logo FB] [Nhãn: Đang TV]│ [THẺ HỒ SƠ KHÁCH HÀNG]       │
│ [ Tất cả ] [ Của tôi ]│ ──────────────────────────────────────── │ Phiên bản: v1.0 | 14:30      │
│ [🔘 Chưa trả lời]     │ Khách: Shop ơi mẫu này còn size M ko?    │ Tên: Thu Hà [✎]              │
│                       │ Shop: Chào bạn, shop kiểm tra nhé!       │ Size quen: Size M [✎]        │
│ ┌───────────────────┐ │ ──────────────────────────────────────── │ Đơn cũ: Váy Dạ Tweed         │
│ │[FB] Thu Hà   14:30│ │ (TRẠNG THÁI 1: KHÁCH CỦA MÌNH)           │ ──────────────────────────── │
│ │Size M còn ko?     │ │ [/1...............] [Ghim ảnh] [Gửi]     │ [⚠ TỪNG BOOM 1 ĐƠN] (Đỏ)     │
│ │[Avatar Quân]      │ │ Gợi ý: Gõ /1 để điền Váy Dạ Tweed...    │ ──────────────────────────── │
│ └───────────────────┘ │                                          │ [ QUÉT LẠI DỮ LIỆU (AGENT) ] │
│ ┌───────────────────┐ │ (TRẠNG THÁI 2: KHÁCH CỦA ĐỒNG NGHIỆP)    │ ──────────────────────────── │
│ │[Web] Minh Anh 14:32│ │ ┌──────────────────────────────────────┐ │ [GẮN NHÃN TRẠNG THÁI]       │
│ │Giao hỏa tốc đc ko?│ │ │ 🔒 CHẾ ĐỘ CHỈ XEM (VIEW-ONLY)         │ │ (•) Đang tư vấn            │
│ │[Avatar Phương]    │ │ │ Hội thoại đang phụ trách bởi Phương. │ │ ( ) Đã chốt đơn            │
│ └───────────────────┘ │ │ Bạn không có quyền gửi tin nhắn.      │ │ ( ) Chờ chuyển khoản       │
│                       │ └──────────────────────────────────────┘ │ ( ) Khách boom               │
└───────────────────────┴──────────────────────────────────────────┴──────────────────────────────┘

1. Phân vùng Header (Thanh đỉnh màn hình)Hiển thị thông tin phiên: Tên nhân viên đang đăng nhập, ảnh đại diện.   Nút gạt ca trực: Dropdown chọn nhanh [● Đang trực tuyến] hoặc [○ Rời ca trực]. Khi bấm "Rời ca", hệ thống cập nhật status = 'OFFLINE', chuẩn bị điều kiện kích hoạt UC2.3.   2. Phân vùng Sidebar Trái (Nhiệm vụ của Nhung & Bạn - NV1 & NV2)Ô tìm kiếm (Search Box): Đặt trên cùng, nhập từ khóa (tên khách, SĐT), lọc trực tiếp trên giao diện bằng JavaScript.   UC2.2: Nút chuyển tab lọc [ Tất cả ] vs [ Của tôi ]:Bấm Của tôi: Danh sách chỉ hiển thị các hội thoại có assigned_user_id trùng với tài khoản đang đăng nhập.   Bấm Tất cả: Hiển thị toàn bộ hội thoại từ mọi kênh bán hàng theo thứ tự mới nhất đổ về.   UC1.2 (<<extend></extend>>): Nút chip lọc [🔘 Chưa trả lời]: Lọc nhanh các hội thoại có status = 'UNREPLIED' để kéo lên đầu, giải quyết triệt để lỗi trôi tin 15–30 phút.   UC1.2: Danh sách thẻ hội thoại: Mỗi thẻ hiển thị: Tên khách, nội dung tin nhắn cuối, thời gian gửi tương đối (ví dụ: 2 phút trước), icon logo kênh nguồn (Facebook, Shopee, Webchat).   UC2.1: Định danh người trực trên thẻ: Ở góc dưới bên phải mỗi thẻ hội thoại, hiển thị một avatar tròn kèm tên tài khoản nhân viên đang phụ trách (ví dụ: [Avatar Quân]).   Thuật toán chia tải khi có tin nhắn mới: Hệ thống kiểm tra số hội thoại đang mở (current_chat_count) giữa các nhân viên Online. Người nào có ít khách hơn sẽ được gán tự động (assigned_user_id), chứng minh rõ cơ chế chia 1 vs 3 trên giao diện.   3. Phân vùng Khung Chat Trung tâm (Nhiệm vụ của Bạn, Quân & Ngân - NV2 & NV3)UC2.2 (<<extend></extend>>): Cơ chế Khóa quyền phản hồi (View-only):Nếu nhân viên bấm chọn hội thoại do chính mình phụ trách: Khung chat mở khóa toàn bộ, ô nhập liệu hiển thị bình thường.   Nếu nhân viên bấm vào tab Tất cả và chọn hội thoại đang do nhân viên khác phụ trách: Khung nhập liệu bị ẩn hoàn toàn, thay thế bằng một Banner màu xám khóa cứng: "🔒 Chế độ Chỉ xem (View-only) – Hội thoại đang được phụ trách bởi [Tên nhân viên]. Bạn không thể gửi tin nhắn".   UC2.3: Chuyển giao hội thoại khi đổi ca:Khi nhân viên A gạt sang Rời ca trực. Khách hàng nhắn thêm 1 tin mới (từ Webchat).   Tại màn hình nhân viên B, hội thoại tự động được gỡ bỏ chế độ View-only, avatar góc thẻ chuyển sang tên nhân viên B, cho phép nhân viên B gõ phím tiếp tục tư vấn.   UC3.1: Soạn tin bằng Template biến động & Đính kèm ảnh:Gõ phím tắt: Nhân viên gõ /1 vào ô chat, hệ thống lắng nghe sự kiện bàn phím, tự động thay thế bằng nội dung:Chào bạn, mẫu Váy Dạ Tweed (Mã: SP01) hiện có giá 350.000đ. Bạn cho shop xin chiều cao cân nặng để tư vấn size nhé!   (Dữ liệu Váy Dạ Tweed, SP01, 350.000đ được đọc từ bảng products qua API).   Đính kèm ảnh: Icon chiếc ghim kẹp giấy cho phép bấm chọn file ảnh từ máy tính (ảnh bảng size/chất vải) và bấm gửi ngay vào khung chat.   UC3.2: Quản lý mẫu tin nhắn (Popup tạo nhanh):Ngay cạnh ô chat có nút icon [+] Thêm mẫu tin]. Bấm vào mở một modal popup nhỏ cho phép nhân viên nhập: Phím tắt (ví dụ: /size), Tiêu đề, Nội dung có nút bấm chèn các biến [tên_sp], [giá]. Bấm "Lưu" sẽ ghi ngay vào bảng templates.   4. Phân vùng Sidebar Phải (Nhiệm vụ của Phương - NV3)UC3.3: Thẻ hồ sơ khách hàng (Agent bóc tách):Các trường dữ liệu cố định: Tên khách hàng, Size thường mặc, Sản phẩm đã mua gần nhất.   Cảnh báo rủi ro: Nếu khách có lịch sử boom hàng, hiển thị huy hiệu màu đỏ nổi bật: [⚠ TỪNG BOOM 1 ĐƠN - ĐỀ NGHỊ CỌC TRƯỚC].   Nút thao tác: Nút [ Quét lại dữ liệu (Agent) ⟳ ]. Khi bấm vào, một hiệu ứng quét chữ chạy qua các tin nhắn từ trên xuống dưới, cập nhật mốc thời gian và tăng chỉ số phiên bản từ Phiên bản: v1.0 thành Phiên bản: v2.0.   UC3.3 (<<extend></extend>>): Cập nhật thủ công:Bên cạnh các trường thông tin (Tên, Size) có icon cây bút chì [✎]. Nhân viên bấm vào ô Size, sửa từ Size M thành Size L và bấm Enter để lưu đè CSDL.   UC3.4: Gắn nhãn hội thoại (Tagging):Bộ nút bấm dạng Radio / Tag chip gồm 4 màu: Xanh lá: Đang tư vấn, Xanh dương: Đã chốt đơn, Vàng: Chờ chuyển khoản, Đỏ: Khách boom. Bấm vào nhãn nào thì thẻ hội thoại ở Sidebar trái tự động đổi màu tag tương ứng.   IV. Hướng dẫn Kịch bản Demo thực chiến để Thuyết trình (Walkthrough Script)Để đạt điểm tối đa khi thầy kiểm tra chương trình chạy thực tế, nhóm thực hiện demo tuần tự theo kịch bản 6 bước sau:   Bước 1: Chuẩn bị 2 tài khoản (Phân quyền ca trực):Mở trình duyệt Chrome: Đăng nhập tài khoản nv1 (Quân) $\rightarrow$ Gạt trạng thái Trực tuyến.   Mở trình duyệt Ẩn danh: Đăng nhập tài khoản nv2 (Phương) $\rightarrow$ Gạt trạng thái Trực tuyến.   Bước 2: Demo Kênh Webchat & Tiếp nhận tự động (UC1.1, UC1.2, UC2.1):Mở tab website bán hàng, bật khung Webchat, đóng vai khách hàng gõ: "Shop ơi mẫu áo dạ mã SP01 còn size không?".   Quan sát màn hình Workspace của cả 2 nhân viên: Tin nhắn xuất hiện ngay ở đầu danh sách bên trái có logo Webchat (UC1.1, UC1.2).   Hệ thống thấy nv1 đang có 0 khách, nv2 đang có 1 khách $\rightarrow$ Hội thoại tự động gán cho nv1, xuất hiện avatar của Quân ở góc tin nhắn và nhảy vào tab "Của tôi" của Quân (UC2.1 chia tải 1 vs 3).   Bước 3: Demo Chống cướp đơn & Khóa View-only (UC2.2 extend):Tại màn hình của nv2 (Phương): Bấm sang tab Tất cả và click vào hội thoại của khách vừa nhắn.   Khung chat của nv2 lập tức hiển thị banner màu xám: "🔒 Chế độ Chỉ xem - Đang tư vấn bởi Quân" và khóa toàn bộ ô nhập văn bản, không thể gõ chữ (UC2.2 extend).   Bước 4: Demo Trả lời bằng Template biến động & Đính kèm ảnh (UC3.1, UC3.2):Tại màn hình của nv1 (Quân): Khung chat mở bình thường. Gõ phím tắt /1 $\rightarrow$ Hệ thống tự động bung mẫu tin đầy đủ tên sản phẩm và giá tiền lấy từ CSDL.   Bấm icon chiếc ghim kẹp giấy, chọn một ảnh bảng size từ máy tính và bấm "Gửi".   Bước 5: Demo Agent quét dữ liệu & Cờ đỏ boom hàng (UC3.3, UC3.4):Nhìn sang Sidebar bên phải: Bấm nút [ Quét dữ liệu (Agent) ].   Agent bóc tách tin nhắn, hiển thị Size quen thuộc là Size M, đồng thời phát hiện từ khóa lịch sử và bật huy hiệu đỏ [⚠ TỪNG BOOM 1 ĐƠN].   Bấm icon bút chì ✎ sửa nhanh Size thành Size L. Chọn tag [Chờ chuyển khoản] $\rightarrow$ Thẻ tin nhắn bên trái đổi màu vàng.   Bước 6: Demo Bàn giao đổi ca tự động (UC2.3):Tại màn hình của nv1 (Quân): Gạt nút ca trực sang Rời ca (Offline).   Quay lại tab Webchat đóng vai khách hàng gõ thêm 1 tin: "Shop gửi số tài khoản cho mình nhé".   Quan sát màn hình của nv2 (Phương): Khung chat của Phương tự động mất banner View-only, avatar góc đổi sang tên Phương, mở khóa ô nhập liệu cho phép Phương tư vấn tiếp tục mà không làm đứt mạch trao đổi (UC2.3).   Bản đặc tả kỹ thuật này liên kết logic từ CSDL, mã code PHP MVC đến kịch bản thuyết trình, bảo toàn nguyên vẹn 100% các Use Case đã thống nhất và đủ điều kiện để cả nhóm triển khai lập trình trong vòng 1 ngày.
