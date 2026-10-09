import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { initialState, reduceCommand, validateWorkflow } from "../src/engine.js";
import {
  newBusinessWorkflow, newBusinessStep, compileBusinessWorkflow,
  validateBusinessWorkflow,
  businessRunSteps, businessStepStatus,
} from "../src/maintenance-workflow.js";
globalThis.crypto ||= webcrypto;
const command = (s, type, payload = {}, role = "pms") => reduceCommand(s, { type, payload, role });
const work = (s, id, waitForCompletion = true) => ({ ...newBusinessStep("workorder", s.templates, id), title: id, checklist: ["Kiểm tra"], waitForCompletion });
const notice = (s, id) => ({ ...newBusinessStep("notify", s.templates, id), title: id, subject: id, message: "Nội dung " + id });
const condition = (id, resource, status, mode, workStepId = "", matchedSteps = [], unmatchedSteps = []) => ({
  id, type: "condition", title: id, resource, status, mode, workStepId, matchedSteps, unmatchedSteps,
});
const parallel = (id, sequences) => ({ id, type: "parallel", title: id, branches: sequences.map((steps, index) => ({ id: `${id}-branch-${index}`, title: `Nhánh ${index + 1}`, steps })) });
function start(s, steps) {
  const workflow = newBusinessWorkflow(s.templates, "wf-branches", "unused");
  workflow.business.approval = false;
  workflow.business.steps = steps;
  validateBusinessWorkflow(workflow, s.templates);
  validateWorkflow(compileBusinessWorkflow(workflow), s.templates);
  s = command(s, "SAVE_WORKFLOW", { ...workflow, published: true });
  return command(s, "CREATE_TICKET", { title: "Ticket phân nhánh", type: "General request", priority: "high", area: "Office", location: "A-01" }, "tenant");
}
function status(s, workId, next) {
  const wo = s.workOrders.find(w => w.title === workId);
  return command(s, "WO_STATUS", { workOrderId: wo.id, status: next }, "maintainer");
}
function complete(s, workId) {
  const wo = s.workOrders.find(w => w.title === workId);
  if (wo.status === "todo" || wo.status === "pause") s = status(s, workId, "in-progress");
  for (const [index] of wo.checklist.entries()) s = command(s, "WO_CHECK", { workOrderId: wo.id, index, done: true }, "maintainer");
  return status(s, workId, "completed");
}
const sent = (s, subject) => s.notifications.filter(n => n.title === subject);

test("Nested parallel groups create all jobs together and join only after each exact job finishes", () => {
  let s = initialState();
  s = start(s, [parallel("outer", [[work(s, "job-a", false)], [parallel("inner", [[work(s, "job-b")], [work(s, "job-c")]])]]), notice(s, "after-all-branches")]);
  assert.deepEqual(new Set(s.workOrders.map(w => w.title)), new Set(["job-a", "job-b", "job-c"]));
  assert.equal(s.runs[0].waitingWorkOrderIds.length, 3);
  s = command(s, "CREATE_WO", { title: "unrelated-manual", ticketIds: [s.tickets[0].id] });
  s = complete(s, "unrelated-manual");
  s = complete(s, "job-a");
  s = complete(s, "job-b");
  assert.equal(sent(s, "after-all-branches").length, 0);
  assert.notEqual(s.tickets[0].status, "resolved");
  const counts = { jobs: s.workOrders.length, notices: s.notifications.length };
  s = command(structuredClone(s), "READ_NOTIFICATION", {}, "tenant");
  assert.equal(s.workOrders.length, counts.jobs);
  assert.equal(s.notifications.length, counts.notices);
  s = complete(s, "job-c");
  assert.equal(s.tickets[0].status, "resolved");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(sent(s, "after-all-branches").length, 1);
  const group = businessRunSteps(s.runs[0]).find(step => step.id === "outer");
  assert.equal(businessStepStatus(s.runs[0], group), "completed");
  s = command(structuredClone(s), "READ_NOTIFICATION", {}, "tenant");
  assert.equal(s.workOrders.length, 4);
  assert.equal(sent(s, "after-all-branches").length, 1);
});

test("Cancellation closes every active parallel job and prevents branch-end side effects", () => {
  let s = initialState();
  s = start(s, [parallel("both", [[work(s, "left")], [work(s, "right")]]), notice(s, "must-not-send")]);
  s = status(s, "left", "in-progress");
  s = command(s, "CANCEL_TICKET", { ticketId: s.tickets[0].id }, "tenant");
  assert.ok(s.workOrders.every(w => w.status === "closed"));
  assert.equal(s.runs[0].status, "cancelled");
  assert.equal(sent(s, "must-not-send").length, 0);
  s = command(structuredClone(s), "READ_NOTIFICATION", {}, "pms");
  assert.equal(s.workOrders.length, 2);
  assert.equal(sent(s, "must-not-send").length, 0);
});

test("Parallel joins ignore skipped condition paths but still wait for every active branch", () => {
  let s = initialState();
  s = start(s, [parallel("parallel-choice", [
    [condition("choose-left", "ticket", "submitted", "check", "", [work(s, "left-selected")], [work(s, "left-skipped"), notice(s, "skip-notice")])],
    [work(s, "right-selected")],
  ]), notice(s, "joined-selected-paths")]);
  assert.deepEqual(new Set(s.workOrders.map(w => w.title)), new Set(["left-selected", "right-selected"]));
  s = complete(s, "left-selected");
  assert.equal(sent(s, "joined-selected-paths").length, 0);
  assert.equal(sent(s, "skip-notice").length, 0);
  s = complete(s, "right-selected");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(sent(s, "joined-selected-paths").length, 1);
  const group = businessRunSteps(s.runs[0]).find(step => step.id === "parallel-choice");
  assert.equal(businessStepStatus(s.runs[0], group), "completed");
});

test("Immediate work-order conditions use current completed status and run exactly one branch", () => {
  for (const [targetStatus, chosen, skipped] of [["completed", "matched-work", "unmatched-work"], ["todo", "unmatched-work", "matched-work"]]) {
    let s = initialState();
    s = start(s, [work(s, "source"), condition("choose-status", "workorder", targetStatus, "check", "source", [work(s, "matched-work")], [work(s, "unmatched-work")])]);
    assert.equal(s.runs[0].outputs.source.status, "todo");
    s = complete(s, "source");
    assert.ok(s.workOrders.some(w => w.title === chosen));
    assert.equal(s.workOrders.some(w => w.title === skipped), false);
    assert.equal(s.runs[0].outputs.source.status, "todo");
    s = complete(s, chosen);
    assert.equal(s.runs[0].status, "completed");
    assert.equal(s.workOrders.length, 2);
  }
});

test("Immediate ticket conditions use current inprogress state rather than trigger submitted snapshot", () => {
  let s = initialState();
  s = start(s, [work(s, "source"), condition("choose-ticket", "ticket", "inprogress", "check", "", [notice(s, "ticket-current-match")], [notice(s, "ticket-stale-mismatch")])]);
  assert.equal(s.runs[0].triggerOutput.status, "submitted");
  s = complete(s, "source");
  assert.equal(sent(s, "ticket-current-match").length, 1);
  assert.equal(sent(s, "ticket-stale-mismatch").length, 0);
  assert.equal(s.runs[0].status, "completed");
});

test("Wait-for-status proceeds immediately if already matched and otherwise waits for the exact job", () => {
  let s = initialState();
  s = start(s, [work(s, "source", false), condition("wait-start", "workorder", "todo", "wait", "source", [notice(s, "already-matched")])]);
  assert.equal(sent(s, "already-matched").length, 1);
  assert.notEqual(s.tickets[0].status, "resolved");
  s = complete(s, "source");
  assert.equal(s.runs[0].status, "completed");
  s = initialState();
  s = start(s, [work(s, "source", false), condition("wait-start", "workorder", "in-progress", "wait", "source", [notice(s, "started-exact-job")])]);
  s = command(s, "CREATE_WO", { title: "other-job", ticketIds: [s.tickets[0].id] });
  s = status(s, "other-job", "in-progress");
  assert.equal(sent(s, "started-exact-job").length, 0);
  s = status(s, "source", "in-progress");
  assert.equal(sent(s, "started-exact-job").length, 1);
  s = complete(s, "source");
  assert.notEqual(s.tickets[0].status, "resolved");
  s = complete(s, "other-job");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(sent(s, "started-exact-job").length, 1);
});

test("Wait-for-status ignores matching historical events from before the step was activated", () => {
  let s = initialState();
  s = start(s, [work(s, "source", false), work(s, "gate"), condition("wait-new-pause", "workorder", "pause", "wait", "source", [notice(s, "new-pause-only")])]);
  s = status(s, "source", "in-progress");
  s = status(s, "source", "pause");
  s = status(s, "source", "in-progress");
  s = complete(s, "gate");
  assert.equal(sent(s, "new-pause-only").length, 0);
  assert.notEqual(s.runs[0].status, "completed");
  s = command(structuredClone(s), "READ_NOTIFICATION", {}, "tenant");
  assert.equal(sent(s, "new-pause-only").length, 0);
  s = status(s, "source", "pause");
  assert.equal(sent(s, "new-pause-only").length, 1);
  s = complete(s, "source");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(sent(s, "new-pause-only").length, 1);
});

test("A wait reports when its target state can no longer be reached instead of hanging forever", () => {
  let s = initialState();
  s = start(s, [work(s, "source", false), condition("wait-pause", "workorder", "pause", "wait", "source", [notice(s, "pause-notice")])]);
  s = complete(s, "source");
  assert.equal(s.runs[0].status, "error");
  assert.match(s.runs[0].error, /trạng thái|đã hoàn|không thể|không còn/i);
  assert.equal(sent(s, "pause-notice").length, 0);
  assert.notEqual(s.tickets[0].status, "resolved");
  s = initialState();
  s = start(s, [work(s, "source", false), condition("wait-close", "workorder", "closed", "wait", "source", [notice(s, "closed-notice")])]);
  s = complete(s, "source");
  assert.notEqual(s.runs[0].status, "error");
  assert.equal(sent(s, "closed-notice").length, 0);
  s = status(s, "source", "closed");
  assert.equal(sent(s, "closed-notice").length, 1);
  assert.equal(s.runs[0].status, "completed");
  s = initialState();
  s = start(s, [work(s, "ticket-source", false), condition("wait-job-start", "workorder", "in-progress", "wait", "ticket-source"), condition("wait-old-ticket-state", "ticket", "submitted", "wait", "", [notice(s, "never-return-submitted")])]);
  s = status(s, "ticket-source", "in-progress");
  assert.equal(s.runs[0].status, "error");
  assert.match(s.runs[0].error, /trạng thái|không thể|không còn/i);
  assert.equal(sent(s, "never-return-submitted").length, 0);
});

test("Condition validation rejects references to sibling or possibly skipped work and impossible waits", () => {
  const s = initialState();
  const w = newBusinessWorkflow(s.templates, "wf-invalid-branches", "unused");
  w.business.approval = false;
  w.business.steps = [parallel("siblings", [[work(s, "left")], [condition("bad-sibling", "workorder", "completed", "check", "left", [notice(s, "notice")])]])];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /công việc|phía trước|nhánh|nguồn/i);
  w.business.steps = [work(s, "source"), condition("first-choice", "workorder", "completed", "check", "source", [work(s, "possibly-skipped")], [notice(s, "other-path")]), condition("bad-reference", "workorder", "completed", "check", "possibly-skipped", [notice(s, "later")])];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /công việc|phía trước|nhánh|nguồn/i);
  w.business.steps = [work(s, "blocking-source"), condition("impossible-wait", "workorder", "in-progress", "wait", "blocking-source", [notice(s, "never")])];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /chờ|trạng thái|hoàn thành/i);
  w.business.steps = [work(s, "blocking-source"), condition("wait-resolve", "ticket", "resolved", "wait", "", [notice(s, "never")])];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /chờ|trạng thái|kết thúc|hoàn tất/i);
  w.business.steps = [work(s, "nonblocking-source", false), condition("wait-nonexistent-approval", "ticket", "approved", "wait", "", [notice(s, "never-approved")])];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /duyệt|phê duyệt|trạng thái/i);
  w.business.steps = [work(s, "blocking-source"), condition("wait-old-state", "ticket", "submitted", "wait", "", [notice(s, "never-submitted")])];
  assert.throws(() => validateBusinessWorkflow(w, s.templates), /quay lại|trạng thái|đã xử lý/i);
});

test("Saved sequential business workflows without new wait flags or node ownership resume unchanged", () => {
  let s = initialState();
  const workflow = newBusinessWorkflow(s.templates, "wf-previous-business", "old-source");
  workflow.business.approval = false;
  workflow.business.steps[0].title = "old-source";
  workflow.business.steps.push(notice(s, "old-notice"));
  delete workflow.business.steps[0].waitForCompletion;
  const previousGraph = compileBusinessWorkflow({ ...workflow, published: true, version: 3 });
  previousGraph.nodes.forEach(node => { delete node.businessStepId; });
  s.workflows = [previousGraph];
  s = command(s, "CREATE_TICKET", { title: "Ticket phiên bản trước", type: "General request", priority: "high", area: "Office", location: "A-01" }, "tenant");
  assert.equal(s.workOrders.length, 1);
  assert.equal(sent(s, "old-notice").length, 0);
  s = complete(structuredClone(s), "old-source");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(s.runs[0].workflow.version, 3);
  assert.equal(s.workOrders.length, 1);
  assert.equal(sent(s, "old-notice").length, 1);
  for (const step of businessRunSteps(s.runs[0])) assert.equal(businessStepStatus(s.runs[0], step), "completed");
});
