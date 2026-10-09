import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { initialState, reduceCommand, defaultWorkflow } from "../src/engine.js";
import {
  newBusinessWorkflow, newBusinessStep, validateBusinessWorkflow,
  compileBusinessWorkflow, editableBusinessWorkflow,
  businessRunSteps, businessStepStatus,
} from "../src/maintenance-workflow.js";
globalThis.crypto ||= webcrypto;
const at = "2026-10-08T09:00:00.000Z";
const command = (s, type, payload = {}, role = "pms") => reduceCommand(s, { type, payload, role }, at);
const create = (s) => command(s, "CREATE_TICKET", {
  title: "Yêu cầu theo quy trình mới", type: "General request", priority: "high", area: "Office", location: "A-01",
}, "tenant");
function complete(s, wid) {
  s = command(s, "WO_STATUS", { workOrderId: wid, status: "in-progress" }, "maintainer");
  const order = s.workOrders.find(w => w.id === wid);
  order.checklist.forEach((_, index) => { s = command(s, "WO_CHECK", { workOrderId: wid, index, done: true }, "maintainer"); });
  return command(s, "WO_STATUS", { workOrderId: wid, status: "completed" }, "maintainer");
}
test("Business steps execute in their chosen order, wait for checklist work, and notify only selected roles", () => {
  let s = initialState();
  const w = newBusinessWorkflow(s.templates, "wf-business", "inspect-custom");
  const first = w.business.steps[0];
  Object.assign(first, { title: "Kiểm tra theo yêu cầu", checklist: ["Ghi nhận", "Đo nhiệt độ"], responseTimeSLA: 15, processTimeSLA: 45 });
  const notice = newBusinessStep("notify", s.templates, "notice-custom");
  Object.assign(notice, { subject: "Đã kiểm tra xong", message: "Sẽ sửa chữa sau khi kiểm tra.", recipients: ["tenant", "pms"] });
  const second = newBusinessStep("workorder", s.templates, "repair-custom");
  Object.assign(second, { title: "Sửa chữa theo kết quả", checklist: ["Sửa chữa", "Bàn giao"] });
  w.business.steps.push(notice, second);
  validateBusinessWorkflow(w, s.templates);
  s = command(s, "SAVE_WORKFLOW", { ...w, published: true });
  s = create(s);
  assert.equal(s.runs[0].status, "waiting-approval");
  assert.equal(s.workOrders.length, 0);
  s = command(s, "APPROVE", { runId: s.runs[0].id });
  assert.equal(s.workOrders.length, 1);
  assert.equal(s.workOrders[0].title, first.title);
  assert.deepEqual(s.workOrders[0].checklist.map(c => c.text), first.checklist);
  assert.equal(s.workOrders[0].responseTimeSLA, 15);
  assert.equal(s.workOrders[0].processTimeSLA, 45);
  assert.equal(s.notifications.some(n => n.title === notice.subject), false);
  s = complete(s, s.workOrders[0].id);
  assert.equal(s.workOrders.length, 2);
  assert.equal(s.workOrders[0].title, second.title);
  const sent = s.notifications.filter(n => n.title === notice.subject);
  assert.deepEqual(new Set(sent.map(n => n.role)), new Set(["tenant", "pms"]));
  assert.ok(sent.every(n => n.body === notice.message && n.context.resource === "ticket"));
  assert.notEqual(s.tickets[0].status, "resolved");
  s = complete(s, s.workOrders[0].id);
  assert.equal(s.tickets[0].status, "resolved");
  assert.equal(s.runs[0].status, "completed");
  assert.ok(s.notifications.some(n => n.role === "pms" && n.title === "Yêu cầu đã hoàn tất"));
});
test("Published work uses the checklist and SLA snapshot even when the source template changes", () => {
  let s = initialState();
  const w = newBusinessWorkflow(s.templates, "wf-snapshot", "work-snapshot");
  w.business.approval = false;
  s = command(s, "SAVE_WORKFLOW", { ...w, published: true });
  const checklist = [...w.business.steps[0].checklist];
  s.templates[0].checklist = ["Mục mẫu mới"];
  s.templates[0].responseTimeSLA = 999;
  s.templates[0].processTimeSLA = 999;
  s = create(s);
  assert.deepEqual(s.workOrders[0].checklist.map(c => c.text), checklist);
  assert.equal(s.workOrders[0].responseTimeSLA, w.business.steps[0].responseTimeSLA);
  assert.equal(s.workOrders[0].processTimeSLA, w.business.steps[0].processTimeSLA);
  assert.equal(s.runs[0].status, "waiting-event");
  assert.equal(s.notifications.some(n => n.kind === "approval"), false);
});
test("Business rejection informs Tenant and stops work; cancelling an approved ticket closes its job", () => {
  let s = initialState();
  const w = newBusinessWorkflow(s.templates, "wf-stop", "work-stop");
  s = command(s, "SAVE_WORKFLOW", { ...w, published: true });
  s = create(s);
  s = command(s, "REJECT", { runId: s.runs[0].id, reason: "Thiếu vị trí chính xác" });
  assert.equal(s.tickets[0].status, "cancelled");
  assert.equal(s.runs[0].status, "rejected");
  assert.equal(s.workOrders.length, 0);
  assert.ok(s.notifications.some(n => n.role === "tenant" && n.title.includes("Thiếu vị trí chính xác")));
  assert.equal(s.notifications.some(n => n.role === "maintainer"), false);
  s = create(s);
  s = command(s, "APPROVE", { runId: s.runs[0].id });
  const wid = s.workOrders[0].id;
  s = command(s, "CANCEL_TICKET", { ticketId: s.tickets[0].id }, "tenant");
  assert.equal(s.runs[0].status, "cancelled");
  assert.equal(s.workOrders[0].status, "closed");
  const jobStep = businessRunSteps(s.runs[0]).find(step => step.type === "workorder");
  assert.equal(businessStepStatus(s.runs[0], jobStep), "stopped");
  assert.throws(() => complete(s, wid), /không hợp lệ/);
  assert.equal(s.notifications.some(n => n.title === "Yêu cầu đã hoàn tất"), false);
});
test("Terminal runs show incomplete and partly completed steps as stopped", () => {
  for (const status of ["cancelled", "rejected"]) {
    const run = { status, nodeStates: { job: { status: "completed" }, wait: { status: "waiting" }, future: { status: "pending" } } };
    assert.equal(businessStepStatus(run, { nodeIds: ["job", "wait"] }), "stopped");
    assert.equal(businessStepStatus(run, { nodeIds: ["future"] }), "stopped");
    assert.equal(businessStepStatus(run, { nodeIds: ["job"] }), "completed");
  }
});
test("Group progress counts completed and skipped internal nodes as finished", () => {
  const run = { status: "completed", nodeStates: { chosen: { status: "completed" }, skipped: { status: "skipped" } } };
  assert.equal(businessStepStatus(run, { nodeIds: ["chosen", "skipped"] }), "completed");
  assert.equal(businessStepStatus(run, { nodeIds: ["skipped"] }), "skipped");
});
test("The compiler creates exact waits after each job, including after reordered notifications", () => {
  const s = initialState();
  const w = newBusinessWorkflow(s.templates, "wf-reorder", "first-work");
  const second = newBusinessStep("workorder", s.templates, "second-work");
  const notice = newBusinessStep("notify", s.templates, "notify-first");
  w.business.steps = [notice, second, w.business.steps[0]];
  const graph = compileBusinessWorkflow(w);
  assert.deepEqual(graph.nodes.filter(n => n.type === "workorder").map(n => n.id), ["second-work", "first-work"]);
  for (const work of graph.nodes.filter(n => n.type === "workorder")) {
    const wait = graph.nodes.find(n => n.id === `${work.id}-wait`);
    assert.equal(wait.inputs.filter_id.nodeId, work.id);
    assert.deepEqual(wait.inputs.filter_status.value, ["completed", "closed"]);
  }
  assert.equal(graph.nodes.at(-2).id, "system-resolve");
  assert.equal(graph.nodes.at(-1).id, "system-completed-pms");
});
test("The completion notice waits for all linked manual work, beyond the configured steps", () => {
  let s = initialState();
  const w = newBusinessWorkflow(s.templates, "wf-extra-work", "configured-work");
  w.business.approval = false;
  s = command(s, "SAVE_WORKFLOW", { ...w, published: true });
  s = create(s);
  const configured = s.workOrders[0].id;
  s = command(s, "CREATE_WO", { title: "Công việc kiểm tra thêm", ticketIds: [s.tickets[0].id] });
  const extra = s.workOrders[0].id;
  s = complete(s, configured);
  assert.notEqual(s.tickets[0].status, "resolved");
  assert.equal(s.notifications.some(n => n.role === "pms" && n.title === "Yêu cầu đã hoàn tất"), false);
  assert.equal(s.notifications.some(n => n.role === "tenant" && n.title.startsWith("Yêu cầu đã hoàn tất")), false);
  s = complete(s, extra);
  assert.equal(s.tickets[0].status, "resolved");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(s.notifications.filter(n => n.role === "pms" && n.title === "Yêu cầu đã hoàn tất").length, 1);
  assert.equal(s.notifications.filter(n => n.role === "tenant" && n.title.startsWith("Yêu cầu đã hoàn tất")).length, 1);
});
test("Invalid business configurations cannot publish empty work, recipients or checklists", () => {
  const s = initialState();
  const w = newBusinessWorkflow(s.templates, "wf-invalid", "work-invalid");
  w.business.steps[0].checklist = [];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /checklist/);
  w.business.steps[0].checklist = ["Kiểm tra"];
  w.business.steps[0].processTimeSLA = 0;
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /thời hạn/);
  w.business.steps[0].processTimeSLA = 30;
  const notice = newBusinessStep("notify", s.templates, "notice-invalid");
  notice.recipients = [];
  w.business.steps.push(notice);
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /người nhận/);
  w.business.steps = [];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /công việc/);
});
test("Only the original example converts; existing custom graph data is not silently rewritten", () => {
  const s = initialState(), original = defaultWorkflow();
  const supported = editableBusinessWorkflow(original, s.templates, original);
  assert.equal(supported.business.steps.length, 2);
  const custom = structuredClone(original);
  custom.nodes[0].title = "Duyệt theo quy tắc riêng";
  custom.variables.push({ name: "custom", type: "string", value: "data" });
  const before = structuredClone(custom);
  assert.equal(editableBusinessWorkflow(custom, s.templates, original), null);
  assert.deepEqual(custom, before);
  const customVariables = structuredClone(original);
  customVariables.variables.push({ name: "custom", type: "string", value: "data" });
  assert.equal(editableBusinessWorkflow(customVariables, s.templates, original), null);
  const customTrigger = structuredClone(original);
  customTrigger.trigger.inputs = { source: { kind: "literal", value: "custom" } };
  assert.equal(editableBusinessWorkflow(customTrigger, s.templates, original), null);
});
