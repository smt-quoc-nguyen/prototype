# Workflow thuê và vận hành bất động sản

Tài liệu này mô tả quy trình mà [Workflow Studio](./index.html) mô phỏng. Một **hồ sơ workflow** gắn với một khách hàng, một căn/diện tích thuê, một người phụ trách, một bước hiện tại và lịch sử sự kiện. Mỗi lần gia hạn tạo **chu kỳ mới** trên cùng hồ sơ.

## Hành trình chính

| Bước | Bắt đầu khi | Việc phải hoàn tất | Chuyển sang | Nhóm phụ trách |
| --- | --- | --- | --- | --- |
| 1. Tiếp nhận | Có lead từ website, Zalo, đối tác hoặc nhân viên | Xác minh liên hệ, nhu cầu/ngân sách, giao người xử lý | Tư vấn & xem | Tư vấn viên |
| 2. Tư vấn & xem | Lead hợp lệ và có căn phù hợp | Chốt căn, xác nhận lịch xem, ghi phản hồi | Giữ căn | Tư vấn viên |
| 3. Giữ căn | Khách chọn căn | Kiểm tra khả dụng, điều khoản giữ chỗ, đối soát tiền giữ chỗ | Ký hợp đồng | Kinh doanh |
| 4. Ký hợp đồng | Đặt chỗ hợp lệ | Soạn và kiểm tra dự thảo → quản lý phê duyệt → hai bên ký | Bàn giao | Pháp lý / quản lý |
| 5. Bàn giao | Hợp đồng có hiệu lực | Kiểm tra căn, ký biên bản, cấp khóa/thẻ | Vận hành & thu phí | Vận hành |
| 6. Vận hành & thu phí | Khách nhận nhà | Hóa đơn, đối soát thanh toán, lịch nhắc phí | Gia hạn / trả phòng khi gần hết hạn | Kế toán / CSKH |
| 7. Gia hạn / trả phòng | Gần hết hạn hoặc khách yêu cầu | Thông báo trước hạn; nếu trả phòng thì kiểm tra căn, chốt công nợ và hoàn cọc | Gia hạn: quay về bước 4; trả phòng: bước 8 | CSKH / vận hành |
| 8. Hoàn tất | Đã trả phòng và đối soát | Lưu biên bản thanh lý, đóng quyền ra vào | Đóng hồ sơ, giải phóng căn | Quản lý |

## Những điểm quyết định

- **Chưa đủ checklist:** hồ sơ giữ nguyên bước và hiển thị mục còn thiếu. Mỗi thay đổi checklist được ghi vào lịch sử.
- **Khách chưa quyết định sau khi xem:** chuyển sang `Nuôi dưỡng`; có thể khôi phục để tiếp tục tư vấn.
- **Hủy giữ căn:** hồ sơ sang `Đã hủy` và căn được giải phóng trong mô phỏng; có thể khôi phục về tư vấn để chọn lại căn.
- **Hợp đồng chờ duyệt:** hai mục soạn/kiểm tra phải hoàn tất mới gửi được. Người quản lý có thể duyệt hoặc từ chối. Nếu từ chối, checklist được đặt lại để sửa và gửi lại. Mục “Hai bên đã ký” chỉ mở sau khi duyệt.
- **Gia hạn:** chỉ cần xác nhận đã thông báo trước hạn; quy trình tăng số chu kỳ, quay về bước ký hợp đồng và yêu cầu phê duyệt lại.
- **Trả phòng:** phải hoàn tất đủ ba mục của bước 7, rồi làm checklist đóng hồ sơ ở bước 8.

## Quy tắc tự động và SLA

Tab **Quy tắc thuê & SLA** thể hiện trigger → điều kiện → hành động cho lead, lịch xem, giữ căn, phê duyệt, công nợ và gia hạn. Có thể bật/tắt từng quy tắc trong bản mô phỏng. Khi trễ SLA, UI mô tả chuỗi nhắc người phụ trách, báo quản lý và gắn cờ tại bảng điều phối. Tab **Nhật ký hồ sơ** ghi lại thay đổi bước, phê duyệt, checklist và hành động tự động.

Các sự kiện được mô phỏng ngay trên trang. Chưa có scheduler để tự kích hoạt quy tắc theo thời gian, gửi Zalo/email, đối soát ngân hàng hay ghi dữ liệu vào backend.

## Cách xem nhanh

1. Mở [Hành trình thuê mẫu](./index.html?wf=board#workflow) để thấy đủ 8 bước và ba nhánh quyết định. Đây là hồ sơ thuê minh họa riêng; các workflow tự tạo và lịch sử chạy node nằm ở tab **Trình dựng luồng** và **Lần chạy**.
2. Chọn **Xem hồ sơ mẫu** để tích checklist, thử chuyển bước và xem lý do bị chặn.
3. Trong **Hồ sơ thuê mẫu**, mở `FL-2026-102` để thử duyệt/từ chối hợp đồng và `FL-2026-099` để thử gia hạn hoặc trả phòng.
4. Mở **Thiết kế quy trình**, tạo bản nháp, sửa nhóm phụ trách hoặc SLA rồi xuất bản.
5. Bật/tắt quy tắc trong **Quy tắc thuê & SLA**, sau đó kiểm tra **Nhật ký hồ sơ**.

Màn hình mẫu là lớp thiết kế sản phẩm; các tên miền nghiệp vụ đối chiếu với các service `customer`, `property`, `reservation`, `contract`, `operations`, `payment`, `maintenance` và `report` trong repo. Mọi thay đổi trong prototype tồn tại đến khi tải lại trang.
