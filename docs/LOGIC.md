# Quy tắc của workflow đang dùng trên web

Đọc [sơ đồ và phần giải thích](DIAGRAMS.md) trước. Tài liệu này ghi các quy tắc phía sau màn hình hiện tại.

## Ticket, công việc và lần chạy

**Ticket** là yêu cầu của Tenant, hoặc PMS tạo thay. Có loại yêu cầu, ưu tiên, vị trí, ghi chú, ảnh bằng chứng và SLA.

**Work order** là công việc có người nhận và checklist. Quy trình tự giao việc cho ticket; PMS cũng có thể tạo thủ công và chọn nhiều ticket. `links[]` lưu quan hệ nhiều–nhiều giữa ticket và work order.

**Workflow** là cấu hình tại “Quy trình xử lý”. **Run** là một lần áp dụng workflow cho một ticket. Run giữ bản chụp cấu hình lúc ticket được tạo, để việc chỉnh/xuất bản sau đó không thay đổi yêu cầu đang xử lý.

**Nhóm ticket** tổ chức danh sách. Gom/đưa ra khỏi nhóm không gộp ticket, công việc hay run.

## Áp dụng quy trình

- Chỉ ticket mới thuộc loại đã chọn mới bắt đầu quy trình đã xuất bản. Tenant và PMS đều có thể tạo ticket.
- Mỗi loại ticket có một quy trình đang áp dụng. Chưa có quy trình thì ứng dụng báo PMS xử lý thủ công.
- Lưu nháp quy trình đang áp dụng giữ bản live và bản chỉnh sửa riêng. Xuất bản mới thay bản live cho ticket tạo sau đó.
- Chạy thử dùng dữ liệu riêng trong bộ nhớ, không ghi vào kho dữ liệu đang dùng hoặc gửi thông báo trình duyệt.
- Nếu hai tab cùng sửa quy trình, tab dùng phiên bản cũ phải tải lại trước khi lưu.

## Các bước được cấu hình

| Bước | Quy tắc |
| --- | --- |
| Phê duyệt | Tùy chọn trước các bước xử lý. PMS duyệt hoặc từ chối; từ chối phải có lý do, hủy yêu cầu và dừng quy trình. |
| Công việc | Dùng mẫu hoặc tự nhập tên/checklist/thời hạn. Khi giao, Tenant và Maintainer nhận thông báo. |
| Chờ hoàn thành | Mặc định bật cho công việc. Tắt cho phép chạy bước kế tiếp ngay khi giao, nhưng không bỏ điều kiện hoàn tất ticket. |
| Thông báo | Chọn vai trò, tiêu đề và nội dung. Kênh trong app luôn có; trình duyệt là tùy chọn. |
| Nhóm song song | Có 2–6 nhánh, mỗi nhánh chạy theo thứ tự riêng. Bước sau nhóm chờ mọi nhánh đang thực hiện và công việc trong nhóm. |
| Điều kiện — Kiểm tra ngay | Đọc trạng thái mới nhất một lần, chạy nhánh Đúng hoặc Không đúng. Nhánh còn lại được bỏ qua. |
| Điều kiện — Chờ trạng thái | Nếu đã khớp thì đi tiếp; chưa khớp thì chờ thay đổi của đúng ticket/công việc rồi thực hiện các bước bên trong. |
| Hoàn tất | Được giữ ở cuối. Chờ mọi work order liên quan completed/closed rồi chuyển ticket sang resolved và báo kết quả. |

Điều kiện chỉ chọn công việc chắc chắn đã được tạo ở bước trước. Không chọn việc ở nhánh có thể bị bỏ qua hoặc chưa chạy. Bước chờ không nhận một lần thay đổi đã xảy ra trước khi nó bắt đầu chờ.

Có tối đa 18 bước, tính cả bước trong nhóm, và hai lớp nhóm. Giao diện kiểm tra các trạng thái không thể chờ được trước khi xuất bản.

## Trạng thái thấy trên web

| Đối tượng | Giá trị lưu | Nhãn trên web / ý nghĩa |
| --- | --- | --- |
| Ticket | submitted | Đã gửi |
| Ticket | approved | Đã duyệt |
| Ticket | inprogress | Đang xử lý — có công việc bắt đầu |
| Ticket | resolved | Hoàn tất |
| Ticket | cancelled | Đã hủy — do hủy hoặc từ chối |
| Công việc | todo | Cần làm |
| Công việc | in-progress | Đang làm |
| Công việc | pause | Tạm dừng |
| Công việc | completed | Hoàn thành |
| Công việc | closed | Đã đóng — lưu trữ sau hoàn thành hoặc đóng vì yêu cầu bị hủy |

Maintainer phải bắt đầu rồi tick đủ checklist mới được hoàn thành. Tạm dừng có thể tiếp tục; công việc completed/closed không chỉnh checklist hoặc quay về Cần làm. Ticket đã hoàn tất/hủy không mở lại.

## Hoàn tất, hủy và lỗi

**Hoàn tất:** quy trình chỉ kết thúc ticket khi mọi công việc liên quan đã completed/closed, kể cả việc PMS thêm thủ công. Nếu còn việc thì tiến độ hiển thị “Chờ công việc liên quan”. Ticket xử lý thủ công phải có ít nhất một việc liên quan đã hoàn thành/đóng trước khi PMS bấm Hoàn tất.

**Hủy:** Tenant hủy yêu cầu của mình, hoặc PMS hủy. Quy trình dừng và không giao việc tiếp theo. Việc chưa xong được đóng nếu mọi ticket liên kết đều đã hủy; nếu còn ticket chưa hủy thì việc dùng chung tiếp tục được giữ.

**Lỗi bước:** PMS xem lỗi tại “Tiến độ & nhật ký” rồi bấm “Thử lại bước xử lý”. Chỉ bước lỗi được thử lại; các việc/thông báo đã tạo thành công không được tạo lại.

**Mẫu điều hòa cài sẵn:** thông báo PMS nằm trước bước hoàn tất ticket. Khi có việc bổ sung, tin này có thể đến trong lúc ticket vẫn chờ. Quy trình xuất bản từ màn cấu hình gửi thông báo PMS sau khi ticket đã hoàn tất.

## Lưu dữ liệu và thông báo

`src/browser-store.js` đọc state mới nhất và xử lý mỗi thao tác trong một transaction IndexedDB. Ticket, công việc, tiến độ và thông báo được lưu cùng nhau. Command không hợp lệ thì không lưu thay đổi; lỗi ở một bước quy trình được lưu để PMS kiểm tra.

Sau khi lưu thành công, tab thao tác cập nhật UI và báo các tab khác đọc lại state. Các tab phải cùng origin/profile. Reload đọc lại dữ liệu đã lưu. Dữ liệu nằm trong database `smartos-maintenance-v1`, object store `state`, key `current`; state gồm các entity trong ERD, lịch sử `audit[]` và các sự kiện nội bộ `events[]` phục vụ việc tiếp tục bước chờ.

Thông báo là record trong dữ liệu. Đọc hoặc xử lý yêu cầu duyệt sẽ cập nhật trạng thái đã đọc. Thông báo trình duyệt gửi sau khi dữ liệu được lưu, phụ thuộc quyền và cài đặt OS; việc lưu notification không có nghĩa banner đã hiển thị.

## SLA

Ticket mặc định có thời hạn phản hồi 60 phút, xử lý 480 phút. Công việc lấy thời hạn trong cấu hình hoặc mẫu; việc thủ công không dùng mẫu mặc định 60/240 phút.

`responsedTime` ghi thời điểm phản hồi/bắt đầu đầu tiên; `processedTime` ghi thời điểm kết thúc. UI tính số phút từ `createdAt`, hiển thị đỏ khi quá SLA. Pause không trừ thời gian và chưa có nhắc quá hạn tự động. Công việc đóng vì hủy có `closedAt`, không ghi nhận giả là đã hoàn thành.

## Mã phục vụ web hiện tại

| File | Trách nhiệm |
| --- | --- |
| `src/App.jsx` | Màn hình ba vai trò, ticket, công việc, mẫu và thông báo |
| `src/StepWorkflowBuilder.jsx` | Form cấu hình bước, chạy thử, lưu nháp và xuất bản |
| `src/GraphRunDetails.jsx` | Hiển thị tiến độ bằng bước nghiệp vụ |
| `src/maintenance-workflow.js` | Kiểm tra và chuyển cấu hình bước thành dữ liệu thực thi |
| `src/engine.js`, `src/graph.js` | Áp dụng thao tác, quy tắc trạng thái và tiếp tục các bước có thể chạy |
| `src/browser-store.js`, `public/sw.js` | Lưu trữ, cập nhật nhiều tab và thông báo trình duyệt |
