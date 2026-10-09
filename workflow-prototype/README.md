# SmartOS Workflow Prototype

Prototype giao diện tiếng Việt cho quản lý bất động sản, mở mặc định tại **Workflow Builder** kiểu node. Xem [cách tạo trigger/action và theo dõi lần chạy](./BUILDER.md); [màn hình Lần chạy](./index.html?wf=runs#workflow) thể hiện cách một workflow hoạt động sau khi nhận sự kiện. [Hành trình thuê 8 bước](./WORKFLOW.md) là mẫu nghiệp vụ tham khảo. Mở trực tiếp `index.html` trong trình duyệt hoặc chạy một static server trong thư mục này:

```bash
python3 -m http.server 4173
```

Sau đó mở `http://localhost:4173`. Prototype dùng dữ liệu mẫu và chưa kết nối API backend. Graph workflow được lưu trong trình duyệt; dữ liệu các màn hình nghiệp vụ còn lại được đặt lại khi tải lại trang.

Workflow có 7 góc nhìn: **Trình dựng luồng** (mặc định), **Lần chạy**, Hành trình thuê mẫu, Hồ sơ thuê mẫu, Cấu hình mẫu thuê, Quy tắc thuê & SLA, Nhật ký hồ sơ. Hai tab đầu mô phỏng workflow tùy biến; năm tab sau là hành trình thuê 8 bước để tham khảo vận hành. Trình dựng cho phép thêm/xóa/kéo node, nối trigger/logic/action, sửa tham số, đổi nhánh, lưu nháp, xuất bản và chạy thử. Màn hình Lần chạy ghi snapshot của sơ đồ, trạng thái, input/output và kết quả từng node; có thể duyệt, từ chối, mô phỏng hết thời gian chờ hoặc thử lại action lỗi. Thư mục `screens/` chứa ảnh xem nhanh của Workflow và 9 màn hình nghiệp vụ liên quan.

Các màn hình nghiệp vụ còn lại: Tổng quan, Tài sản, Khách hàng, Đặt chỗ, Hợp đồng, Vận hành, Tài chính, Bảo trì và Báo cáo. Chúng phục vụ việc hình dung nơi dữ liệu workflow được tạo và xử lý.

Kiểm tra logic demo bằng `node workflow-studio.test.cjs`.

| Chặng nghiệp vụ | Màn hình | Miền backend tham chiếu |
| --- | --- | --- |
| Tiếp nhận và tư vấn | Khách hàng, Đặt chỗ | `customer`, `reservation` |
| Khai thác nguồn cung | Tài sản | `property` |
| Chốt giao dịch | Hợp đồng | `contract` |
| Bàn giao và cư trú | Vận hành | `operations`, `reservation` |
| Thu tiền định kỳ | Tài chính | `payment` |
| Hỗ trợ sau thuê | Bảo trì | `maintenance` |
| Điều phối và đánh giá | Workflow, Tổng quan, Báo cáo | `report` và dữ liệu liên dịch vụ |
