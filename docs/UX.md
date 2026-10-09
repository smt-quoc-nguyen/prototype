# Thiết kế quy trình cho PMS

Quy trình đọc từ trên xuống: **yêu cầu mới → duyệt nếu cần → các bước xử lý → hoàn tất yêu cầu**. Các bước có thể là công việc, thông báo, nhóm song song hoặc điều kiện theo trạng thái. Người dùng cấu hình bằng form; các nhánh được nối sẵn.

## Tạo và chỉnh quy trình

1. Vào PMS → **Quy trình xử lý** và tạo quy trình mới hoặc chọn quy trình có sẵn.
2. Đặt tên dễ nhận biết và chọn loại yêu cầu. Quy trình chỉ bắt đầu với yêu cầu mới thuộc loại đó, từ Tenant hoặc PMS.
3. Chọn có cần PMS phê duyệt trước khi xử lý hay không. Khi cần duyệt, quy trình dừng chờ PMS. Từ chối cần lý do, báo Tenant và kết thúc yêu cầu.
4. Thêm công việc từ mẫu hoặc tự nhập. Điền tên, kỹ thuật viên và checklist. Mẫu giúp dùng lại checklist và thời gian xử lý.
5. Thêm thông báo ở vị trí người nhận cần được cập nhật. Chọn vai trò nhận, tiêu đề và nội dung; xem trước thông điệp. Thông báo trong ứng dụng luôn bật, có thể gửi thêm qua trình duyệt.
6. Đổi thứ tự bằng nút lên/xuống; xóa bước không cần. Các bước bắt đầu và hoàn tất được giữ cố định.
7. Chạy thử, lưu nháp hoặc xuất bản.

Mỗi quy trình có tối đa 18 bước, tính cả các bước bên trong nhóm. Cấu hình lớn còn được kiểm tra theo giới hạn thực thi trước khi xuất bản.

Mặc định, mỗi công việc tự đợi Maintainer hoàn thành trước khi chạy bước tiếp theo. Có thể chọn đi tiếp ngay sau khi giao việc để các bước phía sau theo dõi trạng thái khi công việc còn đang xử lý. Khi giao công việc, hệ thống báo Tenant và Maintainer. Bước hoàn tất vẫn kiểm tra tất cả công việc đã tạo và liên quan, kể cả việc đi tiếp ngay hoặc việc PMS thêm thủ công, rồi kết thúc ticket và báo Tenant/PMS.

Chỉ có một kỹ thuật viên demo trong prototype. Các công việc song song cùng xuất hiện trong danh sách của người này, không đòi hỏi hoàn thành theo thứ tự. Chưa hỗ trợ chọn người dùng ngoài dữ liệu demo, email/SMS, lịch chạy hay API bên ngoài.

## Làm song song

Thêm một nhóm song song rồi cấu hình từ 2 đến 6 nhánh. Các nhánh bắt đầu cùng lúc khi quy trình đến nhóm; mỗi nhánh có các bước riêng chạy từ trên xuống. Bước phía sau nhóm chỉ chạy khi tất cả nhánh đang thực hiện đã xong.

Ví dụ: nhánh 1 kiểm tra điện; nhánh 2 kiểm tra hệ thống nước. Hoàn thành kiểm tra điện chưa làm quy trình đi tiếp nếu kiểm tra nước còn chưa xong. Điều kiện trong một nhánh có thể bỏ qua các bước không cần; nhánh bị bỏ qua không tạo công việc hoặc gửi thông báo.

## Điều kiện theo trạng thái

Chọn ticket đang xử lý hoặc một công việc đã được giao ở bước trước làm nguồn, rồi chọn trạng thái và cách thực hiện:

- **Kiểm tra ngay**: đọc trạng thái hiện tại khi đến bước. Chạy nhánh đúng hoặc không đúng; không kiểm tra lại sau khi đã chọn nhánh.
- **Chờ trạng thái**: nếu đang đúng trạng thái đã chọn thì đi tiếp ngay. Nếu chưa đúng thì dừng ở bước này đến khi có thay đổi phù hợp, rồi thực hiện các bước bên trong.

Ví dụ kiểm tra ngay: nếu ticket đã duyệt thì giao một công việc; nếu chưa duyệt thì gửi thông báo cho PMS. Ví dụ chờ: giao công việc và chọn đi tiếp ngay, rồi chờ công việc đang làm hoặc tạm dừng để gửi thông báo tương ứng. Có thể đặt các bước chờ này ở các nhánh song song.

Trạng thái được đọc từ dữ liệu hiện tại, không lấy trạng thái cũ lúc tạo công việc. Bước chờ không nhận một lần thay đổi đã xảy ra trước khi nó bắt đầu chờ. Chỉ chọn được công việc chắc chắn đã được tạo trước bước đang cấu hình; không chọn việc ở nhánh có thể bị bỏ qua hoặc chưa chạy.

Công việc đã được chờ hoàn tất ở bước trước sẽ không quay về trạng thái cần làm/đang làm/tạm dừng. Giao diện kiểm tra các cấu hình chờ không thể xảy ra trước khi xuất bản. Nếu lúc vận hành công việc đã chuyển qua trạng thái cần chờ và không thể quay lại, quy trình báo lỗi rõ ràng để PMS kiểm tra. Hủy hoặc hoàn tất ticket kết thúc quy trình; không dùng các trạng thái kết thúc này để giữ một bước chờ.

## Chạy thử

Dùng một yêu cầu mẫu và thao tác duyệt/từ chối, bắt đầu, tạm dừng, tiếp tục hoặc hoàn tất từng công việc; PMS có thể đóng công việc đã hoàn thành để thử trạng thái Đã đóng. Nhóm song song cho thử các công việc theo thứ tự bất kỳ. Kết quả hiển thị bước/nhánh đang đợi, nhánh bị bỏ qua và các thông báo mẫu.

Chạy thử dùng cùng engine với vận hành thật nhưng dữ liệu riêng trong bộ nhớ. Nó không lưu ticket, work order hay thông báo vào hệ thống và không gửi thông báo trình duyệt. Chỉnh cấu hình sẽ đặt lại kết quả thử; reload cũng xóa phiên thử.

## Lưu và áp dụng

**Lưu bản nháp** giữ cấu hình để chỉnh tiếp. Với quy trình đã xuất bản, bản nháp được lưu riêng; yêu cầu mới vẫn dùng bản đang áp dụng. Với quy trình mới, lưu nháp chưa kích hoạt xử lý.

**Xuất bản quy trình** kiểm tra tên, loại yêu cầu và cấu hình từng bước rồi áp dụng cho yêu cầu mới. Mỗi loại yêu cầu chỉ có một quy trình đang áp dụng. Không tự ghi đè quy trình khác cùng loại.

Các yêu cầu đã bắt đầu giữ bản chụp quy trình ở thời điểm tạo; chỉnh sửa hoặc xuất bản không thay đổi thứ tự công việc của chúng. Lịch sử chạy hiển thị các bước nghiệp vụ và trạng thái để PMS theo dõi.

## Kiểm tra giữa ba ứng dụng

Mở Tenant, Maintainer và PMS trong cùng origin và cùng profile trình duyệt:

1. Tenant tạo yêu cầu đúng loại của quy trình đã xuất bản.
2. PMS nhận và phê duyệt nếu quy trình yêu cầu duyệt.
3. Maintainer nhận công việc, bấm bắt đầu, hoàn tất checklist rồi hoàn thành.
4. Việc tuần tự xuất hiện theo thứ tự đã chọn; các việc trong nhánh song song xuất hiện cùng lúc. Bước điều kiện/chờ chạy theo trạng thái thực tế.
5. Khi mọi công việc xong, Tenant thấy yêu cầu hoàn tất; PMS nhận kết quả và xem lịch sử.

Tenant có thể hủy yêu cầu đang mở; quy trình dừng và không tạo công việc tiếp theo. Công việc dùng riêng cho yêu cầu bị hủy được đóng. Công việc dùng chung vẫn tiếp tục nếu còn yêu cầu liên quan đang hoạt động.

Hộp thông báo luôn dùng được với kênh trong ứng dụng. Kênh trình duyệt cần bật thông báo và cấp quyền. Không có đồng bộ giữa thiết bị hoặc trình duyệt khác nhau; đóng mọi tab thì không có engine chạy nền.

Xem [3 sơ đồ và phần giải thích](DIAGRAMS.md) để review tổng thể, hoặc [LOGIC.md](LOGIC.md) cho quy tắc dữ liệu và trạng thái.
