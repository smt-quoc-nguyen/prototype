// Local execution simulator for the node builder. Runs keep a graph snapshot so later edits cannot rewrite their history.
const cbRunLabels = {
  completed: ['Hoàn tất', 'green'], waiting_approval: ['Chờ phê duyệt', 'amber'], waiting_time: ['Đang chờ', 'blue'],
  failed: ['Lỗi', 'red'], rejected: ['Bị từ chối', 'red'], skipped: ['Không khớp trigger', 'gray'], running: ['Đang chạy', 'blue']
};
const cbRunById = id => cbState.runs.find(run => run.id === id);
const cbSelectedRun = () => cbRunById(cbState.selectedRun) || cbState.runs[0];
const cbRunNode = (run, id) => run.nodes.find(node => node.id === id);
const cbRunIsCurrent = run => JSON.stringify(run.nodes) === JSON.stringify(cbState.nodes) && JSON.stringify(run.edges) === JSON.stringify(cbState.edges);
const cbRunTime = () => new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const cbRunBadge = status => { const [label, tone] = cbRunLabels[status] || cbRunLabels.running; return `<span class="cb-run-status ${tone}">${label}</span>`; };

function cbTriggerMatch(node, payload) {
  const data = node.data || {};
  if (node.type === 'triggerLead' && data.source && data.source !== 'Tất cả' && payload.source !== data.source) return `Nguồn khách không phải ${data.source}.`;
  if (node.type === 'triggerBooking' && data.location && data.location !== 'Tất cả tòa nhà' && payload.location !== data.location) return `Tòa nhà không phải ${data.location}.`;
  if (node.type === 'triggerInvoice' && (!Number.isFinite(Number(payload.daysOverdue)) || Number(payload.daysOverdue) < Number(data.days || 0) || !Number.isFinite(Number(payload.balance)) || Number(payload.balance) <= 0)) return `Hóa đơn chưa quá hạn ${data.days} ngày hoặc không còn dư nợ.`;
  if (node.type === 'triggerMaintenance' && data.priority && data.priority !== 'Tất cả' && payload.priority !== data.priority) return `Mức ưu tiên không phải ${data.priority}.`;
  if (node.type === 'triggerContractExpiry' && (!Number.isFinite(Number(payload.daysToExpiry)) || Number(payload.daysToExpiry) < 0 || Number(payload.daysToExpiry) > Number(data.daysBefore || 30))) return `Hợp đồng chưa ở khoảng 0–${data.daysBefore || 30} ngày trước hạn.`;
  return null;
}
function cbMakeRun({ name, version, nodes, edges, triggerId, payload, failureNode = '' }) {
  const next = Math.max(0, ...cbState.runs.map(run => Number(run.id.split('-').at(-1)) || 0)) + 1;
  const trigger = nodes.find(node => node.id === triggerId);
  return {
    id: `RUN-${String(next).padStart(3, '0')}`, name, version, createdAt: cbRunTime(), triggerId,
    triggerLabel: trigger?.label || 'Trigger', payload: cbClone(payload), nodes: cbClone(nodes), edges: cbClone(edges),
    queue: [{ id: triggerId, input: cbClone(payload) }], trace: [], status: 'running', waitingNode: null, waitingData: null,
    output: cbClone(payload), error: null, failureNode, failureFired: false
  };
}
function cbNodeOutput(run, node, input) {
  const suffix = run.id.split('-').at(-1);
  switch (node.type) {
    case 'createTask': return { taskId: `TASK-${suffix}` };
    case 'createBooking': return { bookingId: `BK-${suffix}`, heldUnit: cbInterpolate(node.data.unit, input) };
    case 'createContract': return { contractId: `HD-${suffix}`, contractStatus: 'Bản nháp' };
    case 'createInvoice': return { invoiceId: `INV-${suffix}`, invoiceStatus: 'Chờ thanh toán' };
    case 'sendNotification': return { notificationStatus: 'Đã xếp hàng gửi (mô phỏng)' };
    case 'updateRecord': return { recordStatus: node.data.status || 'Đã cập nhật' };
    default: return {};
  }
}
function cbRunStep(run, node, status, message, branch = 'default', input = {}, output = input) {
  run.trace.push({ id: node.id, title: node.label, type: node.type, status, message, branch, at: cbRunTime(), input: cbClone(input), output: cbClone(output) });
}
function cbAdvanceRun(run) {
  let steps = 0;
  while (run.queue.length && steps < 50) {
    steps += 1;
    const entry = run.queue.shift(), id = typeof entry === 'string' ? entry : entry.id;
    const input = cbClone(typeof entry === 'string' ? run.payload : entry.input);
    const node = cbRunNode(run, id);
    if (!node) { run.status = 'failed'; run.error = `Không tìm thấy node ${id}.`; break; }
    if (node.type.startsWith('trigger')) {
      const reason = cbTriggerMatch(node, input);
      if (reason) { cbRunStep(run, node, 'skipped', reason, 'default', input); run.status = 'skipped'; run.queue = []; break; }
    }
    if (id === run.failureNode && !run.failureFired) {
      run.failureFired = true; run.status = 'failed'; run.error = `Mô phỏng lỗi khi chạy action “${node.label}”.`;
      cbRunStep(run, node, 'failed', run.error, 'default', input); run.queue.unshift({ id, input }); break;
    }
    const outcome = cbExecuteNode(node, input);
    if (node.type === 'wait' || node.type === 'approval') {
      cbRunStep(run, node, 'waiting', outcome.message, 'default', input);
      run.waitingNode = id; run.waitingData = input;
      run.status = node.type === 'wait' ? 'waiting_time' : 'waiting_approval';
      break;
    }
    const output = { ...input, ...cbNodeOutput(run, node, input) };
    run.output = cbClone(output);
    cbRunStep(run, node, 'completed', outcome.message, outcome.branch || 'default', input, output);
    const outputs = run.edges.filter(edge => edge.from === id && (node.type !== 'condition' || edge.branch === outcome.branch));
    if (node.type === 'condition' && !outputs.length) {
      run.status = 'failed'; run.error = `Nhánh ${outcome.branch === 'true' ? 'Đúng' : 'Sai'} của “${node.label}” chưa được nối.`;
      run.trace.at(-1).status = 'failed'; break;
    }
    run.queue.push(...outputs.map(edge => ({ id: edge.to, input: cbClone(output) })));
  }
  if (steps >= 50 && run.queue.length) { run.status = 'failed'; run.error = 'Đã vượt giới hạn 50 bước mô phỏng.'; }
  else if (run.status === 'running' && !run.queue.length) run.status = 'completed';
  if (cbRunIsCurrent(run)) cbState.runResult = { id: run.id, trace: run.trace, payload: run.payload, status: run.status };
  cbPersist();
}
function cbStartRun() {
  let payload;
  try { payload = JSON.parse(cbState.runInput); if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Input phải là JSON object.'); }
  catch (error) { cbState.runResult = { error: `JSON không hợp lệ: ${error.message}` }; cbRender(); return; }
  const trigger = cbNode(cbState.runTrigger) || cbState.nodes.find(node => cbDef(node).kind === 'trigger');
  if (!trigger) { cbState.runResult = { error: 'Workflow cần ít nhất một Trigger.' }; cbRender(); return; }
  const run = cbMakeRun({ name: cbState.name, version: cbState.published ? `v${cbState.version}` : 'Bản nháp', nodes: cbState.nodes, edges: cbState.edges, triggerId: trigger.id, payload, failureNode: cbState.runFailureNode });
  cbState.runs.unshift(run); cbState.runs = cbState.runs.slice(0, 30); cbState.selectedRun = run.id;
  cbAdvanceRun(run); cbRender();
}
function cbResolveRun(run, action) {
  if (!run) return;
  if (action === 'retry' && run.status === 'failed' && run.queue.length) { run.status = 'running'; run.error = null; cbAdvanceRun(run); }
  else if (['approve', 'finish-wait'].includes(action) && ['waiting_approval', 'waiting_time'].includes(run.status)) {
    const node = cbRunNode(run, run.waitingNode);
    if (!node || (action === 'approve' && node.type !== 'approval') || (action === 'finish-wait' && node.type !== 'wait')) return;
    const last = run.trace.at(-1); last.status = 'completed'; last.message += action === 'approve' ? ' · Đã phê duyệt.' : ' · Hết thời gian chờ (mô phỏng).';
    const output = { ...(run.waitingData || last.input || run.payload), ...(action === 'approve' ? { approvalStatus: 'Đã duyệt' } : { waitStatus: 'Đã kết thúc' }) };
    last.output = cbClone(output); run.output = cbClone(output);
    run.queue.push(...run.edges.filter(edge => edge.from === node.id).map(edge => ({ id: edge.to, input: cbClone(output) })));
    run.waitingNode = null; run.waitingData = null; run.status = 'running'; cbAdvanceRun(run);
  } else if (action === 'reject' && run.status === 'waiting_approval') {
    const last = run.trace.at(-1); last.status = 'rejected'; last.message += ' · Người duyệt từ chối.';
    last.output = { ...(run.waitingData || last.input || run.payload), approvalStatus: 'Bị từ chối' };
    run.output = cbClone(last.output); run.waitingNode = null; run.waitingData = null; run.queue = []; run.status = 'rejected';
    if (cbRunIsCurrent(run)) cbState.runResult = { id: run.id, trace: run.trace, payload: run.payload, status: run.status }; cbPersist();
  }
  cbRender();
}
function cbRunActions(run) {
  if (!run) return '';
  if (run.status === 'waiting_approval') return `<button class="btn primary" data-cb-run-action="approve">${icon('check', 13)} Duyệt & tiếp tục</button><button class="btn" data-cb-run-action="reject">Từ chối</button>`;
  if (run.status === 'waiting_time') return `<button class="btn primary" data-cb-run-action="finish-wait">${icon('clock', 13)} Giả lập hết thời gian chờ</button>`;
  if (run.status === 'failed' && run.queue.length) return `<button class="btn primary" data-cb-run-action="retry">${icon('arrow', 13)} Thử lại node lỗi</button>`;
  return '';
}
function cbRunTrace(run) {
  return run.trace.map((step, index) => `<div class="cb-trace-step ${step.status}"><span class="cb-trace-number">${index + 1}</span><div><strong>${esc(step.title)}</strong><small>${esc(step.message)}</small><em>${esc(step.at)} · ${step.branch === 'true' ? 'Nhánh Đúng' : step.branch === 'false' ? 'Nhánh Sai' : cbDefinitions[step.type]?.kind.toUpperCase() || 'NODE'}</em><details class="cb-node-data"><summary>Xem input / output</summary><div><section><b>INPUT</b><pre>${esc(JSON.stringify(step.input || run.payload, null, 2))}</pre></section><section><b>OUTPUT</b><pre>${esc(JSON.stringify(step.output || step.input || run.payload, null, 2))}</pre></section></div></details></div><span class="cb-trace-state">${step.status === 'completed' ? '✓' : step.status === 'waiting' ? '…' : step.status === 'skipped' ? '–' : '!'}</span></div>`).join('');
}

function cbRunOverview(run) {
  if (!run) return '<p class="cb-run-empty">Chưa có lần chạy nào.</p>';
  return `<div class="cb-run-overview"><div><small>${esc(run.id)} · ${esc(run.createdAt)} · ${esc(run.version)}</small><h3>${esc(run.name)}</h3><p>Bắt đầu từ ${esc(run.triggerLabel)} · ${run.trace.length} node đã xử lý</p></div>${cbRunBadge(run.status)}</div>${run.error ? `<p class="cb-run-alert">${esc(run.error)}</p>` : ''}<div class="cb-run-steps">${cbRunTrace(run)}</div><div class="cb-run-controls">${cbRunActions(run)}</div>`;
}
function cbRunsView() {
  const run = cbSelectedRun();
  const counts = { completed: cbState.runs.filter(item => item.status === 'completed').length, waiting: cbState.runs.filter(item => item.status.startsWith('waiting')).length, failed: cbState.runs.filter(item => item.status === 'failed').length };
  return `<div class="cb-runs-hero card"><div><span class="cb-kicker">EXECUTIONS / MONITORING</span><h2>Lần chạy workflow</h2><p>Mỗi lần chạy giữ nguyên phiên bản sơ đồ, dữ liệu đầu vào và kết quả từng node. Chọn một dòng để xem chi tiết hoặc tiếp tục bước đang chờ.</p></div><button class="btn primary" data-cb-run-action="builder">${icon('workflow', 14)} Mở trình dựng luồng</button></div><div class="cb-runs-stats"><div class="card"><strong>${cbState.runs.length}</strong><span>Tổng lần chạy</span></div><div class="card"><strong>${counts.completed}</strong><span>Hoàn tất</span></div><div class="card"><strong>${counts.waiting}</strong><span>Đang chờ</span></div><div class="card"><strong>${counts.failed}</strong><span>Cần xử lý lỗi</span></div></div><div class="cb-runs-layout"><section class="card cb-runs-list"><div class="cb-runs-section-head"><strong>Danh sách lần chạy</strong><small>Mới nhất trước</small></div>${cbState.runs.map(item => `<button class="cb-run-row ${run?.id === item.id ? 'active' : ''}" data-cb-run-select="${item.id}"><span><strong>${esc(item.name)}</strong><small>${esc(item.id)} · ${esc(item.createdAt)} · ${esc(item.triggerLabel)}</small></span>${cbRunBadge(item.status)}</button>`).join('') || '<p class="cb-run-empty">Chạy thử một workflow trong trình dựng để xem lịch sử.</p>'}</section><section class="card cb-runs-detail">${cbRunOverview(run)}${run ? `<div class="cb-run-payload"><section><strong>Dữ liệu sự kiện ban đầu</strong><pre>${esc(JSON.stringify(run.payload, null, 2))}</pre></section><section><strong>Dữ liệu sau node gần nhất</strong><pre>${esc(JSON.stringify(run.output || run.payload, null, 2))}</pre></section></div>` : ''}</section></div>`;
}

document.addEventListener('click', event => {
  const select = event.target.closest('[data-cb-run-select]');
  if (select) { cbState.selectedRun = select.dataset.cbRunSelect; cbPersist(); render(); return; }
  const button = event.target.closest('[data-cb-run-action]');
  if (!button) return;
  if (button.dataset.cbRunAction === 'builder') { wfState.tab = 'canvas'; render(); return; }
  if (button.dataset.cbRunAction === 'view-runs') { wfState.tab = 'runs'; render(); return; }
  cbResolveRun(cbSelectedRun(), button.dataset.cbRunAction);
});

// Initial examples make the operational states visible before the viewer creates a run.
if (!cbSaved?.runs) {
  for (const [key, failureType] of [['lead', ''], ['booking', ''], ['overdue', ''], ['maintenance', 'sendNotification']]) {
    const template = cbTemplates[key];
    const run = cbMakeRun({ name: template.title, version: 'v1', nodes: template.nodes, edges: template.edges, triggerId: template.nodes[0].id, payload: template.payload, failureNode: template.nodes.find(node => node.type === failureType)?.id || '' });
    cbState.runs.unshift(run); cbAdvanceRun(run);
    if (key === 'booking') cbState.selectedRun = run.id;
  }
  cbState.runResult = null;
  cbPersist();
}
const cbRequestedRun = new URLSearchParams(location.search).get('runId');
if (cbRunById(cbRequestedRun)) cbState.selectedRun = cbRequestedRun;
