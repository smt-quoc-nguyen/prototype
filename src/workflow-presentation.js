import { ancestors, OUTPUTS, outputFields, resolveBinding } from "./graph.js";
export const STEP_NAMES = {
  trigger: "Bắt đầu",
  workorder: "Công việc",
  approval: "Phê duyệt",
  automation: "Tự động hóa",
  condition: "Điều kiện",
  parallel: "Nhánh song song",
  notify: "Thông báo",
};
export const OPERATIONS = {
  "wait-event": "Chờ một thay đổi",
  "emit-event": "Phát một tín hiệu",
  "read-record": "Lấy thông tin",
  "update-record": "Cập nhật thông tin",
  "set-variable": "Lưu một giá trị",
  log: "Ghi vào nhật ký",
};
export const OPERATORS = {
  equals: "bằng",
  "not-equals": "khác",
  ">": "lớn hơn",
  ">=": "lớn hơn hoặc bằng",
  "<": "nhỏ hơn",
  "<=": "nhỏ hơn hoặc bằng",
  contains: "có chứa",
  "one-of": "thuộc một trong các giá trị",
};
export const VALUES = {
  low: "Thấp",
  medium: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp",
  submitted: "Đã gửi",
  approved: "Đã duyệt",
  inprogress: "Đang xử lý",
  resolved: "Đã giải quyết",
  cancelled: "Đã hủy",
  todo: "Chưa bắt đầu",
  "in-progress": "Đang thực hiện",
  pause: "Tạm dừng",
  completed: "Hoàn tất",
  closed: "Đã đóng",
};
export const FIELDS = {
  id: "Mã yêu cầu",
  title: "Tên",
  type: "Loại yêu cầu",
  priority: "Mức ưu tiên",
  location: "Vị trí",
  area: "Khu vực",
  customer: "Người gửi yêu cầu",
  note: "Ghi chú",
  status: "Trạng thái",
  responseTimeSLA: "Thời hạn phản hồi (phút)",
  processTimeSLA: "Thời hạn xử lý (phút)",
  workOrderId: "Công việc được tạo",
  ticketId: "Yêu cầu liên quan",
  assignees: "Người được giao việc",
  templateId: "Mẫu công việc",
  approved: "Được duyệt?",
  approver: "Người duyệt",
  reason: "Lý do",
  result: "Kết quả điều kiện",
  left: "Thông tin được xét",
  right: "Giá trị so sánh",
  recipients: "Người nhận",
  subject: "Tiêu đề thông báo",
  message: "Nội dung thông báo",
  sentCount: "Số người nhận",
  channels: "Kênh thông báo",
  notificationIds: "Thông báo đã lưu",
  context: "Dữ liệu liên quan",
  "context.resource": "Loại dữ liệu liên quan",
  "context.id": "Dữ liệu sẽ mở",
  value: "Giá trị",
  variable: "Thông tin đã lưu",
  recordId: "Bản ghi dữ liệu",
  record: "Thông tin đã lấy",
  resource: "Loại dữ liệu",
  payload: "Thông tin của tín hiệu",
  eventName: "Tên tín hiệu",
  sequence: "Thứ tự tín hiệu",
  eventId: "Mã tín hiệu",
  action: "Thao tác",
  mode: "Cách chia nhánh",
  branchCount: "Số nhánh",
};
export const RESOURCES = {
  ticket: {
    label: "Yêu cầu",
    fields: [
      "title",
      "priority",
      "status",
      "location",
      "area",
      "customer",
      "note",
    ],
    update: ["title", "note", "priority", "status"],
    status: ["submitted", "approved", "inprogress", "resolved", "cancelled"],
  },
  workorder: {
    label: "Công việc",
    fields: ["title", "priority", "status", "assignees", "note"],
    update: ["title", "note", "priority"],
    status: ["todo", "in-progress", "pause", "completed", "closed"],
  },
};
export function fieldLabel(path) {
  if (FIELDS[path]) return FIELDS[path];
  const leaf = path.split(".").at(-1);
  return FIELDS[leaf] || leaf;
}
export function sourceOptions(workflow, receiverOnly = false) {
  const result = OUTPUTS.trigger
    .filter((p) => !receiverOnly || p === "customer")
    .map((path) => ({
      group: "Yêu cầu lúc bắt đầu",
      label: path === "id" ? "Yêu cầu đang chạy quy trình" : fieldLabel(path),
      binding: { kind: "reference", scope: "trigger", path },
    }));
  for (const v of workflow.variables || [])
    if (!receiverOnly || typeof v.value === "string" || Array.isArray(v.value))
      result.push({
        group: "Thông tin dùng chung",
        label: v.label || v.name,
        binding: { kind: "reference", scope: "variable", path: v.name },
      });
  return result;
}
export function availableSources(workflow, node, receiverOnly = false) {
  const upstream = ancestors(workflow, node.id);
  return [
    ...sourceOptions(workflow, receiverOnly),
    ...workflow.nodes
      .filter((n) => upstream.has(n.id))
      .flatMap((n) =>
        outputFields(n)
          .filter(
            (path) =>
              !receiverOnly ||
              /(^|\.)(customer|assignees|recipients)$/.test(path),
          )
          .map((path) => ({
            group: n.title,
            label: fieldLabel(path),
            binding: { kind: "reference", scope: "node", nodeId: n.id, path },
          })),
      ),
  ];
}
export const bindingKey = (b) =>
  b?.kind === "reference"
    ? JSON.stringify({
        kind: "reference",
        scope: b.scope,
        path: b.path,
        ...(b.nodeId ? { nodeId: b.nodeId } : {}),
      })
    : JSON.stringify(b);
export function sourceLabel(binding, workflow) {
  if (!binding || binding.kind === "literal")
    return String(binding?.value ?? "Chưa chọn");
  if (binding.kind === "template") return "Nội dung có chèn thông tin";
  if (binding.kind === "list") return "Danh sách người nhận";
  const source =
    binding.scope === "trigger"
      ? "Yêu cầu lúc bắt đầu"
      : binding.scope === "variable"
        ? "Thông tin dùng chung"
        : workflow.nodes.find((n) => n.id === binding.nodeId)?.title ||
          "Bước trước";
  return `${source} · ${fieldLabel(binding.path)}`;
}
export function exampleValue(binding, workflow, run) {
  if (!binding || binding.kind === "literal") return binding?.value ?? "";
  if (binding.kind === "template")
    return binding.parts
      .map((p) => String(exampleValue(p, workflow, run)))
      .join("");
  if (binding.kind === "list")
    return binding.items.flatMap((b) => exampleValue(b, workflow, run));
  if (run) {
    try {
      return resolveBinding(binding, run);
    } catch {}
  }
  if (binding.scope === "variable")
    return (
      workflow.variables.find((v) => v.name === binding.path)?.value ??
      `[${fieldLabel(binding.path)}]`
    );
  if (binding.scope === "trigger")
    return (
      {
        title: "Điều hòa phòng họp không mát",
        id: "Yêu cầu mẫu",
        customer: "tenant-01",
        priority: "high",
        location: "Phòng họp · Tầng 3",
        area: "Office building",
        note: "Khách cần hỗ trợ",
        type: workflow.triggerType,
        status: "submitted",
        responseTimeSLA: 60,
        processTimeSLA: 480,
      }[binding.path] ?? `[${fieldLabel(binding.path)}]`
    );
  const n = workflow.nodes.find((n) => n.id === binding.nodeId);
  if (binding.path === "assignees") return ["tech-01"];
  if (binding.path === "title")
    return n?.inputs.title?.value || n?.title || "[Tên công việc]";
  return `[${sourceLabel(binding, workflow)}]`;
}
export function stepSummary(node, workflow) {
  if (node.type === "notify")
    return `Gửi ${node.notificationKind === "reminder" ? "lời nhắc" : "thông báo"} qua ${node.channels?.map((c) => (c === "in-app" ? "ứng dụng" : "trình duyệt")).join(" và ") || "kênh bạn chọn"}. Người nhận và nội dung do bạn cấu hình.`;
  if (node.type === "automation" && node.action === "wait-event")
    return "Dừng tại đây cho đến khi dữ liệu hoặc tín hiệu khớp điều kiện bạn chọn.";
  if (node.type === "automation" && node.action === "update-record")
    return "Thay đổi một thông tin của dữ liệu được chọn, rồi tiếp tục quy trình.";
  if (node.type === "condition")
    return "Kiểm tra một điều kiện để quyết định đi theo nhánh Đúng hay Sai.";
  if (node.type === "parallel")
    return node.mode === "join"
      ? "Chờ các nhánh đang chạy gặp nhau rồi tiếp tục."
      : "Bắt đầu nhiều nhánh cùng lúc.";
  if (node.type === "approval")
    return "Gửi yêu cầu xét duyệt. Quy trình đi tiếp theo quyết định của người duyệt.";
  if (node.type === "workorder")
    return "Tạo và giao một công việc. Quy trình đi tiếp ngay sau khi tạo.";
  return "Thực hiện thao tác bạn chọn, rồi chuyển sang bước tiếp theo.";
}
