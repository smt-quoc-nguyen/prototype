const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const listeners = new Map();
const root = { innerHTML: '' };
const location = { hash: '', search: '' };
const saved = new Map();
const document = {
  title: '',
  getElementById: () => root,
  querySelector: () => null,
  addEventListener(type, listener) {
    listeners.set(type, [...(listeners.get(type) || []), listener]);
  }
};
const context = {
  document, location, URLSearchParams,
  localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
  window: { location, scrollTo() {}, addEventListener() {} },
  setTimeout() {},
  FormData: class { constructor(form) { return Object.entries(form.values); } }
};
vm.createContext(context);
for (const file of ['workflow-studio.js', 'workflow-canvas.js', 'workflow-runs.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
}
const workflow = vm.runInContext('wfState', context);
const canvas = vm.runInContext('cbState', context);
const render = () => vm.runInContext('render()', context);
function clickAction(action) {
  const target = {
    closest(selector) {
      if (selector === '[data-wf-action]') return { dataset: { wfAction: action }, classList: { contains: () => false } };
      return null;
    }
  };
  for (const listener of listeners.get('click')) listener({ target });
}
function clickCanvasAction(action) {
  const target = {
    closest(selector) {
      if (selector === '[data-cb-action]') return { dataset: { cbAction: action } };
      return null;
    }
  };
  for (const listener of listeners.get('click')) listener({ target });
}
function clickRunAction(action) {
  const target = { closest(selector) { return selector === '[data-cb-run-action]' ? { dataset: { cbRunAction: action } } : null; } };
  for (const listener of listeners.get('click')) listener({ target });
}
function setCheck(index, checked = true) {
  const target = {
    id: '', checked, dataset: { wfCheck: String(index) },
    matches(selector) { return selector === '[data-wf-check]'; }
  };
  for (const listener of listeners.get('change')) listener({ target });
}
function select(id) {
  workflow.selectedCase = id;
  workflow.tab = 'detail';
  render();
  return workflow.cases.find(item => item.id === id);
}

assert.equal(workflow.tab, 'canvas');
assert.equal(canvas.nodes.length, 5);
assert.equal(canvas.edges.length, 4);
assert.equal(canvas.runs.length, 4, 'execution history opens with operational examples');
assert.ok(canvas.runs.some(run => run.status === 'waiting_approval'));
assert.ok(canvas.runs.some(run => run.status === 'waiting_time'));
assert.ok(canvas.runs.some(run => run.status === 'failed'));
workflow.tab = 'runs'; render();
assert.ok(root.innerHTML.includes('Lần chạy workflow'));
assert.ok(root.innerHTML.includes('Duyệt &amp; tiếp tục') || root.innerHTML.includes('Duyệt & tiếp tục'));
workflow.tab = 'canvas'; render();
assert.ok(root.innerHTML.includes('Thư viện node'));
vm.runInContext('cbRun()', context);
assert.deepEqual(Array.from(canvas.runResult.trace, row => row.id), ['n1', 'n2', 'n3', 'n4'], 'high budget follows the true branch');
assert.ok(canvas.runResult.trace[2].output.taskId.startsWith('TASK-'), 'task action emits an identifier');
assert.equal(canvas.runResult.trace[3].input.taskId, canvas.runResult.trace[2].output.taskId, 'next node receives action output');
canvas.runInput = JSON.stringify({ name: 'Khách B', budget: 10000000 });
vm.runInContext('cbRun()', context);
assert.deepEqual(Array.from(canvas.runResult.trace, row => row.id), ['n1', 'n2', 'n5'], 'low budget follows the false branch');
const beforeNodes = canvas.nodes.length;
canvas.pendingFrom = 'n4'; canvas.pendingBranch = 'default';
vm.runInContext("cbAdd('createBooking')", context);
assert.equal(canvas.nodes.length, beforeNodes + 1);
assert.ok(canvas.edges.some(edge => edge.from === 'n4' && edge.to === canvas.selectedNode));
vm.runInContext('cbRestore(cbState.history.pop())', context);
assert.equal(canvas.nodes.length, beforeNodes, 'undo restores graph');
vm.runInContext("cbLoadTemplate('booking')", context);
assert.equal(canvas.nodes.length, 4);
assert.ok(canvas.nodes.some(node => node.type === 'approval'));
vm.runInContext('cbRun()', context);
assert.equal(canvas.runResult.status, 'waiting_approval');
assert.equal(canvas.runResult.trace.length, 2);
clickRunAction('approve');
assert.equal(canvas.runResult.trace.length, 4);
assert.equal(canvas.runResult.status, 'completed');
assert.equal(canvas.runResult.trace[2].input.approvalStatus, 'Đã duyệt');
vm.runInContext("cbLoadTemplate('overdue')", context);
vm.runInContext('cbRun()', context);
assert.equal(canvas.runResult.status, 'waiting_time');
clickRunAction('finish-wait');
assert.equal(canvas.runResult.status, 'completed');
assert.equal(canvas.runResult.trace.length, 5, 'overdue balance follows the true branch after wait');
assert.equal(canvas.runResult.trace[3].input.waitStatus, 'Đã kết thúc');
canvas.runInput = JSON.stringify({ invoiceId: 'INV-1', daysOverdue: 3, balance: 0 });
vm.runInContext('cbRun()', context);
assert.equal(canvas.runResult.status, 'skipped', 'paid invoices do not fire an overdue trigger');
vm.runInContext("cbLoadTemplate('maintenance')", context);
assert.equal(canvas.nodes[0].type, 'triggerMaintenance', 'incident template starts from the maintenance event');
canvas.runFailureNode = 'n3';
vm.runInContext('cbRun()', context);
assert.equal(canvas.runResult.status, 'failed');
clickRunAction('retry');
assert.equal(canvas.runResult.trace.length, 5, 'retry records the failed attempt and successful re-execution');
assert.equal(canvas.runResult.status, 'completed');
canvas.runFailureNode = '';
canvas.runInput = JSON.stringify({ incidentId: 'MT-1', priority: 'Thấp' });
canvas.nodes[0].data.priority = 'Cao';
vm.runInContext('cbRun()', context);
assert.equal(canvas.runResult.status, 'skipped', 'trigger filter prevents unmatched events from running actions');
const bookingSample = canvas.runs.find(run => run.name === 'Đặt chỗ → hợp đồng' && run.status === 'waiting_approval');
canvas.selectedRun = bookingSample.id;
clickRunAction('reject');
assert.equal(bookingSample.status, 'rejected', 'rejected approvals stop their execution');
vm.runInContext('cbNewWorkflow()', context);
assert.equal(canvas.nodes.length, 0);
assert.equal(vm.runInContext('cbValidation().length', context), 2, 'blank workflow needs trigger and action');
clickCanvasAction('publish');
assert.equal(canvas.published, false, 'invalid graph cannot be published');
vm.runInContext("cbAdd('triggerManual')", context);
canvas.pendingFrom = canvas.selectedNode;
vm.runInContext("cbAdd('createTask')", context);
assert.equal(canvas.edges.length, 1);
assert.equal(vm.runInContext('cbValidation().length', context), 0);
for (const listener of listeners.get('change')) listener({ target: { id: 'cb-field-assignee', dataset: { cbField: 'assignee' }, value: 'Vận hành', matches: () => false } });
assert.equal(canvas.nodes[1].data.assignee, 'Vận hành');
assert.ok(saved.has('smartos-workflow-canvas-v1'), 'draft graph persists locally');
clickCanvasAction('publish');
assert.equal(canvas.published, true, 'valid graph can be published');
assert.equal(vm.runInContext("cbConnect(cbState.nodes[1].id, cbState.nodes[0].id)", context), false, 'cycles are rejected');

assert.equal(workflow.cases.length, 8);
workflow.tab = 'board'; render();
assert.equal((root.innerHTML.match(/class="wf-stage-node/g) || []).length, 8);
assert.ok(!root.innerHTML.includes('${state.tasks.length}'));

const lead = select('FL-2026-104');
clickAction('advance');
assert.equal(lead.stage, 1, 'cannot skip the viewing checklist');
setCheck(2);
clickAction('advance');
assert.equal(lead.stage, 2);
assert.ok(lead.activity.some(row => row.text.includes('Khóa căn 48 giờ')));

const contract = select('FL-2026-102');
clickAction('advance');
assert.equal(contract.stage, 3, 'contract cannot pass without approval and signature');
clickAction('approve');
setCheck(2);
clickAction('advance');
assert.equal(contract.stage, 4);
assert.ok(contract.activity.some(row => row.text.includes('lịch bàn giao')));

const rejected = select('FL-2026-103');
setCheck(2);
clickAction('advance');
setCheck(0);
setCheck(1);
clickAction('request-approval');
assert.equal(rejected.status, 'Chờ duyệt');
clickAction('reject');
assert.equal(rejected.status, 'Ngoại lệ');
assert.deepEqual(Array.from(rejected.checks[3]), [false, false, false]);
setCheck(0);
setCheck(1);
clickAction('request-approval');
clickAction('approve');
setCheck(2);
clickAction('advance');
assert.equal(rejected.stage, 4, 'rejected contract can be corrected and approved');

const renewal = select('FL-2026-099');
clickAction('renew');
assert.equal(renewal.stage, 3);
assert.equal(renewal.cycle, 2);
assert.equal(renewal.approval, 'none');

renewal.stage = 6;
renewal.checks[6] = [true, true, true];
clickAction('advance');
assert.equal(renewal.stage, 7);
assert.equal(renewal.status, 'Đang chạy', 'final checklist remains required');
clickAction('advance');
assert.equal(renewal.status, 'Đang chạy');
setCheck(0);
setCheck(1);
clickAction('advance');
assert.equal(renewal.status, 'Hoàn tất');

const before = workflow.cases.length;
workflow.modal = 'create';
const form = { id: 'wf-create-form', values: { name: 'Khách Thử', unit: 'A-1001 · The Metropole', budget: '20 triệu/tháng', source: 'Website', owner: 'Hoàng Linh' } };
for (const listener of listeners.get('submit')) listener({ target: form, preventDefault() {} });
assert.equal(workflow.cases.length, before + 1);
assert.equal(workflow.cases[0].stage, 0);
assert.ok(workflow.cases[0].activity.some(row => row.text.includes('Tạo việc tư vấn')));

console.log('Workflow builder and runs: branches, data flow, waits, approvals, rejection, retry, trigger filters, editing and publish gates passed. Rental lifecycle: 8 stages, renewal and checkout passed.');
