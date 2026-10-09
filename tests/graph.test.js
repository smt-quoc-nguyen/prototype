import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  initialState,
  reduceCommand,
  validateWorkflow,
  defaultWorkflow,
} from "../src/engine.js";
import { literal as L, reference as R, toGraph } from "../src/graph.js";
globalThis.crypto ||= webcrypto;
const input = {
  title: "Graph ticket",
  type: "Equipment malfunction",
  priority: "high",
  area: "Office building",
  location: "VP-03",
};
const node = (id, type, extra = {}) => ({
  id,
  type,
  title: id,
  position: { x: 0, y: 0 },
  inputs: {},
  ...extra,
});
const edge = (source, target, sourceHandle = "success") => ({
  id: `${source}-${target}-${sourceHandle}`,
  source,
  target,
  sourceHandle,
});
const wo = (id) =>
  node(id, "workorder", {
    assignee: "tech-01",
    templateId: "",
    inputs: {
      title: L(id),
      ticketId: R("trigger", "id"),
      priority: R("trigger", "priority"),
    },
  });
const wait = (id, source) =>
  node(id, "automation", {
    action: "wait-event",
    filters: [
      { id: "resource", path: "resource", operator: "equals" },
      { id: "id", path: "recordId", operator: "equals" },
      { id: "status", path: "record.status", operator: "equals" },
    ],
    inputs: {
      eventName: L("record.updated"),
      filter_resource: L("workorder"),
      filter_id: R("node", "workOrderId", source),
      filter_status: L("completed"),
    },
  });
const notice = (id, message = L(id)) =>
  node(id, "notify", { recipients: ["pms"], inputs: { message } });
const make = (nodes, transitions, variables = []) => ({
  graphVersion: 2,
  id: "wf-ac",
  name: "Graph test",
  triggerType: input.type,
  version: 1,
  published: true,
  trigger: { id: "trigger", event: "ticket.created", position: { x: 0, y: 0 } },
  nodes,
  transitions,
  variables,
});
function start(workflow, payload = input) {
  const s = initialState();
  validateWorkflow(workflow, s.templates);
  s.workflows = [workflow];
  return reduceCommand(s, { type: "CREATE_TICKET", role: "tenant", payload });
}
function cmd(s, type, payload, role = "pms") {
  return reduceCommand(s, { type, role, payload });
}
function complete(s, id) {
  s = cmd(
    s,
    "WO_STATUS",
    { workOrderId: id, status: "in-progress" },
    "maintainer",
  );
  return cmd(
    s,
    "WO_STATUS",
    { workOrderId: id, status: "completed" },
    "maintainer",
  );
}
test("Condition uses trigger output: executes exactly one branch, propagates skip and joins", () => {
  const w = make(
    [
      node("condition", "condition", {
        operator: "equals",
        inputs: { left: R("trigger", "priority"), right: L("high") },
      }),
      notice("high"),
      notice("low"),
      node("join", "parallel", { mode: "join" }),
      notice("final"),
    ],
    [
      edge("trigger", "condition"),
      edge("condition", "high", "true"),
      edge("condition", "low", "false"),
      edge("high", "join"),
      edge("low", "join"),
      edge("join", "final"),
    ],
  );
  const s = start(w);
  const r = s.runs[0];
  assert.equal(r.status, "completed");
  assert.equal(r.outputs.condition.result, true);
  assert.equal(r.nodeStates.low.status, "skipped");
  assert.equal(r.outputs.join.branchCount, 1);
  assert.equal(s.notifications.length, 2);
  const low = start(w, { ...input, priority: "low" });
  assert.equal(low.runs[0].nodeStates.high.status, "skipped");
  assert.equal(low.runs[0].outputs.condition.result, false);
});
test("Parallel split creates two independent work orders; join waits for both exact outputs", () => {
  const w = make(
    [
      node("split", "parallel", { mode: "split", branches: ["a", "b"] }),
      wo("a"),
      wo("b"),
      wait("waitA", "a"),
      wait("waitB", "b"),
      node("join", "parallel", { mode: "join" }),
      node("resolve", "automation", {
        action: "update-record",
        inputs: {
          resource: L("ticket"),
          recordId: R("trigger", "id"),
          field: L("status"),
          value: L("resolved"),
        },
      }),
    ],
    [
      edge("trigger", "split"),
      edge("split", "a", "a"),
      edge("split", "b", "b"),
      edge("a", "waitA"),
      edge("b", "waitB"),
      edge("waitA", "join"),
      edge("waitB", "join"),
      edge("join", "resolve"),
    ],
  );
  let s = start(w),
    r = s.runs[0];
  assert.equal(s.workOrders.length, 2);
  assert.equal(r.waitingWorkOrderIds.length, 2);
  const a = r.outputs.a.workOrderId,
    b = r.outputs.b.workOrderId;
  s = complete(s, a);
  assert.equal(s.runs[0].nodeStates.join.status, "pending");
  assert.notEqual(s.tickets[0].status, "resolved");
  s = complete(s, b);
  assert.equal(s.runs[0].status, "completed");
  assert.equal(s.tickets[0].status, "resolved");
  assert.equal(s.runs[0].outputs.join.branchCount, 2);
  assert.equal(s.workOrders.length, 2);
});
test("Node output becomes next node input and variable assignment changes downstream values", () => {
  const w = make(
    [
      node("assign", "automation", {
        action: "set-variable",
        variableName: "message",
        inputs: { value: R("trigger", "title") },
      }),
      notice("notify", R("variable", "message")),
      node("note", "automation", {
        action: "update-record",
        inputs: {
          resource: L("ticket"),
          recordId: R("trigger", "id"),
          field: L("note"),
          value: R("node", "message", "notify"),
        },
      }),
    ],
    [
      edge("trigger", "assign"),
      edge("assign", "notify"),
      edge("notify", "note"),
    ],
    [{ name: "message", type: "string", value: "Initial" }],
  );
  const s = start(w),
    r = s.runs[0];
  assert.equal(r.variables.message, input.title);
  assert.equal(r.outputs.notify.message, input.title);
  assert.equal(r.nodeStates.note.inputs.value, input.title);
  assert.equal(s.tickets[0].note, input.title);
  assert.equal(r.triggerOutput.note, "");
});
test("Approved and Rejected transitions are actual branches, not visual labels", () => {
  const w = make(
    [
      node("approve", "approval"),
      notice("yes"),
      notice("no"),
      node("join", "parallel", { mode: "join" }),
      notice("final"),
    ],
    [
      edge("trigger", "approve"),
      edge("approve", "yes", "approved"),
      edge("approve", "no", "rejected"),
      edge("yes", "join"),
      edge("no", "join"),
      edge("join", "final"),
    ],
  );
  let s = start(w);
  s = cmd(s, "REJECT", {
    runId: s.runs[0].id,
    nodeId: "approve",
    reason: "Not approved",
  });
  assert.equal(s.runs[0].outputs.approve.approved, false);
  assert.equal(s.runs[0].nodeStates.yes.status, "skipped");
  assert.equal(s.runs[0].nodeStates.no.status, "completed");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(s.tickets[0].status, "submitted");
});
test("Parallel human approvals require explicit node; work order completion proceeds with another approval pending", () => {
  const w = make(
    [
      node("split", "parallel", { mode: "split", branches: ["a", "b"] }),
      node("approveA", "approval"),
      node("approveB", "approval"),
      wo("work"),
      wait("wait", "work"),
      notice("approvedB"),
      node("join", "parallel", { mode: "join" }),
      notice("final"),
    ],
    [
      edge("trigger", "split"),
      edge("split", "approveA", "a"),
      edge("split", "approveB", "b"),
      edge("approveA", "work", "approved"),
      edge("work", "wait"),
      edge("wait", "join"),
      edge("approveB", "approvedB", "approved"),
      edge("approvedB", "join"),
      edge("join", "final"),
    ],
  );
  let s = start(w);
  assert.throws(
    () => cmd(s, "APPROVE", { runId: s.runs[0].id }),
    /chọn đúng node/,
  );
  s = cmd(s, "APPROVE", { runId: s.runs[0].id, nodeId: "approveA" });
  s = complete(s, s.workOrders[0].id);
  assert.equal(s.runs[0].nodeStates.wait.status, "completed");
  assert.equal(s.runs[0].status, "waiting-approval");
  s = cmd(s, "APPROVE", { runId: s.runs[0].id, nodeId: "approveB" });
  assert.equal(s.runs[0].status, "completed");
});
test("Graph validation catches cycles, unreachable nodes, broken handles and non-upstream references", () => {
  const s = initialState(),
    w = make(
      [notice("a"), notice("b")],
      [edge("trigger", "a"), edge("a", "b")],
    );
  validateWorkflow(w, s.templates);
  assert.throws(
    () =>
      validateWorkflow(
        { ...w, transitions: [...w.transitions, edge("b", "a")] },
        s.templates,
      ),
    /vòng lặp/,
  );
  assert.throws(
    () =>
      validateWorkflow(
        { ...w, transitions: [edge("trigger", "a")] },
        s.templates,
      ),
    /chưa được nối/,
  );
  assert.throws(
    () =>
      validateWorkflow(
        {
          ...w,
          transitions: [edge("trigger", "a", "invalid"), edge("a", "b")],
        },
        s.templates,
      ),
    /Cổng output/,
  );
  w.nodes[0].inputs.message = R("node", "message", "b");
  assert.throws(() => validateWorkflow(w, s.templates), /phía trước/);
});
test("Runtime missing skipped branch output persists node error; retry does not replay completed work", () => {
  const w = make(
    [
      wo("work"),
      node("condition", "condition", {
        operator: "equals",
        inputs: { left: L(false), right: L(true) },
      }),
      notice("trueBranch"),
      notice("falseBranch"),
      node("join", "parallel", { mode: "join" }),
      notice("after", R("node", "message", "trueBranch")),
    ],
    [
      edge("trigger", "work"),
      edge("work", "condition"),
      edge("condition", "trueBranch", "true"),
      edge("condition", "falseBranch", "false"),
      edge("trueBranch", "join"),
      edge("falseBranch", "join"),
      edge("join", "after"),
    ],
  );
  let s = start(w);
  assert.equal(s.runs[0].status, "error");
  assert.match(s.runs[0].error, /Chưa có output/);
  assert.equal(s.workOrders.length, 1);
  s = cmd(s, "RETRY_RUN", { runId: s.runs[0].id });
  assert.equal(s.runs[0].status, "error");
  assert.equal(s.workOrders.length, 1);
});
test("Parallel variable races are rejected; numeric comparisons are typed and deterministic", () => {
  const w = make(
    [
      node("split", "parallel", { mode: "split", branches: ["a", "b"] }),
      node("set", "automation", {
        action: "set-variable",
        variableName: "message",
        inputs: { value: L("changed") },
      }),
      notice("read", R("variable", "message")),
    ],
    [
      edge("trigger", "split"),
      edge("split", "set", "a"),
      edge("split", "read", "b"),
    ],
    [{ name: "message", type: "string", value: "initial" }],
  );
  assert.throws(
    () => validateWorkflow(w, initialState().templates),
    /song song/,
  );
  const condition = make(
    [
      node("c", "condition", {
        operator: ">=",
        inputs: { left: R("trigger", "responseTimeSLA"), right: L(30) },
      }),
      notice("yes"),
      notice("no"),
    ],
    [edge("trigger", "c"), edge("c", "yes", "true"), edge("c", "no", "false")],
  );
  assert.equal(start(condition).runs[0].outputs.c.result, true);
});
test("Sequential legacy workflow migration creates explicit transitions and exact wait bindings", () => {
  const w = defaultWorkflow();
  const legacy = {
    ...w,
    graphVersion: undefined,
    nodes: w.nodes.map((n) =>
      n.id.startsWith("wait-")
        ? { ...n, type: "wait" }
        : n.id === "resolve"
          ? { ...n, type: "resolve" }
          : n,
    ),
  };
  const migrated = toGraph(legacy);
  assert.equal(migrated.graphVersion, 2);
  assert.equal(migrated.transitions.length, migrated.nodes.length);
  assert.equal(
    migrated.nodes.find((n) => n.id === "wait-inspect").inputs.filter_id.nodeId,
    "inspect",
  );
  validateWorkflow(migrated, initialState().templates);
});

test("Generic event wait filters payload, persists across reload, and maps nested output downstream", () => {
  const w = make(
    [
      node("wait", "automation", {
        action: "wait-event",
        filters: [{ id: "correlation", path: "data.key", operator: "equals" }],
        outputPaths: ["data.result"],
        inputs: {
          eventName: L("external.received"),
          filter_correlation: R("trigger", "id"),
        },
      }),
      node("log", "automation", {
        action: "log",
        inputs: { value: R("node", "payload.data.result", "wait") },
      }),
    ],
    [edge("trigger", "wait"), edge("wait", "log")],
  );
  let s = start(w);
  assert.equal(s.runs[0].status, "waiting-event");
  const tid = s.tickets[0].id;
  s = cmd(s, "EMIT_EVENT", {
    name: "external.received",
    payload: { data: { key: "unrelated", result: "wrong" } },
  });
  s = cmd(s, "EMIT_EVENT", {
    name: "external.received",
    payload: { unexpected: true },
  });
  assert.equal(s.runs[0].status, "waiting-event");
  s = JSON.parse(JSON.stringify(s)); // persisted JSON roundtrip
  s = cmd(s, "EMIT_EVENT", {
    name: "external.received",
    payload: { data: { key: tid, result: "received" } },
  });
  assert.equal(s.runs[0].status, "completed");
  assert.equal(s.runs[0].outputs.log.value, "received");
  const count = s.audit.length;
  s = cmd(s, "EMIT_EVENT", {
    name: "external.received",
    payload: { data: { key: tid, result: "duplicate" } },
  });
  assert.equal(s.audit.length, count);
});

test("Emit event and wait event work in parallel regardless of node order and ignore events before run", () => {
  const w = make(
    [
      node("split", "parallel", { mode: "split", branches: ["a", "b"] }),
      node("wait", "automation", {
        action: "wait-event",
        inputs: { eventName: L("custom.ready") },
      }),
      node("emit", "automation", {
        action: "emit-event",
        inputs: { eventName: L("custom.ready"), payload: L({ value: 42 }) },
      }),
      node("join", "parallel", { mode: "join" }),
    ],
    [
      edge("trigger", "split"),
      edge("split", "wait", "a"),
      edge("split", "emit", "b"),
      edge("wait", "join"),
      edge("emit", "join"),
    ],
  );
  let base = initialState();
  base = cmd(base, "EMIT_EVENT", {
    name: "custom.ready",
    payload: { value: "stale" },
  });
  base.workflows = [w];
  const s = cmd(base, "CREATE_TICKET", input, "tenant");
  assert.equal(s.runs[0].status, "completed");
  assert.deepEqual(s.runs[0].outputs.wait.payload, { value: 42 });
  assert.equal(s.runs[0].outputs.wait.eventId, s.runs[0].outputs.emit.eventId);
});

test("Read/update record returns fresh data and keeps domain validation in adapters", () => {
  const w = make(
    [
      node("update", "automation", {
        action: "update-record",
        inputs: {
          resource: L("ticket"),
          recordId: R("trigger", "id"),
          field: L("note"),
          value: L("New note"),
        },
      }),
      node("read", "automation", {
        action: "read-record",
        outputPaths: ["note"],
        inputs: {
          resource: L("ticket"),
          recordId: R("node", "recordId", "update"),
        },
      }),
      node("log", "automation", {
        action: "log",
        inputs: { value: R("node", "record.note", "read") },
      }),
    ],
    [edge("trigger", "update"), edge("update", "read"), edge("read", "log")],
  );
  const s = start(w);
  assert.equal(s.runs[0].outputs.log.value, "New note");
  assert.equal(s.runs[0].triggerOutput.note, "");
  w.nodes[0].inputs.field = L("priority");
  const bad = start(w);
  assert.equal(bad.runs[0].status, "error");
  assert.equal(bad.tickets[0].priority, "high");
});

test("Status conditions can read the current completed job instead of its frozen todo creation output", () => {
  const graph = make([
    wo("job"), wait("job-wait", "job"),
    node("read-current", "automation", { action: "read-record", outputPaths: ["status"], inputs: {
      resource: L("workorder"), recordId: R("node", "workOrderId", "job"),
    } }),
    node("status-condition", "condition", { operator: "equals", inputs: {
      left: R("node", "record.status", "read-current"), right: L("completed"),
    } }),
    notice("finished-branch"), notice("unfinished-branch"),
    node("status-join", "parallel", { mode: "join" }),
  ], [
    edge("trigger", "job"), edge("job", "job-wait"), edge("job-wait", "read-current"),
    edge("read-current", "status-condition"), edge("status-condition", "finished-branch", "true"),
    edge("status-condition", "unfinished-branch", "false"), edge("finished-branch", "status-join"),
    edge("unfinished-branch", "status-join"),
  ]);
  let s = start(graph);
  assert.equal(s.runs[0].outputs.job.status, "todo");
  assert.equal(s.runs[0].nodeStates["status-condition"].status, "pending");
  s = complete(s, s.workOrders[0].id);
  assert.equal(s.runs[0].outputs.job.status, "todo");
  assert.equal(s.runs[0].outputs["read-current"].record.status, "completed");
  assert.equal(s.runs[0].outputs["status-condition"].result, true);
  assert.equal(s.runs[0].nodeStates["unfinished-branch"].status, "skipped");
  assert.ok(s.notifications.some(n => n.title === "finished-branch"));
  assert.equal(s.notifications.some(n => n.title === "unfinished-branch"), false);
});

test("Saved graph-specific automation and waiting snapshots migrate without replaying work", () => {
  let s = start(
    make(
      [
        wo("work"),
        node("wait", "automation", {
          action: "wait-workorder",
          inputs: { workOrderId: R("node", "workOrderId", "work") },
        }),
        notice("done"),
      ],
      [edge("trigger", "work"), edge("work", "wait"), edge("wait", "done")],
    ),
  );
  const run = s.runs[0];
  run.workflow.nodes[1] = node("wait", "automation", {
    action: "wait-workorder",
    inputs: { workOrderId: R("node", "workOrderId", "work") },
  });
  run.nodeStates.wait.inputs = { workOrderId: s.workOrders[0].id };
  delete run.eventCursor;
  delete s.events;
  delete s.eventSequence;
  s = complete(s, s.workOrders[0].id);
  assert.equal(s.runs[0].status, "completed");
  assert.equal(s.workOrders.length, 1);
  assert.equal(s.runs[0].workflow.nodes[1].action, "wait-event");
});

test("Generic notification resolves recipient data, deduplicates people and composes content without appending ticket text", () => {
  const w = make([wo("work"), node("notice", "notify", {channels: ["in-app"], notificationKind: "reminder", inputs: {
    recipients: {kind:"list",items:[R("trigger","customer"),R("node","assignees","work"),L(["tech-01"])]},
    subject: L("Your update"), message: {kind:"template",parts:[L("Work: "),R("node","title","work"),L(" is ready.")]},
    contextResource:L(""),contextId:L(""),
  }})], [edge("trigger","work"),edge("work","notice")]);
  const s = start(w);
  assert.equal(s.runs[0].status,"completed");
  assert.equal(s.runs[0].outputs.notice.sentCount,2);
  assert.equal(s.runs[0].outputs.notice.status,"recorded");
  assert.equal(s.notifications.length,2);
  for(const n of s.notifications) {
    assert.equal(n.title,"Your update");
    assert.equal(n.body,"Work: work is ready.");
    assert.equal(n.ticketId,null);
    assert.equal(n.workOrderId,null);
    assert.equal(n.kind,"reminder");
    assert.deepEqual(n.channels,["in-app"]);
  }
});

test("Notification optional context points to selected data and preserves browser-only channel", () => {
  const w = make([wo("work"), node("notice","notify",{channels:["browser"],notificationKind:"info",inputs:{recipients:L(["pms-01"]),subject:L("Review data"),message:L("Click to view."),contextResource:L("workorder"),contextId:R("node","workOrderId","work")}})], [edge("trigger","work"),edge("work","notice")]);
  const s = start(w), n=s.notifications[0];
  assert.equal(n.context.id,s.workOrders[0].id);
  assert.equal(n.workOrderId,s.workOrders[0].id);
  assert.deepEqual(n.channels,["browser"]);
  assert.deepEqual(s.runs[0].outputs.notice.context,{resource:"workorder",id:s.workOrders[0].id});
});

test("Composed notification inputs still enforce upstream references, variable ordering and valid recipients", () => {
  const n = node("notice","notify",{channels:["in-app"],inputs:{recipients:L([]),subject:L("Hello"),message:L("Body")}});
  const w = make([n],[edge("trigger","notice")]);
  assert.throws(()=>validateWorkflow(w,initialState().templates),/người nhận/);
  n.inputs.recipients=L(["tenant-01"]);
  n.inputs.subject=L("");
  assert.throws(()=>validateWorkflow(w,initialState().templates),/tiêu đề/);
  n.inputs.subject={kind:"template",parts:[R("node","title","later")]};
  w.nodes.push(wo("later"));w.transitions.push(edge("notice","later"));
  assert.throws(()=>validateWorkflow(w,initialState().templates),/phía trước/);
});

test("Legacy notification optional empty work-order input migrates without forcing an entity link", () => {
  const w=make([node("notice","notify",{recipients:["tenant"],inputs:{message:L("Legacy body"),workOrderId:L("")}})],[edge("trigger","notice")]);
  const s=start(w);
  assert.equal(s.runs[0].status,"completed");
  assert.equal(s.notifications[0].body,"Legacy body");
  assert.equal(s.notifications[0].context,null);
});
