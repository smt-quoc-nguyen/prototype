// Serializable DAG schema and interpreter. No eval, timers, browser APIs or backend.
import {
  migrateAutomation,
  legacyOutputFields,
  legacyOutput,
} from "./workflow-compat.js";
import {
  normalizeNotification,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
} from "./notification-schema.js";
export const TRIGGER_ID = "trigger";
export const literal = (value) => ({ kind: "literal", value });
export const reference = (scope, path, nodeId) => ({
  kind: "reference",
  scope,
  path,
  ...(nodeId ? { nodeId } : {}),
});
export const OUTPUTS = {
  trigger: [
    "id",
    "title",
    "type",
    "priority",
    "location",
    "area",
    "customer",
    "note",
    "status",
    "responseTimeSLA",
    "processTimeSLA",
  ],
  workorder: [
    "workOrderId",
    "ticketId",
    "title",
    "status",
    "priority",
    "assignees",
    "templateId",
  ],
  approval: ["approved", "approver", "reason", "ticketId"],
  condition: ["result", "left", "right"],
  parallel: ["mode", "branchCount"],
  notify: [
    "sentCount",
    "recipients",
    "subject",
    "message",
    "channels",
    "notificationIds",
    "context",
    "context.resource",
    "context.id",
    "status",
  ],
  automation: [
    "action",
    "value",
    "variable",
    "resource",
    "recordId",
    "record",
    "eventId",
    "eventName",
    "sequence",
    "payload",
  ],
};
export const NODE_LABELS = {
  workorder: "Work order",
  approval: "Approval",
  automation: "Automation",
  condition: "Condition",
  parallel: "Parallel",
  notify: "Notification",
};
export function ports(node) {
  if (node.type === "approval") return ["approved", "rejected"];
  if (node.type === "condition") return ["true", "false"];
  if (node.type === "parallel" && node.mode !== "join")
    return node.branches || ["branch-1", "branch-2"];
  return ["success"];
}
export function ancestors(workflow, nodeId) {
  const found = new Set();
  function visit(id) {
    for (const e of workflow.transitions || [])
      if (e.target === id && !found.has(e.source)) {
        found.add(e.source);
        visit(e.source);
      }
  }
  visit(nodeId);
  found.delete(nodeId);
  return found;
}
export function hasPath(workflow, from, to, seen = new Set()) {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (workflow.transitions || [])
    .filter((e) => e.source === from)
    .some((e) => hasPath(workflow, e.target, to, seen));
}
export function toGraph(workflow) {
  if (workflow.graphVersion === 2) {
    const graph = structuredClone(workflow);
    graph.variables ||= [];
    graph.transitions ||= [];
    graph.nodes = (graph.nodes || []).map((n) => ({
      ...normalizeNotification(migrateAutomation(n)),
      inputs: normalizeNotification(migrateAutomation(n)).inputs || {},
      ...(n.type === "parallel" && n.mode === "split"
        ? { branches: n.branches || ["branch-1", "branch-2"] }
        : {}),
    }));
    return graph;
  }
  const graph = structuredClone(workflow);
  graph.graphVersion = 2;
  graph.trigger = {
    id: TRIGGER_ID,
    event: "ticket.created",
    position: { x: 60, y: 60 },
  };
  graph.variables = graph.variables || [];
  graph.transitions = [];
  let previous = TRIGGER_ID,
    lastWO = null;
  graph.nodes = graph.nodes.map((n, index) => {
    const node = {
      ...n,
      position: n.position || {
        x:
          60 +
          (Math.floor((index + 1) / 3) % 2
            ? 2 - ((index + 1) % 3)
            : (index + 1) % 3) *
            300,
        y: 60 + Math.floor((index + 1) / 3) * 190,
      },
      inputs: { ...(n.inputs || {}) },
    };
    if (n.type === "wait") {
      node.type = "automation";
      node.action = "wait-workorder";
      node.inputs.workOrderId = reference("node", "workOrderId", lastWO);
    }
    if (n.type === "resolve") {
      node.type = "automation";
      node.action = "resolve-ticket";
    }
    if (n.type === "workorder") {
      node.inputs.title = literal(n.title);
      node.inputs.priority = reference("trigger", "priority");
      node.inputs.ticketId = reference("trigger", "id");
      lastWO = n.id;
    }
    if (n.type === "notify" && !n.inputs?.recipients) {
      node.inputs.message = literal(n.title);
      if (lastWO)
        node.inputs.workOrderId = reference("node", "workOrderId", lastWO);
    }
    const prevNode = graph.nodes.find((x) => x.id === previous);
    graph.transitions.push({
      id: `edge-${previous}-${node.id}`,
      source: previous,
      target: node.id,
      sourceHandle: prevNode?.type === "approval" ? "approved" : "success",
    });
    previous = node.id;
    return node;
  });
  graph.nodes = graph.nodes.map((n) =>
    normalizeNotification(migrateAutomation(n)),
  );
  return graph;
}
export function safePath(object, path) {
  if (!path) return structuredClone(object);
  let value = object;
  for (const key of path.split(".")) {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      value == null ||
      !Object.hasOwn(value, key)
    )
      return undefined;
    value = value[key];
  }
  return value;
}
export function bindingLeaves(binding, depth = 0) {
  if (!binding || typeof binding !== "object" || depth > 8)
    throw Error("Thông tin được chèn không hợp lệ.");
  if (["template", "list"].includes(binding.kind)) {
    const items = binding.kind === "template" ? binding.parts : binding.items;
    if (!Array.isArray(items) || items.length > 100)
      throw Error("Nội dung ghép cần tối đa 100 phần.");
    return items.flatMap((item) => bindingLeaves(item, depth + 1));
  }
  return [binding];
}
export function resolveBinding(binding, run) {
  if (!binding || binding.kind === "literal") return binding?.value;
  if (binding.kind === "template")
    return binding.parts
      .map((b) => {
        const value = resolveBinding(b, run);
        return typeof value === "object"
          ? JSON.stringify(value)
          : String(value ?? "");
      })
      .join("");
  if (binding.kind === "list")
    return binding.items.flatMap((b) => resolveBinding(b, run));
  const source =
    binding.scope === "trigger"
      ? run.triggerOutput
      : binding.scope === "variable"
        ? run.variables
        : run.outputs[binding.nodeId];
  const value = safePath(source, binding.path);
  if (value === undefined)
    throw Error(
      `Chưa có output: ${binding.scope === "node" ? binding.nodeId + "." : binding.scope + "."}${binding.path}`,
    );
  return structuredClone(value);
}
function outputFields(node) {
  if (node.type === "notify")
    return [
      ...OUTPUTS.notify,
      ...(node.legacyNotification ? ["workOrderId"] : []),
    ];
  if (node.type !== "automation") return OUTPUTS[node.type] || [];
  const fields =
    {
      "set-variable": ["action", "variable", "value"],
      "wait-event": ["action", "eventId", "eventName", "sequence", "payload"],
      "emit-event": ["action", "eventId", "eventName", "sequence", "payload"],
      "read-record": ["action", "resource", "recordId", "record"],
      "update-record": ["action", "resource", "recordId", "record", "value"],
      log: ["action", "value"],
    }[node.action] || [];
  const root = ["wait-event", "emit-event"].includes(node.action)
    ? "payload"
    : "record";
  return [
    ...fields,
    ...(node.outputPaths || []).map((path) => `${root}.${path}`),
    ...legacyOutputFields(node),
  ];
}
export { outputFields };
export function validateGraph(w, { templates, types, users }) {
  if (!w.name?.trim() || !types.includes(w.triggerType))
    throw Error("Tên và loại trigger không hợp lệ.");
  if (
    !Number.isFinite(w.trigger?.position?.x) ||
    !Number.isFinite(w.trigger?.position?.y) ||
    w.nodes?.some(
      (n) => !Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y),
    )
  )
    throw Error("Vị trí node không hợp lệ.");
  if (w.trigger?.event !== "ticket.created" || w.trigger?.id !== TRIGGER_ID)
    throw Error("Trigger cần là ticket.created.");
  if (!w.nodes?.length || w.nodes.length > 80)
    throw Error("Workflow cần từ 1 đến 80 node.");
  const ids = [TRIGGER_ID, ...w.nodes.map((n) => n.id)];
  if (new Set(ids).size !== ids.length) throw Error("ID node phải duy nhất.");
  const edges = w.transitions || [];
  if (new Set(edges.map((e) => e.id)).size !== edges.length)
    throw Error("ID transition phải duy nhất.");
  if (
    new Set(edges.map((e) => `${e.source}:${e.sourceHandle}:${e.target}`))
      .size !== edges.length
  )
    throw Error("Transition bị trùng.");
  for (const e of edges) {
    if (
      !ids.includes(e.source) ||
      !ids.includes(e.target) ||
      e.target === TRIGGER_ID
    )
      throw Error("Transition nối tới node không tồn tại.");
    const source =
      e.source === TRIGGER_ID
        ? { type: "trigger" }
        : w.nodes.find((n) => n.id === e.source);
    if (!ports(source).includes(e.sourceHandle))
      throw Error("Cổng output của transition không hợp lệ.");
    if (e.source === e.target || hasPath(w, e.target, e.source))
      throw Error("Workflow không hỗ trợ vòng lặp.");
  }
  if (edges.filter((e) => e.source === TRIGGER_ID).length !== 1)
    throw Error("Trigger cần một transition đi ra.");
  const variables = w.variables || [];
  if (new Set(variables.map((v) => v.name)).size !== variables.length)
    throw Error("Tên biến bị trùng.");
  for (const v of variables) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(v.name) ||
      ["constructor", "prototype", "__proto__"].includes(v.name)
    )
      throw Error(
        "Tên biến cần bắt đầu bằng chữ và chỉ gồm chữ, số, dấu gạch dưới.",
      );
    if (
      !["string", "number", "boolean", "object"].includes(v.type) ||
      (v.type === "object"
        ? v.value === null || typeof v.value !== "object"
        : typeof v.value !== v.type) ||
      (v.type === "number" && !Number.isFinite(v.value))
    )
      throw Error(`Giá trị biến ${v.name} không khớp kiểu ${v.type}.`);
  }
  for (const n of w.nodes) {
    if (!n.title?.trim() || !NODE_LABELS[n.type])
      throw Error("Tên hoặc loại node không hợp lệ.");
    if (!hasPath(w, TRIGGER_ID, n.id))
      throw Error(`Node ${n.title} chưa được nối từ Trigger.`);
    const outgoing = edges.filter((e) => e.source === n.id),
      incoming = edges.filter((e) => e.target === n.id);
    for (const port of ports(n))
      if (outgoing.filter((e) => e.sourceHandle === port).length > 1)
        throw Error(
          `Cổng ${port} chỉ nối một transition; dùng Parallel để tách nhánh.`,
        );
    if (
      n.type === "condition" &&
      !["true", "false"].every((p) =>
        outgoing.some((e) => e.sourceHandle === p),
      )
    )
      throw Error("Condition cần đủ nhánh True và False.");
    if (
      n.type === "condition" &&
      !["equals", "not-equals", ">", ">=", "<", "<=", "contains"].includes(
        n.operator,
      )
    )
      throw Error("Phép so sánh không hợp lệ.");
    if (
      n.type === "approval" &&
      !outgoing.some((e) => e.sourceHandle === "approved")
    )
      throw Error("Approval cần nhánh Approved.");
    if (n.type === "parallel") {
      if (!["split", "join"].includes(n.mode))
        throw Error("Parallel cần chọn Split hoặc Join.");
      if (
        n.mode === "split" &&
        (ports(n).length < 2 ||
          ports(n).length > 6 ||
          new Set(ports(n)).size !== ports(n).length ||
          ports(n).some((p) => !/^[a-zA-Z0-9_-]+$/.test(p)) ||
          ports(n).some((p) => !outgoing.some((e) => e.sourceHandle === p)))
      )
        throw Error(
          "Parallel Split cần 2–6 cổng duy nhất, mỗi cổng nối một nhánh.",
        );
      if (n.mode === "join" && incoming.length < 2)
        throw Error("Parallel Join cần ít nhất hai nhánh vào.");
    }
    if (
      n.type === "workorder" &&
      ((n.templateId && !templates.some((t) => t.id === n.templateId)) ||
        n.assignee !== users.maintainer.id)
    )
      throw Error("Template hoặc kỹ thuật viên không hợp lệ.");
    if (
      n.type === "notify" &&
      (!n.channels?.length ||
        n.channels.some(
          (c) => !NOTIFICATION_CHANNELS.some((channel) => channel.id === c),
        ) ||
        !NOTIFICATION_KINDS[n.notificationKind || "info"])
    )
      throw Error(`Bước ${n.title}: chọn ít nhất một kênh thông báo hợp lệ.`);
    if (n.type === "notify") {
      for (const key of ["subject", "message", "recipients"]) {
        const binding = n.inputs?.[key];
        if (!binding) continue;
        if (bindingLeaves(binding).every((b) => b.kind === "literal")) {
          const value = resolveBinding(binding, {});
          if (key === "recipients") {
            const ids = Array.isArray(value) ? value : [value];
            if (
              !ids.length ||
              ids.some(
                (userId) =>
                  !Object.values(users).some((user) => user.id === userId),
              )
            )
              throw Error(
                `Bước ${n.title}: chọn ít nhất một người nhận hợp lệ.`,
              );
          } else if (typeof value !== "string" || !value.trim())
            throw Error(
              `Bước ${n.title}: điền ${key === "subject" ? "tiêu đề" : "nội dung"} thông báo.`,
            );
        }
      }
    }
    if (
      n.type === "automation" &&
      ![
        "wait-event",
        "emit-event",
        "read-record",
        "update-record",
        "set-variable",
        "log",
      ].includes(n.action)
    )
      throw Error("Automation operation không hợp lệ.");
    if (
      (n.outputPaths || []).some(
        (path) =>
          !/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(path) ||
          path
            .split(".")
            .some((k) => ["__proto__", "constructor", "prototype"].includes(k)),
      )
    )
      throw Error("Output path không hợp lệ.");
    if (n.action === "wait-event") {
      if (
        new Set((n.filters || []).map((f) => f.id)).size !==
        (n.filters || []).length
      )
        throw Error("ID filter phải duy nhất.");
      for (const filter of n.filters || []) {
        if (
          !filter.id ||
          !/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(filter.path) ||
          ![
            "equals",
            "not-equals",
            ">",
            ">=",
            "<",
            "<=",
            "contains",
            "one-of",
          ].includes(filter.operator)
        )
          throw Error("Event filter không hợp lệ.");
      }
    }
    if (
      n.action === "set-variable" &&
      !variables.some((v) => v.name === n.variableName)
    )
      throw Error("Automation cần chọn biến đã khai báo.");
    const required =
      n.type === "condition"
        ? ["left", "right"]
        : n.type === "workorder"
          ? ["title", "ticketId", "priority"]
          : n.type === "notify"
            ? ["recipients", "subject", "message"]
            : n.action === "wait-event"
              ? ["eventName", ...(n.filters || []).map((f) => `filter_${f.id}`)]
              : n.action === "emit-event"
                ? ["eventName", "payload"]
                : n.action === "read-record"
                  ? ["resource", "recordId"]
                  : n.action === "update-record"
                    ? ["resource", "recordId", "field", "value"]
                    : ["set-variable", "log"].includes(n.action)
                      ? ["value"]
                      : [];
    for (const key of required)
      if (
        !n.inputs?.[key] ||
        (n.inputs[key].kind === "literal" &&
          (n.inputs[key].value === undefined || n.inputs[key].value === "") &&
          key !== "value")
      )
        throw Error(`Node ${n.title}: thiếu input ${key}.`);
    for (const binding of Object.values(n.inputs || {}).flatMap(
      bindingLeaves,
    )) {
      if (binding.kind === "literal") continue;
      if (
        binding.kind !== "reference" ||
        !["trigger", "node", "variable"].includes(binding.scope)
      )
        throw Error("Input binding không hợp lệ.");
      if (
        binding.scope === "trigger" &&
        !OUTPUTS.trigger.includes(binding.path)
      )
        throw Error("Trigger output không tồn tại.");
      if (
        binding.scope === "variable" &&
        !variables.some((v) => v.name === binding.path)
      )
        throw Error("Biến input không tồn tại.");
      if (binding.scope === "node") {
        const source = w.nodes.find((x) => x.id === binding.nodeId);
        if (!source || !ancestors(w, n.id).has(source.id))
          throw Error(
            `Input ${n.title} chỉ được tham chiếu output của node phía trước.`,
          );
        if (!outputFields(source).includes(binding.path))
          throw Error(
            `Output ${binding.path} không tồn tại ở ${source.title}.`,
          );
      }
    }
    // A mutable variable must have ordered writers/readers. Parallel branches cannot race.
    if (n.action === "set-variable") {
      for (const other of w.nodes.filter((x) => x.id !== n.id)) {
        const accesses =
          (other.action === "set-variable" &&
            other.variableName === n.variableName) ||
          Object.values(other.inputs || {})
            .flatMap(bindingLeaves)
            .some(
              (b) =>
                b.kind === "reference" &&
                b.scope === "variable" &&
                b.path === n.variableName,
            );
        if (
          accesses &&
          !hasPath(w, n.id, other.id) &&
          !hasPath(w, other.id, n.id)
        )
          throw Error(
            `Biến ${n.variableName} được đọc/ghi giữa các nhánh song song; hãy hợp nhánh trước.`,
          );
      }
    }
  }
}
export function initializeGraphRun(run, ticket) {
  run.cursor = 0;
  run.triggerOutput = structuredClone(ticket);
  run.variables = Object.fromEntries(
    (run.workflow.variables || []).map((v) => [
      v.name,
      structuredClone(v.value),
    ]),
  );
  run.outputs = { [TRIGGER_ID]: structuredClone(ticket) };
  run.nodeStates = Object.fromEntries(
    run.workflow.nodes.map((n) => [n.id, { status: "pending" }]),
  );
  run.edgeStates = Object.fromEntries(
    run.workflow.transitions.map((e) => [
      e.id,
      e.source === TRIGGER_ID ? "fired" : "pending",
    ]),
  );
  run.approvals = {};
}
export function graphApproval(run, nodeId, decision, reason, actor, at) {
  const pending = Object.entries(run.approvals).filter(
    ([, a]) => a.status === "pending",
  );
  const target = nodeId || (pending.length === 1 ? pending[0][0] : null);
  if (
    !target ||
    run.approvals[target]?.status !== "pending" ||
    ["cancelled", "rejected", "completed", "error"].includes(run.status)
  )
    throw Error("Yêu cầu duyệt đã được xử lý hoặc cần chọn đúng node.");
  run.approvals[target] = { status: decision, reason: reason || "", actor, at };
  run.approval = decision;
  return target;
}
function compare(left, operator, right) {
  if (operator === "one-of") {
    if (!Array.isArray(right)) throw Error("One-of cần một mảng giá trị.");
    return right.includes(left);
  }
  if (operator === "equals") return left === right;
  if (operator === "not-equals") return left !== right;
  if (operator === "contains") {
    if (typeof left !== "string" && !Array.isArray(left))
      throw Error("Contains cần chuỗi hoặc mảng.");
    return left.includes(right);
  }
  if (
    typeof left !== "number" ||
    typeof right !== "number" ||
    !Number.isFinite(left) ||
    !Number.isFinite(right)
  )
    throw Error("So sánh >, >=, <, <= cần hai số.");
  return {
    ">": left > right,
    ">=": left >= right,
    "<": left < right,
    "<=": left <= right,
  }[operator];
}
export function stepGraph(s, run, at, hooks) {
  const ticket = s.tickets.find((t) => t.id === run.ticketId);
  if (
    ticket.status === "cancelled" ||
    ["cancelled", "rejected", "completed", "error"].includes(run.status)
  )
    return;
  if (!run.nodeStates) initializeGraphRun(run, ticket);
  const nodes = run.workflow.nodes,
    edges = run.workflow.transitions;
  const ordered = nodes;
  const record = (node, status, extra = {}) => {
    run.trace.push({
      nodeId: node.id,
      title: node.title,
      status,
      at,
      ...extra,
    });
  };
  const finish = (node, status, output, chosenPorts) => {
    run.nodeStates[node.id] = {
      ...run.nodeStates[node.id],
      status,
      completedAt: at,
    };
    if (output) run.outputs[node.id] = legacyOutput(node, output);
    for (const e of edges.filter((e) => e.source === node.id))
      run.edgeStates[e.id] =
        status === "skipped" || !chosenPorts.includes(e.sourceHandle)
          ? "skipped"
          : "fired";
    record(node, status, { output });
    if (status === "completed") run.cursor++;
  };
  let progress = true;
  while (progress) {
    progress = false;
    for (const node of ordered) {
      const ns = run.nodeStates[node.id];
      if (["completed", "skipped", "error"].includes(ns.status)) continue;
      const incoming = edges.filter((e) => e.target === node.id);
      if (incoming.some((e) => run.edgeStates[e.id] === "pending")) continue;
      if (!incoming.some((e) => run.edgeStates[e.id] === "fired")) {
        finish(node, "skipped", null, []);
        progress = true;
        continue;
      }
      try {
        // Inputs freeze on first activation. Subsequent events do not re-read changed variables.
        ns.inputs ||= Object.fromEntries(
          Object.entries(node.inputs || {}).map(([key, binding]) => [
            key,
            resolveBinding(binding, run),
          ]),
        );
        const input = ns.inputs;
        let output = {},
          activePorts = ports(node);
        if (node.type === "approval") {
          if (!run.approvals[node.id]) {
            run.approvals[node.id] = { status: "pending" };
            hooks.notify(
              "pms",
              `Cần phê duyệt: ${ticket.title} · ${node.title}`,
              "approval",
              null,
              { runId: run.id, nodeId: node.id },
            );
          }
          const a = run.approvals[node.id];
          if (a.status === "pending") {
            if (ns.status !== "waiting") record(node, "waiting");
            ns.status = "waiting";
            continue;
          }
          output = {
            approved: a.status === "approved",
            approver: a.actor,
            reason: a.reason,
            ticketId: ticket.id,
          };
          activePorts = [a.status];
          if (
            a.status === "rejected" &&
            !edges.some(
              (e) => e.source === node.id && e.sourceHandle === "rejected",
            )
          ) {
            finish(node, "completed", output, activePorts);
            hooks.cancelTicket(ticket, a.actor, a.reason);
            run.status = "rejected";
            run.reason = a.reason;
            return;
          }
        } else if (node.type === "workorder") {
          if (input.ticketId !== ticket.id)
            throw Error("Work order của run cần liên kết ticket từ Trigger.");
          if (
            typeof input.title !== "string" ||
            !input.title.trim() ||
            (input.note !== undefined && typeof input.note !== "string") ||
            !["low", "medium", "high", "urgent"].includes(input.priority)
          )
            throw Error("Tên / priority của work order không hợp lệ.");
          const wo = hooks.createWorkOrder({
            ...node,
            title: input.title,
            priority: input.priority,
            note: input.note || "",
          });
          output = {
            workOrderId: wo.id,
            ticketId: ticket.id,
            title: wo.title,
            status: wo.status,
            priority: wo.priority,
            assignees: wo.assignees,
            templateId: wo.templateId,
          };
          run.lastWorkOrderId = wo.id;
        } else if (node.type === "condition") {
          output = {
            result: compare(input.left, node.operator, input.right),
            left: input.left,
            right: input.right,
          };
          activePorts = [String(output.result)];
        } else if (node.type === "parallel")
          output = {
            mode: node.mode,
            branchCount:
              node.mode === "join"
                ? incoming.filter((e) => run.edgeStates[e.id] === "fired")
                    .length
                : ports(node).length,
          };
        else if (node.type === "notify") {
          output = hooks.sendNotification(input, node);
        } else if (node.type === "automation") {
          output = { action: node.action };
          if (node.action === "wait-event") {
            if (typeof input.eventName !== "string" || !input.eventName.trim())
              throw Error("Tên sự kiện không hợp lệ.");
            if (node.sinceActivation && ns.eventSequence === undefined)
              ns.eventSequence = s.eventSequence || 0;
            if (node.statusWait) {
              const { record: current } = hooks.readRecord({
                resource: input.filter_resource,
                recordId: input.filter_id,
              });
              const reachable =
                input.filter_resource === "workorder"
                  ? {
                      todo: [
                        "todo",
                        "in-progress",
                        "pause",
                        "completed",
                        "closed",
                      ],
                      "in-progress": [
                        "in-progress",
                        "pause",
                        "completed",
                        "closed",
                      ],
                      pause: ["pause", "in-progress", "completed", "closed"],
                      completed: ["completed", "closed"],
                      closed: ["closed"],
                    }
                  : {
                      submitted: ["submitted", "approved", "inprogress"],
                      approved: ["approved", "inprogress"],
                      inprogress: ["inprogress"],
                    };
              if (!reachable[current.status]?.includes(input.filter_status))
                throw Error(
                  "Dữ liệu đã chuyển qua trạng thái cần chờ và không thể quay lại. Hãy kiểm tra lại bước điều kiện.",
                );
            }
            const event = (s.events || []).find(
              (e) =>
                e.sequence >
                  (node.sinceActivation
                    ? ns.eventSequence
                    : run.eventCursor || 0) &&
                e.name === input.eventName &&
                (node.filters || []).every((f) => {
                  const value = safePath(e.payload, f.path);
                  return (
                    value !== undefined &&
                    compare(value, f.operator, input[`filter_${f.id}`])
                  );
                }),
            );
            if (!event) {
              if (ns.status !== "waiting")
                record(node, "waiting", { eventName: input.eventName });
              ns.status = "waiting";
              ns.eventName = input.eventName;
              continue;
            }
            output = {
              ...output,
              eventId: event.id,
              eventName: event.name,
              sequence: event.sequence,
              payload: structuredClone(event.payload),
            };
          } else if (node.action === "emit-event") {
            const event = hooks.emitEvent(input.eventName, input.payload);
            output = {
              ...output,
              eventId: event.id,
              eventName: event.name,
              sequence: event.sequence,
              payload: structuredClone(event.payload),
            };
          } else if (["read-record", "update-record"].includes(node.action)) {
            const result =
              node.action === "read-record"
                ? hooks.readRecord(input)
                : hooks.updateRecord(input);
            if (result.waiting) {
              ns.status = "waiting";
              ns.resource = input.resource;
              ns.recordId = input.recordId;
              continue;
            }
            output = {
              ...output,
              resource: input.resource,
              recordId: input.recordId,
              record: structuredClone(result.record),
              value: input.value,
            };
            if (result.stopRun) {
              finish(node, "completed", output, []);
              run.status = "cancelled";
              return;
            }
          } else if (node.action === "set-variable") {
            const variable = run.workflow.variables.find(
              (v) => v.name === node.variableName,
            );
            if (
              !variable ||
              (variable.type === "object"
                ? !input.value || typeof input.value !== "object"
                : typeof input.value !== variable.type)
            )
              throw Error("Giá trị không khớp kiểu biến.");
            run.variables[node.variableName] = structuredClone(input.value);
            output = {
              ...output,
              variable: node.variableName,
              value: input.value,
            };
          } else if (node.action === "log") {
            hooks.log(String(input.value), ticket.id);
            output.value = input.value;
          }
        }
        finish(node, "completed", output, activePorts);
        progress = true;
      } catch (error) {
        ns.status = "error";
        run.status = "error";
        run.error = error.message;
        run.errorNodeId = node.id;
        record(node, "error", { error: error.message });
        return;
      }
    }
  }
  run.cursor = Object.values(run.nodeStates).filter(
    (n) => n.status === "completed",
  ).length;
  if (
    Object.values(run.nodeStates).every((n) =>
      ["completed", "skipped"].includes(n.status),
    )
  ) {
    run.status = "completed";
    run.completedAt = at;
  } else if (Object.values(run.approvals).some((a) => a.status === "pending"))
    run.status = "waiting-approval";
  else if (
    nodes.some(
      (n) =>
        n.action === "wait-event" && run.nodeStates[n.id].status === "waiting",
    )
  )
    run.status = "waiting-event";
  else if (
    Object.values(run.nodeStates).some(
      (n) => n.status === "waiting" && n.resource,
    )
  )
    run.status = "waiting-data";
  else {
    run.status = "error";
    run.error = "Graph không thể tiếp tục; kiểm tra transitions và các input.";
  }
}
