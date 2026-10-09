# Workflow Builder

[Mở trình dựng luồng](./index.html#workflow) để thiết kế workflow theo mô hình **Trigger → Logic → Action**. Đây là prototype tương tác trên trình duyệt, chưa chạy tác vụ thật trên backend.

## Cách dựng một luồng

1. Nhấn **Tạo workflow mới**. Chọn một Trigger trong thư viện bên trái: khách hàng mới, đặt chỗ xác nhận, hóa đơn quá hạn, sự cố mới, hợp đồng sắp hết hạn, theo lịch hoặc chạy thủ công.
2. Chọn Logic hoặc Action để thêm vào canvas. Kéo phần đầu node để sắp xếp. Nhấp chấm tròn đầu ra của node nguồn, rồi chấm tròn đầu vào của node đích để nối. Có thể chọn **Thêm sau** trong panel cấu hình để thêm và nối nhanh. Nút **Vừa khung** hiển thị toàn bộ sơ đồ.
3. Nhấp node để sửa tên và tham số bên phải. Node **Điều kiện** có hai đầu ra **Đúng** và **Sai**; mỗi nhánh có thể nối tới action khác nhau.
4. Dùng **Chạy thử** bên dưới canvas: chọn Trigger, sửa input JSON và xem đường đi, nội dung từng action. Thử thay `budget` từ `28000000` xuống `10000000` trong mẫu lead để thấy nhánh đổi. Có thể chọn một action ở mục **Mô phỏng lỗi tại action** để xem trạng thái lỗi và thử lại.
5. Dùng **Lưu nháp** để lưu trên trình duyệt. **Xuất bản** yêu cầu có Trigger, Action, node không bị rời và đủ hai nhánh của node Điều kiện. Có thể hoàn tác/làm lại khi thay đổi cấu trúc.
6. Mở [**Lần chạy**](./index.html?wf=runs#workflow) để xem lịch sử, dữ liệu đầu vào, phiên bản sơ đồ và trạng thái từng node. Mở **Xem input / output** trên một node để thấy dữ liệu được truyền sang bước sau; action tạo mã công việc, đặt chỗ, hợp đồng hoặc hóa đơn trong mô phỏng. Có sẵn ví dụ hoàn tất, chờ duyệt, chờ thời gian và lỗi. Thử **Duyệt & tiếp tục**, **Từ chối**, **Giả lập hết thời gian chờ** hoặc **Thử lại node lỗi**.

## Node có sẵn

| Nhóm | Node | Vai trò trong bất động sản |
| --- | --- | --- |
| Trigger | Khách hàng mới, đặt chỗ xác nhận, hóa đơn quá hạn, sự cố mới, hợp đồng sắp hết hạn, theo lịch, chạy thủ công | Điểm bắt đầu của workflow |
| Logic | Điều kiện, Chờ, Phê duyệt | Rẽ nhánh, trì hoãn, chờ người duyệt |
| Action | Tạo công việc, gửi thông báo, tạo đặt chỗ, tạo hợp đồng, tạo hóa đơn, cập nhật trạng thái, kết thúc luồng | Thao tác sau khi điều kiện được thỏa |

Menu **Mở mẫu workflow** có bốn kịch bản để chỉnh sửa: chăm sóc lead, đặt chỗ sang hợp đồng, nhắc phí quá hạn và tiếp nhận sự cố. Mở mẫu thay thế graph hiện tại; có thể **Hoàn tác** ngay sau đó. Các node và cấu hình được lưu bằng `localStorage` đến khi xóa dữ liệu trình duyệt.

Tab **Hành trình thuê mẫu** còn có ví dụ quy trình thuê 8 bước theo góc nhìn vận hành. Đây là kịch bản tham khảo riêng để thấy cách hồ sơ chạy qua nhiều bộ phận; canvas cho phép tạo các workflow khác và chỉnh từng trigger/action.

Một lần chạy đi theo chuỗi **sự kiện → kiểm tra trigger → điều kiện → action → kết quả**. Trigger không khớp thì lần chạy dừng ở trạng thái *Không khớp trigger*. Node Chờ dừng ở trạng thái *Đang chờ*; node Phê duyệt dừng ở *Chờ phê duyệt* cho đến khi người xem xử lý. Action lỗi giữ vị trí để thử lại; mỗi lần thử đều nằm trong timeline. Lần chạy giữ bản sao sơ đồ và input, nên chỉnh sửa workflow sau đó không làm thay đổi lịch sử.

**Giới hạn prototype:** Chạy thử không gửi Zalo/email, tạo hợp đồng/hóa đơn thật, chờ thời gian thật hay gọi API. Nút tiếp tục thời gian và phê duyệt là thao tác mô phỏng. Xuất bản chỉ cập nhật trạng thái trong bản prototype, chưa triển khai quy tắc lên hệ thống sản xuất. Lịch sử lần chạy được lưu bằng `localStorage` trên trình duyệt.
