> Tài liệu lưu trữ về canvas và engine tổng quát. Không dùng làm mô tả giao diện web hiện tại. Tài liệu hiện tại: [Workflow đang dùng trên web](../DIAGRAMS.md).

# Workflow Studio · Canvas, Transitions và Data mapping

Bản React dùng giao diện bước nghiệp vụ và **graph interpreter** cho thực thi. Tài liệu này mô tả schema nội bộ và dữ liệu canvas trước đây. Trong graph, `transitions` quyết định thứ tự/nhánh chạy; mảng `nodes` không tự quyết định thứ tự.

## Giao diện cấu hình hiện tại

PMS → **Quy trình xử lý** mở danh sách bước, không mở canvas. Xem [UX.md](../UX.md). Model nghiệp vụ trong `maintenance-workflow.js` chuyển approval, work order, notification, nhóm parallel, nhóm condition và completion thành graph. Mỗi công việc mặc định có bước chờ hoàn thành gắn đúng ID ở phía sau; compiler tạo đường nối theo thứ tự danh sách và các nhánh. Các node phụ trợ không hiển thị như bước người dùng phải cấu hình.

Canvas React Flow trong `GraphBuilder.jsx` được giữ như mã tham khảo; các phần Condition, Parallel, variables, bindings và Automation bên dưới mô tả schema/interpreter còn hỗ trợ cho dữ liệu trước đây. Giao diện mới chỉ mở cấu hình song song và điều kiện trạng thái bằng form; variables, binding tự do và Automation tổng quát không được mở như tùy chọn kỹ thuật. Graph không chuyển đổi đầy đủ được phải giữ nguyên, không tự bỏ cấu hình.

Lưu nháp quy trình đã xuất bản giữ riêng `workflow.draft` và không ngừng bản live. Xuất bản thay bản live; lần chạy cũ giữ snapshot. Chạy thử dùng reducer/interpreter trên state riêng trong bộ nhớ, không gọi browser-store dispatch, không lưu dữ liệu và không gửi thông báo thật.

## Nhóm và trạng thái trong model nghiệp vụ

- `parallel`: `branches` có 2–6 phần tử `{id, title, steps}`; các nhánh bắt đầu qua Split và hợp qua Join. Compiler chờ các work order đã giao nhưng chọn đi tiếp ngay trước khi kết thúc nhánh.
- `condition`: `mode=check|wait`, `resource=ticket|workorder`, `workStepId` khi nguồn là công việc, `status`, `matchedSteps`, `unmatchedSteps`. Nhánh không đúng chỉ dùng ở mode check. Nguồn công việc phải chắc chắn đã tạo trước bước này.
- `workorder.waitForCompletion`: mặc định true kể cả cấu hình cũ thiếu trường. False chỉ bỏ chờ tại bước giao việc; không bỏ invariant resolve/Join.
- Mode check tạo Read record → Condition → hai nhánh → Join; trạng thái lấy qua `record.status` của Read, không dùng output lúc tạo Work order.
- Mode wait tạo Read → Condition; true đi tiếp ngay, false vào Wait for event đúng resource/ID/status, rồi hợp và thực hiện các bước. Wait mới có `sinceActivation` và baseline sequence riêng để không nhận lịch sử cũ.
- `businessStepId` liên kết các node phụ trợ với bước hiển thị; tiến độ nhóm gộp completed/skipped đúng theo nhánh được chọn.

## Cấu trúc workflow

```text
Workflow
├── Trigger: event + ticket type + position
├── Nodes: cấu hình + inputs + position
│   ├── Work order
│   ├── Approval
│   ├── Automation
│   ├── Condition
│   ├── Parallel (Split / Join)
│   └── Notification
├── Transitions: source + sourceHandle + target + label
└── Variables / Data: typed defaults + trigger snapshot + node outputs
```

`graphVersion: 2` phân biệt graph mới với run tuần tự cũ. Ví dụ chuyển output của Work order thành input của Notification:

```json
{
  "graphVersion": 2,
  "id": "wf-example",
  "name": "Tạo việc và thông báo",
  "triggerType": "General request",
  "version": 1,
  "published": false,
  "trigger": {
    "id": "trigger",
    "event": "ticket.created",
    "position": { "x": 60, "y": 80 }
  },
  "variables": [
    { "name": "message", "type": "string", "value": "Yêu cầu đã được tiếp nhận" }
  ],
  "nodes": [
    {
      "id": "inspection",
      "type": "workorder",
      "title": "Tạo việc kiểm tra",
      "position": { "x": 360, "y": 80 },
      "templateId": "tpl-inspect",
      "assignee": "tech-01",
      "inputs": {
        "title": { "kind": "literal", "value": "Kiểm tra điều hoà" },
        "ticketId": { "kind": "reference", "scope": "trigger", "path": "id" },
        "priority": { "kind": "reference", "scope": "trigger", "path": "priority" }
      }
    },
    {
      "id": "notice",
      "type": "notify",
      "title": "Thông báo công việc",
      "position": { "x": 660, "y": 80 },
      "channels": ["in-app"],
      "notificationKind": "info",
      "inputs": {
        "recipients": {
          "kind": "list",
          "items": [
            { "kind": "reference", "scope": "trigger", "path": "customer" },
            { "kind": "reference", "scope": "node", "nodeId": "inspection", "path": "assignees" }
          ]
        },
        "subject": { "kind": "literal", "value": "Công việc mới" },
        "message": { "kind": "reference", "scope": "variable", "path": "message" },
        "contextResource": { "kind": "literal", "value": "workorder" },
        "contextId": {
          "kind": "reference",
          "scope": "node",
          "nodeId": "inspection",
          "path": "workOrderId"
        }
      }
    }
  ],
  "transitions": [
    { "id": "e1", "source": "trigger", "sourceHandle": "success", "target": "inspection" },
    { "id": "e2", "source": "inspection", "sourceHandle": "success", "target": "notice" }
  ]
}
```

Đây là workflow kết thúc sau khi **tạo việc và gửi tin**. Các bước tiếp theo được cấu hình bằng Automation tổng quát; bộ chạy dùng tên sự kiện, payload và resource mapping.

## Nodes và outputs

| Loại | Input / cấu hình chính | Output | Cổng transition |
| --- | --- | --- | --- |
| Trigger | event=ticket.created, triggerType | Snapshot ticket: id, title, type, priority, location, area, customer, note, status, SLA | success |
| Work order | Template hoặc tự tạo, assignee; bindings title, ticketId, priority, note | workOrderId, ticketId, title, status, priority, assignees, templateId | success |
| Approval | PMS xét duyệt; lý do khi reject | approved (boolean), approver, reason, ticketId | approved / rejected |
| Notification | channels, notificationKind; bindings recipients, subject, message, contextResource/contextId tùy chọn | sentCount, recipients, subject, message, channels, notificationIds, context, context.resource, context.id, status | success |
| Condition | left / right bindings; equals, not-equals, >, >=, <, <=, contains | result, left, right | true / false |
| Parallel Split | 2–6 nhánh | mode, branchCount | branch-1, branch-2, … |
| Parallel Join | Ít nhất hai transition vào | mode, branchCount (nhánh active) | success |
| Automation | action và input tương ứng | Theo action, xem dưới | success |

## Notification trừu tượng

Node `notify` mô tả một thông điệp, không chứa action riêng cho tenant, assignee hoặc trạng thái công việc:

- `inputs.recipients`: user ID hoặc mảng ID. Có thể dùng literal, reference hoặc list để kết hợp người cụ thể với dữ liệu Trigger/output/variable. Adapter demo biết tenant-01, tech-01, pms-01 và loại ID trùng.
- `inputs.subject`, `inputs.message`: chuỗi hoặc template gồm các đoạn literal/reference. Giữ nguyên nội dung đã resolve; không tự nối tên ticket vào tin.
- `channels`: một hoặc cả hai kênh `in-app`, `browser`. Channel catalog dùng chung giữa builder và validation; chỉ hai adapter này được triển khai.
- `notificationKind`: info, reminder, alert; là cách phân loại thông điệp. Yêu cầu phê duyệt có nút duyệt thuộc node Approval riêng.
- `inputs.contextResource`, `inputs.contextId`: để rỗng cả hai nếu không cần mở dữ liệu; hoặc chọn ticket/workorder và ID tương ứng. Không tự lấy ticket hiện tại khi chưa chọn context. Không có context thì bấm thông báo mở hộp thông báo; Maintainer với context công việc mở orders, PMS mở orders, Tenant mở ticket liên quan.

Output `status: "recorded"` cho biết record thông báo đã tạo trong state cục bộ. `sentCount` đếm người nhận duy nhất; không xác nhận OS banner đã hiển thị hay người nhận đã đọc. Browser-only record vẫn được lưu nhưng không xuất hiện trong inbox. Quyền trình duyệt/OS có thể ngăn hiển thị.

Validation yêu cầu có người nhận, ít nhất một kênh hợp lệ, tiêu đề và nội dung không rỗng. Reference/composition được kiểm tra upstream; giá trị người nhận và context được adapter kiểm tra khi chạy. Node cũ được normalize từ recipient role sang ID, title sang subject, workOrderId sang context tùy chọn, giữ channels cũ/mặc định và alias output workOrderId cho mapping đã lưu.

## Automation trừu tượng

Catalog gồm các operation có thể dùng lại giữa nhiều quy trình. Ý nghĩa nghiệp vụ nằm trong **configuration và data mapping**.

| Operation | Inputs / cấu hình | Outputs |
| --- | --- | --- |
| Wait for event | eventName; filters gồm payload path, operator và value binding | eventId, eventName, sequence, payload |
| Emit event | eventName, payload JSON hoặc output node khác | eventId, eventName, sequence, payload |
| Read record | resource, recordId | resource, recordId, record |
| Update record | resource, recordId, field, value | resource, recordId, record, value |
| Set variable | variableName đã khai báo; value binding | variable, value |
| Log | value binding | value |

Wait dùng AND cho mọi filter, hỗ trợ equals, not-equals, >, >=, <, <=, contains, one-of (value là mảng). Thiếu đường dẫn payload thì sự kiện không khớp. Không có filter thì nhận sự kiện đầu tiên có đúng tên. Inputs và giá trị lọc được chốt khi node kích hoạt.

**Output paths** là danh sách đường dẫn được khai báo, ví dụ `data.id, data.result`. Các node sau có thể chọn `payload.data.result` hoặc `record.note` trong dropdown. Khai báo chỉ công bố đường dẫn cho mapping, không tạo field hoặc ép kiểu payload. Path không tồn tại khi node sau resolve input sẽ gây lỗi. Có thể map toàn bộ `payload` / `record` thành một input JSON.

Ví dụ hoàn toàn độc lập với Work order:

```json
{
  "id": "receive",
  "type": "automation",
  "action": "wait-event",
  "title": "Nhận kết quả",
  "position": { "x": 360, "y": 80 },
  "filters": [{ "id": "key", "path": "data.key", "operator": "equals" }],
  "outputPaths": ["data.result"],
  "inputs": {
    "eventName": { "kind": "literal", "value": "external.received" },
    "filter_key": { "kind": "reference", "scope": "trigger", "path": "id" }
  }
}
```

Node sau tham chiếu `{kind:"reference", scope:"node", nodeId:"receive", path:"payload.data.result"}`. Trong sandbox, phát `external.received` với payload `{data:{key:<trigger id>,result:...}}` để chạy tiếp. Emit event trong graph và command PMS `EMIT_EVENT` dùng cùng journal.

### Event journal và resource adapters

- `events[]` chứa `{id, sequence, name, payload, at}`; `eventSequence` tăng trong transaction IndexedDB. Journal được lưu cùng state và chưa có chính sách dọn lịch sử.
- Mỗi run giữ `eventCursor` là sequence lúc bắt đầu. Wait xét sự kiện **sau sequence đó**, kể cả sự kiện phát trước khi node Wait kích hoạt. Nhờ vậy Emit/Wait ở các nhánh Parallel không mất sự kiện do thứ tự duyệt node. Wait nhận sự kiện phù hợp đầu tiên; một sự kiện có thể thỏa nhiều Wait. Filter correlation ID do tác giả workflow cấu hình. Journal không có cơ chế consume độc quyền.
- Command thay đổi Ticket/Work order phát `record.created` / `record.updated`, payload `{resource, recordId, record}`. Update record và tạo Work order trong graph phát ngay để các nhánh khác quan sát được. Các run đang hoạt động được tiếp tục trong cùng transaction; node đã completed không được phát lại.
- `graph.js` xử lý operation, bindings, transitions và matching. Resource adapter trong `engine.js` xử lý entity, quyền demo và invariants. Bản này hỗ trợ resource `ticket`, `workorder`; Read trả snapshot hiện tại. Update chỉ sửa `title`, `note`, `priority`, và `ticket.status`; record phải liên quan tới ticket của run. Adapter không cho sửa record đã kết thúc hoặc giá trị sai kiểu.
- Với `ticket.status = resolved`, adapter đợi mọi Work order liên quan completed/closed trước khi ghi; run hiển thị `waiting-data`. `cancelled` dùng nghiệp vụ hủy và dừng run. Đây là chính sách của **resource adapter**, không phải operation riêng trong catalog. Muốn thêm resource hoặc hành vi nghiệp vụ khác, mở rộng adapter.
- Để một bước chạy sau toàn bộ các nhánh, nối các nhánh vào Parallel Join rồi nối bước đó. Bộ chạy không tự đưa node cập nhật trạng thái xuống cuối graph.

Kịch bản điều hòa dùng **cấu hình mẫu**: Wait for event với `eventName=record.updated`; filter `resource=workorder`, `recordId` lấy từ output của bước tạo việc, `record.status` one-of `[completed, closed]`. Bước cuối Update record có resource=ticket, recordId=trigger.id, field=status, value=resolved. Cùng operation có thể đổi sự kiện, resource, field và mapping mà không cần thêm loại action.

Không chạy JavaScript tùy ý, HTTP, webhook, email hoặc Zalo. Tên `external.received` là sự kiện mô phỏng cục bộ; không có dịch vụ bên ngoài gửi sự kiện khi mọi tab đóng.

### Condition và Parallel

Condition chỉ phát **một** cổng true/false; cổng còn lại bị skipped. Nhánh skipped lan xuống graph, không tạo work order hoặc gửi thông báo. So sánh equals/not-equals dùng kiểu dữ liệu thực: `true` khác `"true"`, `1` khác `"1"`; các phép lớn/nhỏ cần hai số. Contains nhận chuỗi hoặc mảng.

Parallel Split phát mọi cổng một lần. Các nhánh chạy độc lập và có thể đồng thời ở trạng thái chờ người duyệt hoặc work order. Đây là fan-out trong engine sự kiện, không phải worker threads hoặc dịch vụ chạy nền.

Join (và node có nhiều transitions vào) đợi **mọi transition vào được quyết định**, sau đó chạy một lần nếu ít nhất một nhánh được fired. Nhánh skipped không chặn Join. Nếu mọi nhánh vào skipped, Join cũng skipped. Một cổng của node nối tối đa một transition; dùng Parallel Split khi cần fan-out.

Approval phát cổng theo quyết định PMS. Nếu rejected **có dây nối**, engine chạy nhánh Rejected; ticket không tự hủy, cho phép bạn gửi thông báo, cập nhật dữ liệu hoặc đặt trạng thái thông qua Update record. Nếu rejected **không có dây nối**, mặc định hủy ticket/dừng run như kịch bản bảo trì ban đầu. Có thể nhiều Approval song song; command và thông báo dùng nodeId để duyệt đúng bước.

## Input mapping

Mỗi ô input chọn một nguồn:

1. **Literal**: Text, Number, Boolean hoặc JSON.
2. **Trigger → field**: dữ liệu ticket tại lúc bắt đầu run.
3. **Variables → name**: giá trị biến hiện tại trong run.
4. **Node title → outputField**: output của một node ancestor theo graph.

Canvas trước đây hiển thị chip/chọn dữ liệu bằng tên dễ đọc. Chế độ nâng cao của canvas hiện biểu thức dạng `{{ nodes.inspection.workOrderId }}` để đọc mapping; dữ liệu lưu là object reference như ví dụ, **không eval biểu thức hoặc script**. Chỉ chọn các output field được engine công bố. Phải nối transitions trước thì node phía trước mới xuất hiện trong dropdown nguồn input.

Binding composition bổ sung:

```js
{ kind: "template", parts: [literal("Xin chào "), reference("trigger", "title")] }
{ kind: "list", items: [literal(["pms-01"]), reference("node", "assignees", "inspection")] }
```

Template nối các phần thành chuỗi; list gom và làm phẳng các giá trị. Validator kiểm tra mọi reference bên trong, giới hạn độ sâu 8 và tối đa 100 phần mỗi composition. Không thực thi script. Người dùng cơ bản tạo các cấu trúc này bằng chọn người/chèn thông tin.

Input được resolve và chốt **khi node được kích hoạt lần đầu**. Khi node chờ sự kiện rồi tiếp tục, input vẫn là giá trị đã chốt. Output Work order là snapshot lúc tạo (status thường todo); để lấy dữ liệu tại lúc sự kiện phát ra, map payload.record.status từ Wait for event; Read record lấy dữ liệu hiện tại từ resource.

Nếu chọn output của một node trong nhánh bị skipped, output không tồn tại: run lưu trạng thái **error**, báo rõ node/path thiếu dữ liệu. Không tự thay bằng giá trị rỗng. Có thể tránh bằng cách lấy dữ liệu từ node luôn chạy, đặt mapping trong chính nhánh đó hoặc gán vào biến trước khi hợp nhánh. Đọc/ghi cùng biến giữa các nhánh không được sắp thứ tự bị validation từ chối để tránh race; hãy đặt writer và reader sau transition / Join.

Variables tách riêng cho từng run, hỗ trợ string, number, boolean, object. Tên biến không dùng dấu chấm hoặc reserved property. Thay đổi default không đổi run đang chạy.

## Runtime, validation và migration

State của graph run bổ sung:

- `triggerOutput`: snapshot dữ liệu trigger.
- `eventCursor`: sequence đầu run; giới hạn replay của Wait.
- `variables`: giá trị hiện tại của biến trong run.
- `outputs[nodeId]`: JSON output của node đã completed.
- `nodeStates[nodeId]`: pending / waiting / completed / skipped / error, input đã resolve, eventName hoặc resource/recordId đang đợi.
- `edgeStates[edgeId]`: pending / fired / skipped.
- `approvals[nodeId]`: quyết định hoặc đang pending.

Interpreter chỉ kích hoạt node khi transitions vào đã được quyết định. Các node completed/skipped không chạy lại; duplicate approval/WO completion vẫn bị guard chặn. Event mới tiếp tục các run đang hoạt động, kể cả run còn Approval ở nhánh khác; filters quyết định node nào tiếp tục. Lần chạy hiển thị trạng thái từng node, input/output và variables/transitions; không suy ra từ vị trí node hoặc cursor.

Lỗi cấu hình runtime được lưu vào run với errorNodeId; các action thành công trước đó vẫn được commit và có trace. **Thử lại node lỗi** chỉ thử node lỗi, không phát lại node completed. Snapshot graph không sửa tại chỗ qua builder, nên lỗi mapping thiếu output do nhánh skipped sẽ vẫn lỗi nếu thử lại mà dữ liệu chưa có.

Xuất bản/import/chạy thử kiểm tra: DAG không vòng lặp, mọi node reachable từ Trigger, endpoints/ports hợp lệ, một successor cho mỗi cổng, đầy đủ True/False và các nhánh Parallel, template/assignee/recipients hợp lệ, upstream data references, biến có kiểu, reader/writer không race và không trùng trigger type đã published.

Workflow tuần tự cũ được chuyển sang graph với transitions liên tiếp; wait/resolve cũ thành Wait for event / Update record với configuration tương ứng. **Run cũ giữ snapshot và engine tuần tự** để không mất trạng thái đang chờ. Run mới luôn dùng graph. Snapshot graph cũ dùng action cụ thể được nâng cấp representation khi tiếp tục, giữ ID/edges/outputs/completed states; input của node chưa hoàn tất được resolve lại theo schema mới. `workflow-compat.js` giữ aliases output cũ cho các mapping đã lưu. Giao diện bước mới chỉ mở cấu hình có thể chuyển đổi đầy đủ sang model nghiệp vụ; cấu hình khác giữ nguyên. Lưu/xuất bản model mới vẫn ghi graphVersion=2. Không đổi database hay xóa dữ liệu.

Realtime, IndexedDB transaction, Service Worker và giới hạn cùng origin/profile vẫn giữ nguyên. Không scheduler, vòng lặp workflow, timeout approval tự động, remote action hay remote Push.
