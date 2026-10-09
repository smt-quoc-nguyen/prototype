import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  initialState,
  reduceCommand,
  defaultWorkflow,
  validateWorkflow,
} from "../src/engine.js";
globalThis.crypto ||= webcrypto;
const at = "2026-10-06T09:00:00.000Z";
const ticket = (
  type = "Equipment malfunction",
  title = "Máy lạnh không mát",
) => ({
  type: "CREATE_TICKET",
  role: "tenant",
  payload: {
    title,
    type,
    priority: "high",
    location: "VP-03",
    area: "Office building",
  },
});
const command = (s, type, payload = {}, role = "pms") =>
  reduceCommand(s, { type, payload, role }, at);
function approved(s = initialState()) {
  s = reduceCommand(s, ticket(), at);
  return command(s, "APPROVE", { runId: s.runs[0].id });
}
function complete(s, woId = s.workOrders[0].id) {
  s = command(
    s,
    "WO_STATUS",
    { workOrderId: woId, status: "in-progress" },
    "maintainer",
  );
  s.workOrders
    .find((w) => w.id === woId)
    .checklist.forEach((_, i) => {
      s = command(
        s,
        "WO_CHECK",
        { workOrderId: woId, index: i, done: true },
        "maintainer",
      );
    });
  return command(
    s,
    "WO_STATUS",
    { workOrderId: woId, status: "completed" },
    "maintainer",
  );
}
test("Equipment malfunction: approval → inspection → repair → resolved and correct notifications", () => {
  let s = reduceCommand(initialState(), ticket(), at);
  assert.equal(s.tickets[0].status, "submitted");
  assert.equal(s.runs[0].status, "waiting-approval");
  assert.equal(s.workOrders.length, 0);
  assert.equal(s.notifications[0].role, "pms");
  assert.equal(s.notifications[0].kind, "approval");
  s = command(s, "APPROVE", { runId: s.runs[0].id });
  assert.equal(s.workOrders[0].title, "Kiểm tra điều hoà");
  assert.equal(s.runs[0].waitingWorkOrderId, s.workOrders[0].id);
  assert.equal(s.tickets[0].approvedBy, "pms-01");
  assert.equal(s.tickets[0].responsedTime, at);
  assert.deepEqual(
    new Set(s.notifications.slice(0, 2).map((n) => n.role)),
    new Set(["tenant", "maintainer"]),
  );
  s = complete(s);
  assert.equal(s.workOrders.length, 2);
  assert.equal(s.workOrders[0].title, "Sửa chữa máy lạnh");
  assert.equal(s.tickets[0].status, "inprogress");
  s = complete(s);
  assert.equal(s.tickets[0].status, "resolved");
  assert.equal(s.runs[0].status, "completed");
  assert.equal(s.tickets[0].resolvedBy, "workflow");
  assert.equal(s.workOrders.length, 2);
  assert.equal(s.links.length, 2);
  assert.equal(s.runs[0].cursor, 9);
  assert.ok(
    s.notifications.some(
      (n) => n.role === "pms" && n.title.includes("Bảo trì đã hoàn tất"),
    ),
  );
});
test("Duplicate approval/completion rejected without creating work orders", () => {
  const s = approved();
  assert.throws(
    () => command(s, "APPROVE", { runId: s.runs[0].id }),
    /đã được xử lý/,
  );
  const done = complete(s);
  const first = done.workOrders.find((w) => w.title === "Kiểm tra điều hoà");
  assert.throws(
    () =>
      command(
        done,
        "WO_STATUS",
        { workOrderId: first.id, status: "completed" },
        "maintainer",
      ),
    /không hợp lệ/,
  );
  assert.equal(done.workOrders.length, 2);
});
test("Completion requires start and every checklist item; pause/resume works", () => {
  let s = approved(),
    wid = s.workOrders[0].id;
  assert.throws(
    () =>
      command(
        s,
        "WO_STATUS",
        { workOrderId: wid, status: "completed" },
        "maintainer",
      ),
    /không hợp lệ/,
  );
  s = command(
    s,
    "WO_STATUS",
    { workOrderId: wid, status: "in-progress" },
    "maintainer",
  );
  assert.throws(
    () =>
      command(
        s,
        "WO_STATUS",
        { workOrderId: wid, status: "completed" },
        "maintainer",
      ),
    /checklist/,
  );
  s = command(
    s,
    "WO_STATUS",
    { workOrderId: wid, status: "pause" },
    "maintainer",
  );
  s = command(
    s,
    "WO_STATUS",
    { workOrderId: wid, status: "in-progress" },
    "maintainer",
  );
  assert.equal(s.workOrders[0].status, "in-progress");
});
test("Reject reason and audit; cancelled run creates no work order", () => {
  let s = reduceCommand(initialState(), ticket(), at);
  const rid = s.runs[0].id;
  assert.throws(() => command(s, "REJECT", { runId: rid }), /lý do/);
  s = command(s, "REJECT", { runId: rid, reason: "Yêu cầu không hợp lệ" });
  assert.equal(s.tickets[0].status, "cancelled");
  assert.equal(s.runs[0].status, "rejected");
  assert.equal(s.workOrders.length, 0);
  assert.equal(s.notifications[0].role, "tenant");
  assert.match(s.notifications[0].title, /không hợp lệ/);
  assert.equal(s.notifications.some((n) => n.role === "maintainer"), false);
});
test("Tenant cancellation stops approved workflow and closes its dedicated work", () => {
  let s = approved();
  const previousNotifications = new Set(s.notifications.map((n) => n.id));
  s = command(s, "CANCEL_TICKET", { ticketId: s.tickets[0].id }, "tenant");
  assert.ok(s.notifications.some((n) => n.role === "maintainer" && !previousNotifications.has(n.id) && n.title.startsWith("Dừng xử lý ticket:")));
  assert.equal(s.runs[0].status, "cancelled");
  assert.equal(s.workOrders[0].status, "closed");
  assert.throws(
    () =>
      command(
        s,
        "WO_STATUS",
        { workOrderId: s.workOrders[0].id, status: "in-progress" },
        "maintainer",
      ),
    /không hợp lệ/,
  );
});
test("N–N: shared work continues after one ticket cancelled; groups preserve runs", () => {
  let s = reduceCommand(initialState(), ticket("Plumbing", "Nước rò rỉ"), at);
  s = reduceCommand(s, ticket("Plumbing", "Ống nước hỏng"), at);
  const tids = s.tickets.map((t) => t.id);
  s = command(s, "GROUP_TICKETS", { name: "Tầng 3", ticketIds: tids });
  assert.equal(s.tickets[0].groupId, s.tickets[1].groupId);
  s = command(s, "CREATE_WO", { title: "Sửa ống nước", ticketIds: tids });
  assert.equal(s.links.length, 2);
  s = command(s, "CREATE_WO", { title: "Kiểm tra van", ticketIds: [tids[0]] });
  assert.equal(s.links.length, 3);
  s = command(s, "CANCEL_TICKET", { ticketId: tids[0] }, "tenant");
  assert.equal(
    s.workOrders.find((w) => w.title === "Kiểm tra van").status,
    "closed",
  );
  assert.equal(
    s.workOrders.find((w) => w.title === "Sửa ống nước").status,
    "todo",
  );
  s = complete(s, s.workOrders.find((w) => w.title === "Sửa ống nước").id);
  s = command(s, "RESOLVE_MANUAL", { ticketId: tids[1] });
  assert.equal(s.tickets.find((t) => t.id === tids[1]).status, "resolved");
});
test("Workflow waits for the exact work order; unrelated completion does not resume run", () => {
  let s = approved();
  const expected = s.runs[0].waitingWorkOrderId;
  s = command(s, "CREATE_WO", {
    title: "Công việc khác",
    ticketIds: [s.tickets[0].id],
  });
  s = complete(s);
  assert.equal(s.runs[0].waitingWorkOrderId, expected);
  assert.equal(s.workOrders.length, 2);
});
test("Final resolution waits for additional linked manual work orders", () => {
  let s = approved(),
    first = s.workOrders[0].id;
  s = command(s, "CREATE_WO", {
    title: "Kiểm tra thêm",
    ticketIds: [s.tickets[0].id],
  });
  const extra = s.workOrders[0].id;
  s = complete(s, first);
  const repair = s.workOrders.find((w) => w.title === "Sửa chữa máy lạnh").id;
  s = complete(s, repair);
  assert.equal(s.runs[0].status, "waiting-data");
  assert.notEqual(s.tickets[0].status, "resolved");
  s = complete(s, extra);
  assert.equal(s.tickets[0].status, "resolved");
});
test("Published workflow validates graph, single matching trigger, and snapshots", () => {
  let s = approved();
  const originalTitle = s.runs[0].workflow.nodes[4].title;
  const w = structuredClone(s.workflows[0]);
  w.nodes[4].title = "Sửa chữa phiên bản mới";
  s = command(s, "SAVE_WORKFLOW", w);
  assert.equal(s.runs[0].workflow.nodes[4].title, originalTitle);
  assert.equal(s.workflows[0].version, 2);
  assert.throws(
    () => command(s, "SAVE_WORKFLOW", { ...w, id: "other" }),
    /đang dùng quy trình/,
  );
  const invalid = defaultWorkflow();
  invalid.nodes.splice(3, 1);
  assert.throws(() => validateWorkflow(invalid, s.templates), /Transition/);
  const novel = {
    ...defaultWorkflow(),
    id: "new-wf",
    triggerType: "General request",
  };
  s = command(s, "SAVE_WORKFLOW", novel);
  s = command(s, "SAVE_WORKFLOW", { ...novel, name: "Updated" });
  assert.equal(s.workflows.filter((w) => w.id === "new-wf").length, 1);
});
test("New drafts do not trigger; other types route to manual work", () => {
  let s = initialState();
  s = command(s, "SAVE_WORKFLOW", {
    ...s.workflows[0],
    id: "wf-draft",
    triggerType: "General request",
    published: false,
  });
  s = reduceCommand(s, ticket("General request"), at);
  assert.equal(s.runs.length, 0);
  assert.equal(s.notifications[0].kind, "info");
});
test("Saving a draft preserves the live workflow, published version and new-ticket routing", () => {
  let s = initialState();
  const live = structuredClone(s.workflows[0]);
  s = command(s, "SAVE_WORKFLOW", {
    ...live,
    name: "Bản nháp chưa xuất bản",
    triggerType: "Plumbing",
    published: false,
  });
  const saved = s.workflows.find((w) => w.id === live.id);
  assert.equal(saved.published, true);
  assert.equal(saved.version, live.version);
  assert.equal(saved.name, live.name);
  assert.equal(saved.triggerType, live.triggerType);
  assert.deepEqual(saved.nodes, live.nodes);
  assert.equal(saved.draft.name, "Bản nháp chưa xuất bản");
  assert.equal(saved.draft.triggerType, "Plumbing");
  s = reduceCommand(s, ticket(), at);
  assert.equal(s.runs[0].workflow.name, live.name);
  assert.equal(s.runs[0].workflow.version, live.version);
  s = reduceCommand(s, ticket("Plumbing"), at);
  assert.equal(s.runs.length, 1);
  assert.match(s.notifications[0].title, /xử lý thủ công/);
  const snapshot = structuredClone(s.runs[0].workflow);
  s = command(s, "SAVE_WORKFLOW", { ...saved.draft, published: true });
  const published = s.workflows.find((w) => w.id === live.id);
  assert.equal(published.version, live.version + 1);
  assert.equal(published.name, "Bản nháp chưa xuất bản");
  assert.equal(published.triggerType, "Plumbing");
  assert.equal(published.draft, undefined);
  assert.deepEqual(s.runs[0].workflow, snapshot);
  s = reduceCommand(s, ticket("Plumbing"), at);
  assert.equal(s.runs.length, 2);
  assert.equal(s.runs[0].workflow.version, live.version + 1);
});
test("Role guards and notification privacy", () => {
  const s = approved();
  assert.throws(
    () =>
      command(
        s,
        "WO_CHECK",
        { workOrderId: s.workOrders[0].id, index: 0, done: true },
        "tenant",
      ),
    /quyền/,
  );
  assert.throws(
    () => command(s, "SAVE_WORKFLOW", s.workflows[0], "maintainer"),
    /PMS/,
  );
  const read = command(s, "READ_NOTIFICATION", {}, "tenant");
  assert.ok(
    read.notifications.filter((n) => n.role === "tenant").every((n) => n.read),
  );
  assert.ok(read.notifications.some((n) => n.role === "maintainer" && !n.read));
});
test("Stale published and draft edits cannot overwrite a newer workflow in another tab", () => {
  let s = initialState();
  const live = structuredClone(s.workflows[0]);
  s = command(s, "SAVE_WORKFLOW", { ...live, name: "Bản mới từ tab A", expectedVersion: 1, expectedDraftRevision: 0 });
  assert.throws(() => command(s, "SAVE_WORKFLOW", {
    ...live, name: "Bản cũ từ tab B", expectedVersion: 1, expectedDraftRevision: 0,
  }), /cập nhật ở tab khác/);
  const current = structuredClone(s.workflows[0]);
  s = command(s, "SAVE_WORKFLOW", {
    ...current, name: "Nháp mới từ tab A", published: false, expectedVersion: 2, expectedDraftRevision: 0,
  });
  assert.equal(s.workflows[0].draft.draftRevision, 1);
  assert.throws(() => command(s, "SAVE_WORKFLOW", {
    ...current, name: "Nháp cũ từ tab B", published: false, expectedVersion: 2, expectedDraftRevision: 0,
  }), /Bản nháp đã được cập nhật/);
  assert.equal(s.workflows[0].name, "Bản mới từ tab A");
  assert.equal(s.workflows[0].draft.name, "Nháp mới từ tab A");
});
test("Reducer is immutable and SLA timestamps retain first response", () => {
  const prev = initialState();
  const s = reduceCommand(prev, ticket(), at);
  assert.equal(prev.tickets.length, 0);
  assert.equal(prev.revision, 0);
  assert.equal(s.revision, 1);
});

test("Ungrouping preserves workflow and shared work, supports the final member and checks PMS rights", () => {
  let s = approved();
  s = reduceCommand(s, ticket("Plumbing", "Rò nước"), at);
  const ticketIds = s.tickets.map((t) => t.id);
  s = command(s, "GROUP_TICKETS", { name: "  Tầng 3  ", ticketIds });
  s = command(s, "CREATE_WO", { title: "Kiểm tra chung", ticketIds });
  const original = structuredClone(s);
  for (const role of ["tenant", "maintainer"]) {
    assert.throws(() => command(s, "UNGROUP_TICKETS", { ticketIds }, role), /PMS/);
  }
  for (const ids of [[], ["missing"], [ticketIds[0], "missing"]]) {
    assert.throws(() => command(s, "UNGROUP_TICKETS", { ticketIds: ids }), /đang thuộc nhóm/);
  }
  s = command(s, "UNGROUP_TICKETS", { ticketIds: [ticketIds[0], ticketIds[0]] });
  assert.equal(s.tickets[0].groupId, null);
  assert.equal(s.tickets[0].updatedBy, "pms-01");
  assert.equal(s.tickets[0].updatedAt, at);
  assert.equal(s.tickets[1].groupId, original.groups[0].id);
  assert.equal(original.tickets[0].groupId, original.groups[0].id);
  assert.deepEqual(s.runs, original.runs);
  assert.deepEqual(s.links, original.links);
  assert.deepEqual(s.workOrders, original.workOrders);
  assert.deepEqual(s.notifications, original.notifications);
  assert.ok(s.audit.some((a) => a.entityId === ticketIds[0] && a.event === "Đưa khỏi nhóm: Tầng 3"));
  assert.throws(() => command(s, "UNGROUP_TICKETS", { ticketIds: [ticketIds[0]] }), /đang thuộc nhóm/);
  s = command(s, "UNGROUP_TICKETS", { ticketIds: [ticketIds[1]] });
  assert.ok(s.tickets.every((t) => t.groupId === null));
  s = command(s, "GROUP_TICKETS", { name: "Nhóm mới", ticketIds });
  assert.ok(s.tickets.every((t) => t.groupId === s.groups[0].id));
  s = command(s, "UNGROUP_TICKETS", { ticketIds });
  assert.ok(s.tickets.every((t) => t.groupId === null));
});

test("Grouping requires two distinct existing tickets", () => {
  const s = reduceCommand(initialState(), ticket(), at);
  for (const ticketIds of [undefined, [], [s.tickets[0].id, s.tickets[0].id], [s.tickets[0].id, "missing"]]) {
    assert.throws(() => command(s, "GROUP_TICKETS", { name: "Nhóm", ticketIds }), /ít nhất 2 ticket/);
  }
});

test("An existing group and ungrouped tickets merge directly into the same two-level group", () => {
  let s = approved();
  s = reduceCommand(s, ticket("Plumbing", "Ticket B"), at);
  const members = s.tickets.map((t) => t.id);
  s = command(s, "GROUP_TICKETS", { name: "Nhóm A", ticketIds: members });
  const groupId = s.groups[0].id;
  s = reduceCommand(s, ticket("Plumbing", "Ticket C"), at);
  const extraId = s.tickets[0].id;
  const before = structuredClone(s);
  s = command(s, "GROUP_TICKETS", { groupId, ticketIds: [members[0], extraId] });
  assert.equal(s.groups.length, 1);
  assert.equal(s.groups[0].id, groupId);
  assert.equal(s.groups[0].name, "Nhóm A");
  assert.ok(s.tickets.every((t) => t.groupId === groupId));
  assert.deepEqual(s.runs, before.runs);
  assert.deepEqual(s.workOrders, before.workOrders);
  assert.deepEqual(s.links, before.links);
  assert.deepEqual(s.notifications, before.notifications);
  assert.throws(() => command(s, "GROUP_TICKETS", { groupId: "missing", ticketIds: members }), /không còn tồn tại/);
  assert.throws(() => command(s, "GROUP_TICKETS", { groupId, ticketIds: members }, "tenant"), /PMS/);
});

test("Merging groups moves their tickets to one flat destination group", () => {
  let s = initialState();
  for (const title of ["A", "B", "C", "D"]) s = reduceCommand(s, ticket("Plumbing", title), at);
  const ticketIds = s.tickets.map((t) => t.id);
  s = command(s, "GROUP_TICKETS", { name: "Nhóm A", ticketIds: ticketIds.slice(0, 2) });
  const groupId = s.groups[0].id;
  s = command(s, "GROUP_TICKETS", { name: "Nhóm B", ticketIds: ticketIds.slice(2) });
  s = command(s, "GROUP_TICKETS", { groupId, ticketIds });
  assert.ok(s.tickets.every((t) => t.groupId === groupId));
  assert.ok(s.groups.every((g) => !g.parentId && !g.groupId));
  assert.equal(s.groups.filter((g) => s.tickets.some((t) => t.groupId === g.id)).length, 1);
});
