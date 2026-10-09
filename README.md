# SmartOS · Workflow bảo trì

Web React + Vite cho ba vai trò **Tenant, PMS và Maintainer**. Tenant gửi yêu cầu, PMS cấu hình/duyệt, Maintainer nhận và hoàn thành công việc.

- [3 sơ đồ để review](docs/diagrams/review.html): dữ liệu, cấu hình quy trình và hành trình ticket.
- [Giải thích sơ đồ](docs/DIAGRAMS.md).
- [Hướng dẫn thao tác trên web](docs/UX.md).
- [Quy tắc dữ liệu và trạng thái](docs/LOGIC.md).

## Chạy web

Yêu cầu Node.js 18+.

```bash
npm install
npm run dev -- --port 4173
```

Mở trong cùng trình duyệt/profile:

- [Tenant](http://localhost:4173/?app=tenant)
- [PMS](http://localhost:4173/?app=pms)
- [Maintainer](http://localhost:4173/?app=maintainer&view=orders)

Mặc định mở PMS. Dữ liệu ban đầu chưa có ticket/công việc; có hai mẫu công việc và quy trình điều hòa để thử.

## Luồng đang dùng

1. PMS vào **Quy trình xử lý**, chọn loại ticket và có cần duyệt hay không.
2. Thêm **Công việc**, **Thông báo**, **Nhóm song song** hoặc **Điều kiện trạng thái**; chạy thử rồi lưu nháp/xuất bản.
3. Tenant hoặc PMS tạo ticket. Ticket mới dùng quy trình đã xuất bản đúng loại; nếu chưa có, PMS xử lý thủ công.
4. PMS phê duyệt nếu cần. Maintainer bắt đầu, tick checklist và hoàn thành công việc.
5. Khi mọi công việc liên quan xong, ticket hoàn tất. PMS xem các bước và lịch sử tại **Tiến độ & nhật ký**.

Để thử nhanh: Tenant tạo yêu cầu **Equipment malfunction** → PMS duyệt → Maintainer hoàn thành **Kiểm tra điều hoà** → **Sửa chữa máy lạnh** → ticket **Hoàn tất**.

## Dữ liệu và thông báo

Dữ liệu lưu trong **IndexedDB của trình duyệt**, chưa có backend. Các tab phải cùng origin (scheme/host/port) và profile để chia sẻ dữ liệu. Reload giữ dữ liệu; chạy thử dùng dữ liệu riêng trong bộ nhớ. Thông báo trong app hoạt động sẵn; thông báo trình duyệt cần bật và cấp quyền.

Ba vai trò dùng người demo, chưa có đăng nhập thật. Một tenant và một kỹ thuật viên được cấu hình sẵn. SLA hiển thị thời gian từ lúc tạo, không tự nhắc hoặc xử lý quá hạn.

Muốn đặt lại dữ liệu: xóa IndexedDB `smartos-maintenance-v1` trong DevTools rồi reload các tab.

## Kiểm tra

```bash
npm test
npx playwright install chromium # Cài một lần
npm run test:e2e
npm run build
```
