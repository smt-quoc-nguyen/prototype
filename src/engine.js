import {
  compileBusinessWorkflow,
  validateBusinessWorkflow,
} from "./maintenance-workflow.js";
import {
  toGraph,
  validateGraph,
  stepGraph,
  graphApproval,
  literal,
  reference,
} from "./graph.js";
import { maintenanceWaitSummary } from "./workflow-compat.js";
import { emitEvent, emitRecord } from "./workflow-events.js";
// Pure domain engine. Persistence and browser APIs are kept in browser-store.js.
export const USERS = {
  tenant: { id: "tenant-01", name: "Nguyễn Minh Anh" },
  maintainer: { id: "tech-01", name: "Trần Hoàng Nam" },
  pms: { id: "pms-01", name: "Lê Thảo Vy" },
};
export const TYPES = [
  "Equipment malfunction",
  "Plumbing",
  "Electrical",
  "General request",
];
export const id = (prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`;
const copy = (value) => structuredClone(value);
export function defaultWorkflow() {
  // The maintenance example is configuration over generic operations.
  const waitEvent = (nodeId, source, title) => ({
    id: nodeId,
    type: "automation",
    title,
    action: "wait-event",
    filters: [
      { id: "resource", path: "resource", operator: "equals" },
      { id: "id", path: "recordId", operator: "equals" },
      { id: "status", path: "record.status", operator: "one-of" },
    ],
    outputPaths: ["resource", "recordId", "record.status"],
    inputs: {
      eventName: literal("record.updated"),
      filter_resource: literal("workorder"),
      filter_id: reference("node", "workOrderId", source),
      filter_status: literal(["completed", "closed"]),
    },
  });
  const notice = (nodeId, title, source, recipients) => ({
    id: nodeId,
    type: "notify",
    title,
    notificationKind: "info",
    channels: ["in-app", "browser"],
    inputs: {
      recipients,
      subject: literal(title),
      message: source
        ? {
            kind: "template",
            parts: [
              literal("Công việc "),
              reference("node", "title", source),
              literal(" đã được tạo. Bạn có thể xem chi tiết trong ứng dụng."),
            ],
          }
        : literal("Các công việc của quy trình đã hoàn tất."),
      contextResource: literal(source ? "workorder" : "ticket"),
      contextId: source
        ? reference("node", "workOrderId", source)
        : reference("trigger", "id"),
    },
  });
  const graph = toGraph({
    id: "wf-ac",
    name: "Xử lý sự cố điều hoà",
    triggerType: "Equipment malfunction",
    version: 1,
    published: true,
    nodes: [
      { id: "approval", type: "approval", title: "Phê duyệt yêu cầu" },
      {
        id: "inspect",
        type: "workorder",
        title: "Kiểm tra điều hoà",
        templateId: "tpl-inspect",
        assignee: "tech-01",
      },
      notice("notify-inspect", "Thông báo lịch kiểm tra", "inspect", {
        kind: "list",
        items: [
          reference("trigger", "customer"),
          reference("node", "assignees", "inspect"),
        ],
      }),
      waitEvent("wait-inspect", "inspect", "Chờ sự kiện · bước 1"),
      {
        id: "repair",
        type: "workorder",
        title: "Sửa chữa máy lạnh",
        templateId: "tpl-repair",
        assignee: "tech-01",
      },
      notice("notify-repair", "Thông báo sửa chữa", "repair", {
        kind: "list",
        items: [
          reference("trigger", "customer"),
          reference("node", "assignees", "repair"),
        ],
      }),
      waitEvent("wait-repair", "repair", "Chờ sự kiện · bước 2"),
      notice(
        "notify-pms",
        "Bảo trì đã hoàn tất",
        null,
        literal([USERS.pms.id]),
      ),
      {
        id: "resolve",
        type: "automation",
        title: "Cập nhật dữ liệu",
        action: "update-record",
        outputPaths: ["status"],
        inputs: {
          resource: literal("ticket"),
          recordId: reference("trigger", "id"),
          field: literal("status"),
          value: literal("resolved"),
        },
      },
    ],
  });
  return graph;
}
export function initialState() {
  return {
    schemaVersion: 1,
    revision: 0,
    tickets: [],
    workOrders: [],
    links: [],
    groups: [],
    notifications: [],
    runs: [],
    audit: [],
    events: [],
    eventSequence: 0,
    workflows: [defaultWorkflow()],
    templates: [
      {
        id: "tpl-inspect",
        name: "Kiểm tra điều hoà",
        checklist: [
          "Kiểm tra nguồn điện và remote",
          "Kiểm tra nhiệt độ, gas và bộ lọc",
          "Ghi nhận nguyên nhân sự cố",
        ],
        responseTimeSLA: 60,
        processTimeSLA: 120,
      },
      {
        id: "tpl-repair",
        name: "Sửa chữa máy lạnh",
        checklist: [
          "Thực hiện sửa chữa theo kết quả kiểm tra",
          "Chạy thử và đo nhiệt độ",
          "Vệ sinh, bàn giao cho khách",
        ],
        responseTimeSLA: 60,
        processTimeSLA: 240,
      },
    ],
  };
}
function log(s, event, entityId, actor, at) {
  s.audit.unshift({ id: id("log"), event, entityId, actor, at });
}
function notify(
  s,
  role,
  title,
  ticketId,
  at,
  kind = "info",
  workOrderId = null,
  metadata = {},
) {
  s.notifications.unshift({
    id: id("notice"),
    recipient: USERS[role].id,
    role,
    title,
    ticketId,
    workOrderId,
    kind,
    read: false,
    createdAt: at,
    ...metadata,
  });
}
export function validateWorkflow(w, templates) {
  if (w.business) validateBusinessWorkflow(w, templates);
  validateGraph(toGraph(w), { templates, types: TYPES, users: USERS });
}
function newWorkOrder(s, data, ticketIds, actor, at, runId = null) {
  const template = s.templates.find((t) => t.id === data.templateId);
  if (!data.title?.trim()) throw Error("Work order cần tên.");
  if (
    !ticketIds.length ||
    ticketIds.some(
      (tid) =>
        !s.tickets.some(
          (t) => t.id === tid && !["resolved", "cancelled"].includes(t.status),
        ),
    )
  )
    throw Error("Chọn ticket đang mở.");
  const checklist = data.checklist ?? template?.checklist ?? [];
  if (
    !Array.isArray(checklist) ||
    checklist.some((text) => typeof text !== "string" || !text.trim())
  )
    throw Error("Checklist công việc cần có nội dung hợp lệ.");
  const responseTimeSLA =
    data.responseTimeSLA ?? template?.responseTimeSLA ?? 60;
  const processTimeSLA = data.processTimeSLA ?? template?.processTimeSLA ?? 240;
  if (
    ![responseTimeSLA, processTimeSLA].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw Error("Thời hạn công việc phải lớn hơn 0 phút.");
  const wo = {
    id: id("WO"),
    title: data.title.trim(),
    templateId: template?.id || null,
    assignees: [USERS.maintainer.id],
    status: "todo",
    priority: data.priority || "medium",
    responsedTime: null,
    processedTime: null,
    responseTimeSLA,
    processTimeSLA,
    createdAt: at,
    updatedAt: at,
    createdBy: actor,
    updatedBy: actor,
    runId,
    note: data.note || "",
    checklist: checklist.map((text) => ({
      text,
      done: false,
    })),
  };
  s.workOrders.unshift(wo);
  ticketIds.forEach((ticketId) => {
    s.links.push({ ticketId, workOrderId: wo.id });
    const ticket = s.tickets.find((t) => t.id === ticketId);
    ticket.assignees = [...new Set([...ticket.assignees, ...wo.assignees])];
    ticket.updatedAt = at;
    ticket.updatedBy = actor;
  });
  log(s, `Tạo work order: ${wo.title}`, wo.id, actor, at);
  return wo;
}
function legacyStep(s, run, at) {
  const ticket = s.tickets.find((t) => t.id === run.ticketId);
  if (
    ["cancelled", "resolved"].includes(ticket.status) ||
    ["rejected", "cancelled", "completed"].includes(run.status)
  )
    return;
  run.status = "running";
  while (run.cursor < run.workflow.nodes.length) {
    const node = run.workflow.nodes[run.cursor];
    if (node.type === "approval") {
      if (run.approval !== "approved") {
        run.status = "waiting-approval";
        if (
          !run.trace.some((t) => t.nodeId === node.id && t.status === "waiting")
        ) {
          notify(
            s,
            "pms",
            `Cần phê duyệt: ${ticket.title}`,
            ticket.id,
            at,
            "approval",
          );
          run.trace.push({
            nodeId: node.id,
            title: node.title,
            status: "waiting",
            at,
          });
        }
        return;
      }
    } else if (node.type === "workorder") {
      const wo = newWorkOrder(
        s,
        { ...node, priority: ticket.priority },
        [ticket.id],
        "workflow",
        at,
        run.id,
      );
      run.lastWorkOrderId = wo.id;
    } else if (node.type === "notify") {
      node.recipients.forEach((role) =>
        notify(
          s,
          role,
          `${node.title} · ${ticket.title}`,
          ticket.id,
          at,
          "info",
          run.lastWorkOrderId,
        ),
      );
    } else if (node.type === "wait") {
      const wo = s.workOrders.find((w) => w.id === run.lastWorkOrderId);
      if (!wo || !["completed", "closed"].includes(wo.status)) {
        run.status = "waiting-workorder";
        run.waitingWorkOrderId = run.lastWorkOrderId;
        if (
          !run.trace.some((t) => t.nodeId === node.id && t.status === "waiting")
        )
          run.trace.push({
            nodeId: node.id,
            title: node.title,
            status: "waiting",
            at,
          });
        return;
      }
      run.waitingWorkOrderId = null;
    } else if (node.type === "resolve") {
      const orders = s.links
        .filter((l) => l.ticketId === ticket.id)
        .map((l) => s.workOrders.find((w) => w.id === l.workOrderId));
      if (orders.some((w) => !["completed", "closed"].includes(w.status))) {
        run.status = "waiting-linked-workorders";
        return;
      }
      ticket.status = "resolved";
      ticket.resolvedBy = "workflow";
      ticket.processedTime = at;
      ticket.updatedAt = at;
      ticket.updatedBy = "workflow";
      notify(
        s,
        "tenant",
        `Yêu cầu đã hoàn tất: ${ticket.title}`,
        ticket.id,
        at,
      );
      log(s, "Ticket resolved (hiển thị: Hoàn tất)", ticket.id, "workflow", at);
    }
    run.trace.push({
      nodeId: node.id,
      title: node.title,
      status: "completed",
      at,
      workOrderId: run.lastWorkOrderId,
    });
    run.cursor++;
  }
  run.status = "completed";
  run.completedAt = at;
}
function cancelDomain(s, t, actor, at, reason = "", { rejected = false } = {}) {
  t.status = "cancelled";
  t.cancelledBy = actor;
  t.updatedBy = actor;
  t.updatedAt = at;
  t.processedTime = at;
  s.runs
    .filter((r) => r.ticketId === t.id && r.status !== "completed")
    .forEach((r) => (r.status = "cancelled"));
  s.notifications
    .filter((n) => n.ticketId === t.id && n.kind === "approval")
    .forEach((n) => (n.read = true));
  s.links
    .filter((l) => l.ticketId === t.id)
    .forEach((l) => {
      const wo = s.workOrders.find((w) => w.id === l.workOrderId);
      const active = s.links.some(
        (x) =>
          x.workOrderId === wo.id &&
          s.tickets.some(
            (t) => t.id === x.ticketId && t.status !== "cancelled",
          ),
      );
      if (!active && !["completed", "closed"].includes(wo.status)) {
        wo.status = "closed";
        wo.closedAt = at;
        wo.closeReason = "ticket-cancelled";
        wo.updatedAt = at;
        wo.updatedBy = actor;
      }
    });
  notify(s, "pms", `Ticket đã hủy: ${t.title}`, t.id, at);
  if (!rejected)
    notify(s, "maintainer", `Dừng xử lý ticket: ${t.title}`, t.id, at);
  if (reason)
    notify(s, "tenant", `Yêu cầu bị từ chối / hủy: ${reason}`, t.id, at);
  log(
    s,
    reason ? `Từ chối / hủy: ${reason}` : "Hủy ticket và dừng workflow",
    t.id,
    actor,
    at,
  );
}
// Resource adapters own business validation; graph.js only knows operations and JSON data.
function readWorkflowRecord(s, { resource, recordId }) {
  const collection = { ticket: s.tickets, workorder: s.workOrders }[resource];
  const record = collection?.find((r) => r.id === recordId);
  if (!record) throw Error("Resource hoặc recordId không tồn tại.");
  return { record };
}
function updateWorkflowRecord(s, input, run, at) {
  const { resource, recordId, field, value } = input;
  const { record } = readWorkflowRecord(s, input);
  if (
    (resource === "ticket" && recordId !== run.ticketId) ||
    (resource === "workorder" &&
      !s.links.some(
        (l) => l.ticketId === run.ticketId && l.workOrderId === recordId,
      ))
  )
    throw Error("Record cập nhật cần liên quan tới run hiện tại.");
  if (
    ![
      "title",
      "note",
      "priority",
      ...(resource === "ticket" ? ["status"] : []),
    ].includes(field)
  )
    throw Error("Adapter này hỗ trợ title, note, priority và ticket.status.");
  if (
    typeof value !== "string" ||
    (field !== "note" && !value.trim()) ||
    (field === "priority" &&
      !["low", "medium", "high", "urgent"].includes(value))
  )
    throw Error("Giá trị cập nhật record không hợp lệ.");
  if (["cancelled", "resolved", "completed", "closed"].includes(record.status))
    throw Error("Record đã kết thúc, không thể cập nhật.");
  if (field === "status") {
    if (!["resolved", "cancelled"].includes(value))
      throw Error(
        "Ticket status chỉ nhận resolved / cancelled qua adapter workflow.",
      );
    if (value === "cancelled") {
      cancelDomain(s, record, "workflow", at, "Workflow cập nhật trạng thái");
      emitRecord(s, resource, record, false, at, id);
      return { record, stopRun: true };
    }
    // This is a domain invariant, independent of graph structure or node naming.
    const unfinished = s.links
      .filter((l) => l.ticketId === recordId)
      .some(
        (l) =>
          !["completed", "closed"].includes(
            s.workOrders.find((w) => w.id === l.workOrderId)?.status,
          ),
      );
    if (unfinished) return { waiting: true };
    record.resolvedBy = "workflow";
    record.processedTime = at;
    notify(s, "tenant", `Yêu cầu đã hoàn tất: ${record.title}`, recordId, at);
  }
  record[field] = value;
  record.updatedAt = at;
  record.updatedBy = "workflow";
  log(s, `Cập nhật ${resource}.${field}`, recordId, "workflow", at);
  emitRecord(s, resource, record, false, at, id);
  return { record };
}
// Notification adapter maps generic user IDs, channels and optional links onto the demo apps.
function sendWorkflowNotification(s, input, node, at) {
  const recipients = [
    ...new Set(
      Array.isArray(input.recipients) ? input.recipients : [input.recipients],
    ),
  ];
  const people = Object.entries(USERS);
  if (
    !recipients.length ||
    recipients.some((userId) => !people.some(([, user]) => user.id === userId))
  )
    throw Error(
      "Chọn ít nhất một người nhận hợp lệ, hoặc kiểm tra dữ liệu người nhận ở bước trước.",
    );
  if (
    ![input.subject, input.message].every(
      (text) => typeof text === "string" && text.trim(),
    )
  )
    throw Error("Điền tiêu đề và nội dung thông báo.");
  let context = null,
    ticketId = null,
    workOrderId = null;
  if (input.contextResource || input.contextId) {
    if (!input.contextResource || !input.contextId)
      throw Error("Chọn dữ liệu sẽ mở khi bấm thông báo.");
    const { record } = readWorkflowRecord(s, {
      resource: input.contextResource,
      recordId: input.contextId,
    });
    context = { resource: input.contextResource, id: record.id };
    if (context.resource === "ticket") ticketId = context.id;
    if (context.resource === "workorder") {
      workOrderId = context.id;
      ticketId =
        s.links.find((l) => l.workOrderId === workOrderId)?.ticketId || null;
    }
  }
  const notificationIds = recipients.map((userId) => {
    const role = people.find(([, user]) => user.id === userId)[0];
    notify(
      s,
      role,
      input.subject,
      ticketId,
      at,
      node.notificationKind || "info",
      workOrderId,
      { body: input.message, channels: [...node.channels], context },
    );
    return s.notifications[0].id;
  });
  return {
    sentCount: recipients.length,
    recipients,
    subject: input.subject,
    message: input.message,
    channels: [...node.channels],
    notificationIds,
    context,
    status: "recorded",
    ...(node.legacyNotification ? { workOrderId } : {}),
  };
}
function step(s, run, at) {
  if (run.workflow.graphVersion !== 2) return legacyStep(s, run, at);
  // Upgrade only operation representation; preserve graph IDs, edges and completed states.
  const upgraded = toGraph(run.workflow);
  for (const n of upgraded.nodes) {
    const old = run.workflow.nodes.find((x) => x.id === n.id);
    if (
      (old.action !== n.action ||
        (n.type === "notify" &&
          !old.inputs?.recipients &&
          n.inputs?.recipients)) &&
      run.nodeStates?.[n.id]?.status !== "completed"
    )
      delete run.nodeStates?.[n.id]?.inputs;
  }
  run.workflow = upgraded;
  stepGraph(s, run, at, {
    createWorkOrder: (data) => {
      const record = newWorkOrder(
        s,
        data,
        [run.ticketId],
        "workflow",
        at,
        run.id,
      );
      emitRecord(s, "workorder", record, true, at, id);
      return record;
    },
    sendNotification: (input, node) =>
      sendWorkflowNotification(s, input, node, at),
    emitEvent: (name, payload) => emitEvent(s, name, payload, at, id),
    readRecord: (input) => readWorkflowRecord(s, input),
    updateRecord: (input) => updateWorkflowRecord(s, input, run, at),
    notify: (role, title, kind, workOrderId, metadata) =>
      notify(s, role, title, run.ticketId, at, kind, workOrderId, metadata),
    log: (event, entityId) => log(s, event, entityId, "workflow", at),
    cancelTicket: (ticket, actor, reason) =>
      cancelDomain(s, ticket, actor, at, reason, { rejected: true }),
  });
  if (run.nodeStates) maintenanceWaitSummary(run);
}
export function reduceCommand(
  previous,
  command,
  at = new Date().toISOString(),
) {
  const s = copy(previous),
    { type, payload: p = {}, role = "pms" } = command;
  if (!USERS[role]) throw Error("Vai trò không hợp lệ.");
  s.events ||= [];
  s.eventSequence ||= 0;
  const actor = USERS[role].id;
  const pmsOnly = () => {
    if (role !== "pms") throw Error("Thao tác dành cho PMS.");
  };
  if (type === "CREATE_TICKET") {
    if (role === "maintainer") throw Error("Kỹ thuật viên không tạo ticket.");
    if (
      !p.title?.trim() ||
      !p.location?.trim() ||
      !p.area?.trim() ||
      !TYPES.includes(p.type) ||
      !["low", "medium", "high", "urgent"].includes(p.priority)
    )
      throw Error("Điền đầy đủ tên, loại, ưu tiên, khu vực và vị trí.");
    const t = {
      id: id("TK"),
      title: p.title.trim(),
      type: p.type,
      priority: p.priority,
      assignees: [],
      status: "submitted",
      location: p.location,
      customer: USERS.tenant.id,
      area: p.area,
      responsedTime: null,
      processedTime: null,
      approvedBy: null,
      resolvedBy: null,
      cancelledBy: null,
      createdBy: actor,
      updatedBy: actor,
      createdAt: at,
      updatedAt: at,
      groupId: null,
      note: p.note || "",
      evidences: p.evidences || [],
      responseTimeSLA: 60,
      processTimeSLA: 480,
    };
    s.tickets.unshift(t);
    log(s, "ticket.created", t.id, actor, at);
    const wf = s.workflows.find((w) => w.published && w.triggerType === t.type);
    if (wf) {
      const run = {
        id: id("RUN"),
        ticketId: t.id,
        workflow: toGraph(wf),
        cursor: 0,
        status: "running",
        approval: "pending",
        lastWorkOrderId: null,
        waitingWorkOrderId: null,
        createdAt: at,
        eventCursor: s.eventSequence,
        trace: [],
      };
      s.runs.unshift(run);
      step(s, run, at);
    } else notify(s, "pms", `Ticket mới, xử lý thủ công: ${t.title}`, t.id, at);
  } else if (type === "APPROVE" || type === "REJECT") {
    pmsOnly();
    const run = s.runs.find((r) => r.id === p.runId);
    if (run?.workflow.graphVersion === 2) {
      if (type === "REJECT" && !p.reason?.trim())
        throw Error("Vui lòng nhập lý do từ chối.");
      const nodeId = graphApproval(
        run,
        p.nodeId,
        type === "APPROVE" ? "approved" : "rejected",
        p.reason,
        actor,
        at,
      );
      const t = s.tickets.find((t) => t.id === run.ticketId);
      s.notifications
        .filter(
          (n) =>
            n.runId === run.id && n.nodeId === nodeId && n.kind === "approval",
        )
        .forEach((n) => (n.read = true));
      if (type === "APPROVE") {
        if (t.status === "submitted") t.status = "approved";
        t.approvedBy = actor;
      }
      t.responsedTime ||= at;
      t.updatedBy = actor;
      t.updatedAt = at;
      log(
        s,
        `${type === "APPROVE" ? "Phê duyệt" : "Từ chối"} node: ${run.workflow.nodes.find((n) => n.id === nodeId).title}`,
        t.id,
        actor,
        at,
      );
      step(s, run, at);
    } else {
      if (!run || run.status !== "waiting-approval")
        throw Error("Yêu cầu duyệt đã được xử lý.");
      const t = s.tickets.find((t) => t.id === run.ticketId);
      s.notifications
        .filter((n) => n.ticketId === t.id && n.kind === "approval")
        .forEach((n) => (n.read = true));
      if (type === "APPROVE") {
        run.approval = "approved";
        t.status = "approved";
        t.approvedBy = actor;
        t.responsedTime = at;
        log(s, "Phê duyệt ticket", t.id, actor, at);
        step(s, run, at);
      } else {
        if (!p.reason?.trim()) throw Error("Vui lòng nhập lý do từ chối.");
        run.approval = "rejected";
        run.status = "rejected";
        run.reason = p.reason;
        t.status = "cancelled";
        t.cancelledBy = actor;
        t.processedTime = at;
        notify(s, "tenant", `Yêu cầu bị từ chối: ${p.reason}`, t.id, at);
        log(s, `Từ chối: ${p.reason}`, t.id, actor, at);
      }
      t.updatedBy = actor;
      t.updatedAt = at;
    }
  } else if (type === "CANCEL_TICKET") {
    const t = s.tickets.find((t) => t.id === p.ticketId);
    if (
      !t ||
      role === "maintainer" ||
      (role === "tenant" && t.customer !== actor)
    )
      throw Error("Không có quyền hủy ticket.");
    if (["resolved", "cancelled"].includes(t.status))
      throw Error("Ticket đã kết thúc.");
    cancelDomain(s, t, actor, at);
  } else if (type === "WO_STATUS" || type === "WO_CHECK") {
    const wo = s.workOrders.find((w) => w.id === p.workOrderId);
    if (
      !wo ||
      role === "tenant" ||
      (role === "maintainer" && !wo.assignees.includes(actor))
    )
      throw Error("Không có quyền sửa work order.");
    if (type === "WO_CHECK") {
      if (["completed", "closed"].includes(wo.status) || !wo.checklist[p.index])
        throw Error("Checklist không thể chỉnh sửa.");
      wo.checklist[p.index].done = !!p.done;
    } else {
      const allowed = {
        todo: ["in-progress"],
        "in-progress": ["pause", "completed"],
        pause: ["in-progress"],
        completed: ["closed"],
        closed: [],
      };
      if (!allowed[wo.status].includes(p.status))
        throw Error("Chuyển trạng thái không hợp lệ.");
      if (p.status === "completed" && wo.checklist.some((c) => !c.done))
        throw Error("Hoàn tất checklist trước khi hoàn thành.");
      wo.status = p.status;
      if (p.status === "closed") {
        wo.closedAt = at;
        wo.closeReason = "archived";
      }
      if (p.status === "in-progress") {
        wo.responsedTime ||= at;
        s.links
          .filter((l) => l.workOrderId === wo.id)
          .forEach((l) => {
            const t = s.tickets.find((t) => t.id === l.ticketId);
            if (!["cancelled", "resolved"].includes(t.status)) {
              t.status = "inprogress";
              t.responsedTime ||= at;
              t.updatedAt = at;
              t.updatedBy = actor;
            }
          });
      }
      if (p.status === "completed") {
        wo.processedTime = at;
        log(s, "workorder.completed", wo.id, actor, at);
        s.runs
          .filter(
            (r) =>
              [
                "waiting-workorder",
                "waiting-linked-workorders",
                "waiting-approval",
              ].includes(r.status) && r.workflow.graphVersion !== 2,
          )
          .forEach((r) => step(s, r, at));
      } else log(s, `Work order → ${p.status}`, wo.id, actor, at);
    }
    wo.updatedBy = actor;
    wo.updatedAt = at;
  } else if (type === "CREATE_WO") {
    pmsOnly();
    const wo = newWorkOrder(s, p, [...new Set(p.ticketIds || [])], actor, at);
    notify(
      s,
      "maintainer",
      `Công việc mới: ${wo.title}`,
      p.ticketIds[0],
      at,
      "info",
      wo.id,
    );
    [...new Set(p.ticketIds)].forEach((tid) =>
      notify(
        s,
        "tenant",
        `Đã giao công việc: ${wo.title}`,
        tid,
        at,
        "info",
        wo.id,
      ),
    );
  } else if (type === "RESOLVE_MANUAL") {
    pmsOnly();
    const t = s.tickets.find((t) => t.id === p.ticketId);
    if (
      !t ||
      ["cancelled", "resolved"].includes(t.status) ||
      s.runs.some(
        (r) =>
          r.ticketId === t.id &&
          !["cancelled", "rejected", "completed"].includes(r.status),
      )
    )
      throw Error("Ticket đang chạy workflow hoặc đã kết thúc.");
    const links = s.links.filter((l) => l.ticketId === t.id);
    if (
      !links.length ||
      links.some(
        (l) =>
          !["completed", "closed"].includes(
            s.workOrders.find((w) => w.id === l.workOrderId).status,
          ),
      )
    )
      throw Error("Cần hoàn thành các work order liên quan.");
    t.status = "resolved";
    t.resolvedBy = actor;
    t.processedTime = at;
    t.updatedBy = actor;
    t.updatedAt = at;
    notify(s, "tenant", `Yêu cầu đã hoàn tất: ${t.title}`, t.id, at);
    log(s, "Hoàn tất ticket thủ công", t.id, actor, at);
  } else if (type === "GROUP_TICKETS") {
    pmsOnly();
    const ticketIds = [...new Set(p.ticketIds || [])];
    const existingGroup = p.groupId ? s.groups.find((g) => g.id === p.groupId) : null;
    if (p.groupId && !existingGroup) throw Error("Nhóm được chọn không còn tồn tại.");
    if (
      (!existingGroup && !p.name?.trim()) ||
      ticketIds.length < (existingGroup ? 1 : 2) ||
      ticketIds.some((tid) => !s.tickets.some((t) => t.id === tid))
    )
      throw Error(existingGroup ? "Chọn ticket để đưa vào nhóm." : "Chọn ít nhất 2 ticket và nhập tên nhóm.");
    const g = existingGroup || { id: id("GRP"), name: p.name.trim(), createdAt: at };
    if (!existingGroup) s.groups.unshift(g);
    g.updatedBy = actor;
    g.updatedAt = at;
    s.tickets
      .filter((t) => ticketIds.includes(t.id) && t.groupId !== g.id)
      .forEach((t) => {
        t.groupId = g.id;
        t.updatedBy = actor;
        t.updatedAt = at;
        log(s, `Đưa vào nhóm: ${g.name}`, t.id, actor, at);
      });
    log(s, `Gom nhóm: ${g.name}`, g.id, actor, at);
  } else if (type === "UNGROUP_TICKETS") {
    pmsOnly();
    const ticketIds = [...new Set(p.ticketIds || [])];
    if (
      !ticketIds.length ||
      ticketIds.some((tid) => !s.tickets.some((t) => t.id === tid && t.groupId))
    )
      throw Error("Chọn ticket đang thuộc nhóm để đưa ra khỏi nhóm.");
    s.tickets.filter((t) => ticketIds.includes(t.id)).forEach((t) => {
      const groupName = s.groups.find((g) => g.id === t.groupId)?.name || t.groupId;
      t.groupId = null;
      t.updatedBy = actor;
      t.updatedAt = at;
      log(s, `Đưa khỏi nhóm: ${groupName}`, t.id, actor, at);
    });
  } else if (type === "SAVE_TEMPLATE") {
    pmsOnly();
    if (
      !p.name?.trim() ||
      !p.checklist?.length ||
      !p.checklist.every((x) => x.trim()) ||
      !Number.isFinite(p.responseTimeSLA) ||
      p.responseTimeSLA <= 0 ||
      !Number.isFinite(p.processTimeSLA) ||
      p.processTimeSLA <= 0
    )
      throw Error("Nhập tên, checklist và SLA lớn hơn 0.");
    const template = { ...p, id: id("tpl") };
    s.templates.unshift(template);
    log(s, `Tạo template: ${template.name}`, template.id, actor, at);
  } else if (type === "SAVE_WORKFLOW") {
    pmsOnly();
    if (!p.name?.trim() || !TYPES.includes(p.triggerType))
      throw Error("Nhập tên quy trình và chọn loại ticket áp dụng.");
    const old = s.workflows.find((w) => w.id === p.id);
    if (
      p.expectedVersion !== undefined &&
      p.expectedVersion !== (old?.version || 0)
    )
      throw Error(
        "Quy trình đã được cập nhật ở tab khác. Chọn lại quy trình để tải bản mới rồi lưu.",
      );
    if (
      p.expectedDraftRevision !== undefined &&
      p.expectedDraftRevision !== (old?.draft?.draftRevision || 0)
    )
      throw Error(
        "Bản nháp đã được cập nhật ở tab khác. Chọn lại quy trình để tải bản mới rồi lưu.",
      );
    const input = p.business ? compileBusinessWorkflow(p) : p;
    if (p.published) validateWorkflow(input, s.templates);
    const {
      draft: ignoredDraft,
      expectedVersion,
      expectedDraftRevision,
      ...graph
    } = toGraph(input);
    const w = {
      ...graph,
      id: old?.id || p.id || id("wf"),
      version: (old?.version || 0) + 1,
    };
    const conflict =
      w.published &&
      s.workflows.find(
        (x) => x.id !== w.id && x.published && x.triggerType === w.triggerType,
      );
    if (conflict)
      throw Error(
        `Loại ticket này đang dùng quy trình “${conflict.name}”. Chọn quy trình đó để sửa hoặc đổi loại ticket.`,
      );
    // Draft changes never stop the live trigger or change the graph used by new tickets.
    const saved =
      !w.published && old?.published
        ? {
            ...old,
            draft: {
              ...w,
              savedAt: at,
              draftRevision: (old.draft?.draftRevision || 0) + 1,
            },
          }
        : w;
    s.workflows = [saved, ...s.workflows.filter((x) => x.id !== w.id)];
    log(
      s,
      `${w.published ? "Xuất bản" : "Lưu nháp"} quy trình ${w.published ? `v${w.version}` : w.name}`,
      w.id,
      actor,
      at,
    );
  } else if (type === "RETRY_RUN") {
    pmsOnly();
    const run = s.runs.find((r) => r.id === p.runId);
    if (!run || run.status !== "error" || !run.nodeStates)
      throw Error("Chỉ thử lại run graph đang lỗi.");
    for (const state of Object.values(run.nodeStates))
      if (state.status === "error") {
        state.status = "pending";
        delete state.inputs;
      }
    run.status = "running";
    delete run.error;
    delete run.errorNodeId;
    step(s, run, at);
  } else if (type === "EMIT_EVENT") {
    pmsOnly();
    emitEvent(s, p.name, p.payload, at, id);
  } else if (type === "READ_NOTIFICATION") {
    s.notifications
      .filter((n) => n.recipient === actor && (!p.id || n.id === p.id))
      .forEach((n) => (n.read = true));
  } else throw Error("Command không được hỗ trợ.");
  // Domain commands publish generic record events; resume waiting graphs in the same commit.
  for (const [resource, key] of [
    ["ticket", "tickets"],
    ["workorder", "workOrders"],
  ]) {
    for (const record of s[key]) {
      const old = previous[key].find((r) => r.id === record.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(record))
        emitRecord(s, resource, record, !old, at, id);
    }
  }
  // Hydrate older waiting snapshots once, so existing completed records remain observable.
  for (const run of s.runs.filter(
    (r) => r.workflow.graphVersion === 2 && r.eventCursor === undefined,
  )) {
    run.eventCursor = 0;
    for (const record of s.workOrders)
      emitRecord(s, "workorder", record, false, at, id);
  }
  let observedSequence;
  do {
    observedSequence = s.eventSequence;
    for (const run of s.runs.filter(
      (r) =>
        r.workflow.graphVersion === 2 &&
        !["completed", "cancelled", "rejected", "error"].includes(r.status),
    ))
      step(s, run, at);
  } while (observedSequence !== s.eventSequence);
  s.revision++;
  return s;
}
