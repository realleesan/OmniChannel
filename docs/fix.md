giao diện hiện tại thô kệch, cần sửa đổi, tham khảo giao diện của các bên như respond.io

như đã bàn phải có 2 sidebar, sidebar trái bao gồm danh sách tin nhắn, nút lọc, thanh search gọn gàng. sidebar phải là phần tóm tắt thông tin 


Luồng vận hành chức năng của hệ thống được thiết kế khép kín theo đúng tiến trình làm việc thực tế của một ca trực bán hàng, kết nối liền mạch từ lúc tương tác phát sinh đến khi chốt đơn và bàn giao ca^^.

### 1. Tiếp nhận và gom tương tác tập trung (Nghiệp vụ 1)

* **Tập hợp hòm thư đa kênh về một nơi:** Ngay khi bắt đầu phiên làm việc, nhân viên chỉ cần mở một màn hình duy nhất^^. Toàn bộ tin nhắn và bình luận mới phát sinh từ các trang bán hàng, gian hàng thương mại điện tử hay khung chat trên website đều tự động đổ về danh sách chung^^. Nhân viên không còn phải duy trì cùng lúc hàng chục tab trình duyệt riêng lẻ gây phân tâm và chậm máy^^.
* **Sắp xếp theo thứ tự ưu tiên thời gian thực:** Các cuộc trò chuyện được tự động xếp theo nguyên tắc đến trước phục vụ trước^^. Mỗi tin nhắn đều hiển thị rõ biểu tượng nhận diện kênh nguồn cùng mốc thời gian khách đang phải chờ^^.
* **Lọc nhanh các trường hợp tồn đọng:** Khi lượng tin nhắn dồn về quá đông vào giờ cao điểm, nhân viên sử dụng nút lọc những khách chưa được phản hồi để gom toàn bộ các tin nhắn chờ lâu lên đầu danh sách, triệt tiêu hoàn toàn rủi ro sót tin hay để khách đợi quá hạn^^.

### 2. Tự động điều phối và kiểm soát quyền tư vấn (Nghiệp vụ 2)

* **Phân chia công việc tự động theo tải thực tế:** Khi có tin nhắn mới đổ về, hệ thống tự động kiểm tra số lượng khách mà từng nhân viên trong ca đang trực tiếp chăm sóc^^. Cuộc trò chuyện mới sẽ được ưu tiên gán cho người đang có ít khách nhất để đảm bảo khối lượng công việc cân bằng, không cần nhân viên phải quay sang thỏa thuận hay phân chia thủ công bằng miệng^^.
* **Định danh trực quan người phụ trách:** Ngay trên thẻ hội thoại ở danh sách bên trái, hệ thống tự động gắn ảnh đại diện và tên tài khoản của người được chỉ định phụ trách, giúp cả ca trực nhìn vào là biết ai đang chăm sóc khách nào^^.
* **Phân tách danh sách làm việc:** Nhân viên chọn tab "Của tôi" để chỉ tập trung xử lý các cuộc trò chuyện đã được giao cho riêng mình^^. Khi cần bao quát toàn bộ hoạt động của cửa hàng, nhân viên có thể chuyển sang tab "Tất cả"^^.
* **Khóa quyền phản hồi để bảo vệ đơn hàng:** Để ngăn chặn tình trạng cướp khách hoặc trả lời trùng lặp, nếu một nhân viên bấm xem cuộc trò chuyện đang thuộc quyền của đồng nghiệp khác, hệ thống sẽ kích hoạt chế độ chỉ xem^^: khung soạn thảo văn bản bị khóa lại và hiển thị thông báo rõ ràng về người đang phụ trách tư vấn^^.

### 3. Phản hồi nhanh và quản lý thông tin khách hàng (Nghiệp vụ 3)

* **Tư vấn thần tốc bằng mẫu tin nhắn linh hoạt:** Trong quá trình trò chuyện, nhân viên không cần gõ lại các câu chào, thông số sản phẩm hay bảng giá dài dòng^^. Chỉ cần gõ một phím tắt ngắn gọn, hệ thống sẽ tự động điền câu trả lời mẫu hoàn chỉnh kèm chính xác mã hàng, tên sản phẩm và mức giá tương ứng lấy từ danh mục có sẵn^^. Nhân viên cũng có thể bấm chọn nhanh ảnh chụp thực tế hoặc bảng kích cỡ từ thiết bị để gửi ngay vào khung chat^^.
* **Tự tạo kịch bản phản hồi cá nhân:** Nhân viên có thể tự lưu lại các câu trả lời hay hoặc bảng quy đổi kích cỡ thường dùng thành các mẫu tin nhắn nhanh có gán phím tắt riêng ngay tại khung chat để tái sử dụng cho các lần tư vấn sau^^.
* **Tự động tóm tắt hồ sơ khách hàng:** Song song với quá trình trao đổi, hệ thống tự động rà soát toàn bộ cuộc trò chuyện từ trên xuống dưới để trích xuất các thông tin then chốt và ghim cố định lên bảng thông tin bên phải màn hình: họ tên khách, kích cỡ quần áo thường mặc, các sản phẩm đã từng mua và mốc thời gian cập nhật^^. Nhân viên chỉ cần liếc mắt nhìn là nắm trọn ngữ cảnh, không phải cuộn ngược hàng trăm dòng tin nhắn cũ^^.
* **Cảnh báo rủi ro bùng hàng:** Nếu phát hiện khách hàng từng có tiền sử từ chối nhận hàng hoặc hủy đơn vô lý trong quá khứ, hệ thống sẽ bật ngay một nhãn cảnh báo màu đỏ nổi bật để nhân viên lưu ý yêu cầu đặt cọc trước khi chốt đơn^^.
* **Cập nhật dữ liệu linh hoạt:** Khi cuộc trò chuyện phát sinh thêm thông tin mới, nhân viên có thể bấm nút làm mới để hệ thống quét lại nội dung và cập nhật lên phiên bản thông tin mới hơn^^. Trường hợp cần điều chỉnh nhanh, nhân viên bấm trực tiếp vào từng ô để sửa tay số đo hoặc ghi chú sở thích của khách^^.
* **Gắn nhãn phân loại tiến độ:** Sau mỗi lượt tư vấn, nhân viên bấm chọn các thẻ trạng thái như "Đang tư vấn", "Chờ chuyển khoản" hay "Đã chốt đơn"^^. Trạng thái này lập tức được đồng bộ ra danh sách ngoài để quản lý và đồng nghiệp nắm bắt tiến độ xử lý của từng khách^^.

### 4. Chuyển giao hội thoại liền mạch khi đổi ca (Khép luồng Nghiệp vụ 2)

* **Ghi nhận trạng thái kết thúc ca:** Đến giờ đổi ca làm việc, nhân viên ca trước chọn chuyển trạng thái tài khoản sang nghỉ ca^^. Hệ thống tự động ghi nhận danh sách các cuộc trò chuyện vẫn đang tư vấn dở dang của người này^^.
* **Tự động bàn giao khi khách tương tác tiếp:** Thay vì phải ghi chép sổ tay hay nhắn tin dặn dò miệng dễ quên, hệ thống sẽ tự động theo dõi^^: ngay khi khách hàng gửi tin nhắn mới đến, quyền kiểm soát độc quyền của nhân viên cũ sẽ tự động được gỡ bỏ^^. Hệ thống tự động chuyển giao cuộc trò chuyện đó sang cho nhân viên đang trực ở ca tiếp theo, mở khóa khung chat để người mới tiếp quản tư vấn ngay lập tức mà vẫn giữ nguyên vẹn toàn bộ lịch sử trao đổi trước đó^^.

Toàn bộ luồng chức năng trên tạo thành một vòng lặp vận hành tự nhiên: từ khâu gom tin nhắn, chia việc công bằng, hỗ trợ công cụ chốt đơn nhanh tại chỗ cho đến việc đổi ca mượt mà, giúp nhân viên xử lý đơn hàng chính xác mà không gặp bất kỳ sự đứt gãy nào trong ca trực^^.
