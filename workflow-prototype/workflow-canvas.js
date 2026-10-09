// n8n-style workflow canvas. This is a local simulation; no actions call backend services.
const cbDefinitions = {
  triggerLead: { kind: 'trigger', title: 'Khách hàng mới', subtitle: 'customer.created', icon: 'users', description: 'Kích hoạt khi có lead mới từ CRM.', fields: [{ key: 'source', label: 'Nguồn khách', type: 'select', options: ['Tất cả', 'Website', 'Zalo', 'Đối tác', 'Giới thiệu'] }] },
  triggerBooking: { kind: 'trigger', title: 'Đặt chỗ xác nhận', subtitle: 'booking.confirmed', icon: 'calendar', description: 'Kích hoạt sau khi đặt chỗ được xác nhận.', fields: [{ key: 'location', label: 'Tòa nhà', type: 'text', placeholder: 'Tất cả tòa nhà' }] },
  triggerInvoice: { kind: 'trigger', title: 'Hóa đơn quá hạn', subtitle: 'invoice.overdue', icon: 'receipt', description: 'Kích hoạt khi hóa đơn có số dư quá hạn.', fields: [{ key: 'days', label: 'Quá hạn sau (ngày)', type: 'number', placeholder: '3' }] },
  triggerMaintenance: { kind: 'trigger', title: 'Sự cố mới', subtitle: 'maintenance.created', icon: 'tool', description: 'Kích hoạt khi cư dân gửi yêu cầu bảo trì.', fields: [{ key: 'priority', label: 'Mức ưu tiên', type: 'select', options: ['Tất cả', 'Cao', 'Trung bình', 'Thấp'] }] },
  triggerContractExpiry: { kind: 'trigger', title: 'Hợp đồng sắp hết hạn', subtitle: 'contract.expiring', icon: 'file', description: 'Kích hoạt trước ngày hết hạn hợp đồng.', fields: [{ key: 'daysBefore', label: 'Trước hạn (ngày)', type: 'number', placeholder: '30' }] },
  triggerSchedule: { kind: 'trigger', title: 'Theo lịch', subtitle: 'schedule', icon: 'clock', description: 'Chạy luồng vào một thời điểm định kỳ.', fields: [{ key: 'schedule', label: 'Lịch chạy', type: 'select', options: ['Mỗi ngày 09:00', 'Mỗi thứ Hai 09:00', 'Ngày 01 hằng tháng'] }] },
  triggerManual: { kind: 'trigger', title: 'Chạy thủ công', subtitle: 'manual', icon: 'spark', description: 'Khởi chạy khi nhân viên nhấn Chạy thử.', fields: [] },
  condition: { kind: 'logic', title: 'Điều kiện', subtitle: 'IF / ELSE', icon: 'workflow', description: 'Rẽ nhánh theo dữ liệu đầu vào.', fields: [{ key: 'field', label: 'Trường dữ liệu', type: 'text', placeholder: 'budget' }, { key: 'operator', label: 'Phép so sánh', type: 'select', options: ['>=', '>', '=', '<', 'contains'] }, { key: 'value', label: 'Giá trị so sánh', type: 'text', placeholder: '20000000' }] },
  wait: { kind: 'logic', title: 'Chờ', subtitle: 'Delay', icon: 'clock', description: 'Tạm dừng trước khi tiếp tục.', fields: [{ key: 'duration', label: 'Thời gian chờ', type: 'text', placeholder: '2 giờ' }] },
  approval: { kind: 'logic', title: 'Phê duyệt', subtitle: 'Human approval', icon: 'shield', description: 'Giao một người xét duyệt trước khi đi tiếp.', fields: [{ key: 'approver', label: 'Người phê duyệt', type: 'select', options: ['Quản lý tòa nhà', 'Trưởng kinh doanh', 'Bộ phận pháp lý'] }, { key: 'deadline', label: 'Hạn duyệt', type: 'text', placeholder: '24 giờ' }] },
  createTask: { kind: 'action', title: 'Tạo công việc', subtitle: 'operations.task', icon: 'workflow', description: 'Giao việc cho người phụ trách.', fields: [{ key: 'assignee', label: 'Giao cho', type: 'select', options: ['Tư vấn viên', 'Quản lý tòa nhà', 'Vận hành', 'Kế toán'] }, { key: 'taskTitle', label: 'Tên công việc', type: 'text', placeholder: 'Liên hệ khách {{name}}' }, { key: 'due', label: 'Hạn hoàn thành', type: 'text', placeholder: 'Trong 4 giờ' }] },
  sendNotification: { kind: 'action', title: 'Gửi thông báo', subtitle: 'notification.send', icon: 'bell', description: 'Gửi tin nhắn cho khách hoặc nhân viên.', fields: [{ key: 'channel', label: 'Kênh gửi', type: 'select', options: ['Zalo', 'Email', 'In-app', 'SMS'] }, { key: 'recipient', label: 'Người nhận', type: 'select', options: ['Khách hàng', 'Người phụ trách', 'Quản lý'] }, { key: 'message', label: 'Nội dung', type: 'textarea', placeholder: 'Chào {{name}}, ...' }] },
  createBooking: { kind: 'action', title: 'Tạo đặt chỗ', subtitle: 'reservation.create', icon: 'key', description: 'Giữ căn và tạo phiếu đặt chỗ.', fields: [{ key: 'unit', label: 'Mã căn', type: 'text', placeholder: '{{unit}}' }, { key: 'holdHours', label: 'Giữ trong (giờ)', type: 'number', placeholder: '48' }] },
  createContract: { kind: 'action', title: 'Tạo hợp đồng', subtitle: 'contract.create', icon: 'file', description: 'Tạo dự thảo từ mẫu hợp đồng.', fields: [{ key: 'template', label: 'Mẫu hợp đồng', type: 'select', options: ['Thuê căn hộ', 'Thuê văn phòng', 'Phụ lục gia hạn'] }, { key: 'sendForApproval', label: 'Sau khi tạo', type: 'select', options: ['Gửi phê duyệt', 'Lưu bản nháp'] }] },
  createInvoice: { kind: 'action', title: 'Tạo hóa đơn', subtitle: 'payment.invoice', icon: 'wallet', description: 'Lập khoản phải thu cho khách thuê.', fields: [{ key: 'invoiceType', label: 'Loại hóa đơn', type: 'select', options: ['Tiền thuê', 'Phí dịch vụ', 'Tiền cọc'] }, { key: 'dueDays', label: 'Hạn sau (ngày)', type: 'number', placeholder: '7' }] },
  updateRecord: { kind: 'action', title: 'Cập nhật trạng thái', subtitle: 'record.update', icon: 'check', description: 'Ghi trạng thái mới vào hồ sơ.', fields: [{ key: 'entity', label: 'Đối tượng', type: 'select', options: ['Khách hàng', 'Đặt chỗ', 'Hợp đồng', 'Sự cố'] }, { key: 'status', label: 'Trạng thái mới', type: 'text', placeholder: 'Đang tư vấn' }] },
  end: { kind: 'action', title: 'Kết thúc luồng', subtitle: 'finish', icon: 'check', description: 'Đánh dấu luồng chạy xong.', fields: [] }
};

const cbTemplates = {
  lead: {
    title: 'Chăm sóc lead bất động sản', description: 'Lead mới → phân loại theo ngân sách → giao việc và gửi tin.',
    payload: { name: 'Nguyễn Minh Anh', source: 'Website', budget: 28000000, unit: 'A-1208', phone: '090 384 2026' },
    nodes: [
      { id: 'n1', type: 'triggerLead', x: 40, y: 160, label: 'Khách hàng mới', data: { source: 'Tất cả' } },
      { id: 'n2', type: 'condition', x: 300, y: 160, label: 'Ngân sách từ 20 triệu?', data: { field: 'budget', operator: '>=', value: '20000000' } },
      { id: 'n3', type: 'createTask', x: 560, y: 35, label: 'Giao tư vấn viên', data: { assignee: 'Tư vấn viên', taskTitle: 'Tư vấn căn phù hợp cho {{name}}', due: 'Trong 4 giờ' } },
      { id: 'n4', type: 'sendNotification', x: 820, y: 35, label: 'Gửi xác nhận', data: { channel: 'Zalo', recipient: 'Khách hàng', message: 'Chào {{name}}, tư vấn viên sẽ liên hệ bạn sớm.' } },
      { id: 'n5', type: 'sendNotification', x: 560, y: 340, label: 'Gửi gợi ý khác', data: { channel: 'Email', recipient: 'Khách hàng', message: 'Chào {{name}}, chúng tôi có lựa chọn phù hợp ngân sách của bạn.' } }
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', branch: 'default' },
      { id: 'e2', from: 'n2', to: 'n3', branch: 'true' },
      { id: 'e3', from: 'n2', to: 'n5', branch: 'false' },
      { id: 'e4', from: 'n3', to: 'n4', branch: 'default' }
    ]
  },
  booking: {
    title: 'Đặt chỗ → hợp đồng', description: 'Booking xác nhận → quản lý duyệt → tạo hợp đồng → thông báo.',
    payload: { name: 'Trần Hoàng Nam', bookingId: 'BK-2026-103', unit: 'A-0905', location: 'Rivergate', amount: 18500000 },
    nodes: [
      { id: 'n1', type: 'triggerBooking', x: 65, y: 300, label: 'Đặt chỗ xác nhận', data: { location: 'Tất cả tòa nhà' } },
      { id: 'n2', type: 'approval', x: 355, y: 300, label: 'Duyệt hồ sơ thuê', data: { approver: 'Quản lý tòa nhà', deadline: '24 giờ' } },
      { id: 'n3', type: 'createContract', x: 655, y: 300, label: 'Tạo hợp đồng thuê', data: { template: 'Thuê căn hộ', sendForApproval: 'Gửi phê duyệt' } },
      { id: 'n4', type: 'sendNotification', x: 955, y: 300, label: 'Báo khách ký hợp đồng', data: { channel: 'Email', recipient: 'Khách hàng', message: 'Hợp đồng của {{name}} đã sẵn sàng.' } }
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', branch: 'default' }, { id: 'e2', from: 'n2', to: 'n3', branch: 'default' }, { id: 'e3', from: 'n3', to: 'n4', branch: 'default' }]
  },
  overdue: {
    title: 'Nhắc phí quá hạn', description: 'Hóa đơn quá hạn → nhắc khách → chờ → kiểm tra dư nợ.',
    payload: { name: 'Công ty Orion', invoiceId: 'INV-2609-081', balance: 74800000, daysOverdue: 3 },
    nodes: [
      { id: 'n1', type: 'triggerInvoice', x: 65, y: 305, label: 'Hóa đơn quá hạn', data: { days: 3 } },
      { id: 'n2', type: 'sendNotification', x: 355, y: 305, label: 'Nhắc thanh toán', data: { channel: 'Email', recipient: 'Khách hàng', message: 'Hóa đơn {{invoiceId}} đang quá hạn. Vui lòng thanh toán.' } },
      { id: 'n3', type: 'wait', x: 655, y: 305, label: 'Chờ 2 ngày', data: { duration: '2 ngày' } },
      { id: 'n4', type: 'condition', x: 945, y: 305, label: 'Còn dư nợ?', data: { field: 'balance', operator: '>', value: '0' } },
      { id: 'n5', type: 'createTask', x: 1240, y: 155, label: 'Giao kế toán xử lý', data: { assignee: 'Kế toán', taskTitle: 'Theo dõi công nợ {{invoiceId}}', due: 'Trong 1 ngày' } },
      { id: 'n6', type: 'end', x: 1240, y: 490, label: 'Đã thanh toán', data: {} }
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', branch: 'default' }, { id: 'e2', from: 'n2', to: 'n3', branch: 'default' }, { id: 'e3', from: 'n3', to: 'n4', branch: 'default' }, { id: 'e4', from: 'n4', to: 'n5', branch: 'true' }, { id: 'e5', from: 'n4', to: 'n6', branch: 'false' }]
  },
  maintenance: {
    title: 'Tiếp nhận sự cố', description: 'Báo sự cố → giao vận hành → báo khách → cập nhật trạng thái.',
    payload: { name: 'Lê Thảo Vy', incidentId: 'MT-028', unit: 'B-1806', priority: 'Cao' },
    nodes: [
      { id: 'n1', type: 'triggerMaintenance', x: 65, y: 300, label: 'Sự cố mới', data: { priority: 'Tất cả' } },
      { id: 'n2', type: 'createTask', x: 355, y: 300, label: 'Giao kỹ thuật', data: { assignee: 'Vận hành', taskTitle: 'Xử lý sự cố {{incidentId}}', due: 'Trong 2 giờ' } },
      { id: 'n3', type: 'sendNotification', x: 655, y: 300, label: 'Thông báo cho khách', data: { channel: 'Zalo', recipient: 'Khách hàng', message: 'Yêu cầu {{incidentId}} đã được tiếp nhận.' } },
      { id: 'n4', type: 'updateRecord', x: 955, y: 300, label: 'Cập nhật ticket', data: { entity: 'Sự cố', status: 'Đang xử lý' } }
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', branch: 'default' }, { id: 'e2', from: 'n2', to: 'n3', branch: 'default' }, { id: 'e3', from: 'n3', to: 'n4', branch: 'default' }]
  }
};

const cbClone = value => JSON.parse(JSON.stringify(value));
const cbStorageKey = 'smartos-workflow-canvas-v1';
let cbSaved;
try { cbSaved = JSON.parse(localStorage.getItem(cbStorageKey) || 'null'); } catch { cbSaved = null; }
const cbQueryTemplate = new URLSearchParams(location.search).get('template');
const cbUseQueryTemplate = Boolean(cbTemplates[cbQueryTemplate]);
const cbInitialTemplate = cbUseQueryTemplate ? cbQueryTemplate : cbSaved?.template === 'custom' ? 'custom' : cbTemplates[cbSaved?.template] ? cbSaved.template : 'lead';
const cbState = {
  name: cbUseQueryTemplate ? cbTemplates[cbInitialTemplate].title : cbSaved?.name || cbTemplates.lead.title,
  template: cbInitialTemplate,
  nodes: cbUseQueryTemplate ? cbClone(cbTemplates[cbInitialTemplate].nodes) : cbSaved?.nodes || cbClone(cbTemplates.lead.nodes),
  edges: cbUseQueryTemplate ? cbClone(cbTemplates[cbInitialTemplate].edges) : cbSaved?.edges || cbClone(cbTemplates.lead.edges),
  version: cbSaved?.version || 1,
  published: cbSaved?.published || false,
  selectedNode: cbUseQueryTemplate ? cbTemplates[cbInitialTemplate].nodes[0].id : cbSaved?.selectedNode || 'n2',
  selectedEdge: null,
  pendingFrom: null,
  pendingBranch: 'default',
  paletteQuery: '',
  zoom: cbInitialTemplate === 'overdue' ? 0.73 : 0.78,
  runInput: JSON.stringify(cbTemplates[cbInitialTemplate]?.payload || { name: 'Khách hàng mẫu', unit: 'A-1208' }, null, 2),
  runTrigger: null,
  runFailureNode: '',
  runResult: null,
  runs: Array.isArray(cbSaved?.runs) ? cbSaved.runs : [],
  selectedRun: cbSaved?.selectedRun || null,
  history: [], future: []
};
const cbNode = id => cbState.nodes.find(node => node.id === id);
const cbDef = node => cbDefinitions[node.type];
function cbPersist() {
  try { localStorage.setItem(cbStorageKey, JSON.stringify({ name: cbState.name, template: cbState.template, nodes: cbState.nodes, edges: cbState.edges, version: cbState.version, published: cbState.published, selectedNode: cbState.selectedNode, runs: cbState.runs, selectedRun: cbState.selectedRun })); } catch { /* Local file may not expose storage. */ }
}
function cbSnapshot() { return cbClone({ name: cbState.name, template: cbState.template, nodes: cbState.nodes, edges: cbState.edges, version: cbState.version, published: cbState.published }); }
function cbRemember() { cbState.history.push(cbSnapshot()); if (cbState.history.length > 40) cbState.history.shift(); cbState.future.length = 0; }
function cbRestore(snapshot) { Object.assign(cbState, cbClone(snapshot)); cbState.selectedNode = cbState.nodes[0]?.id || null; cbState.selectedEdge = null; cbState.runResult = null; cbPersist(); cbRender(); }
function cbCommit() { cbState.published = false; cbState.runResult = null; cbPersist(); cbRender(); }
function cbRender() {
  const old = document.querySelector('.cb-viewport');
  const x = old?.scrollLeft || 0, y = old?.scrollTop || 0;
  render();
  const next = document.querySelector('.cb-viewport');
  if (next) { next.scrollLeft = x; next.scrollTop = y; }
}
function cbLoadTemplate(key) {
  if (!cbTemplates[key]) return;
  cbRemember();
  cbState.template = key;
  cbState.name = cbTemplates[key].title;
  cbState.nodes = cbClone(cbTemplates[key].nodes);
  cbState.edges = cbClone(cbTemplates[key].edges);
  cbState.selectedNode = cbState.nodes[0].id;
  cbState.selectedEdge = null;
  cbState.pendingFrom = null;
  cbState.runInput = JSON.stringify(cbTemplates[key].payload, null, 2);
  cbState.runTrigger = null;
  cbState.runFailureNode = '';
  cbState.zoom = key === 'overdue' ? 0.73 : 0.78;
  cbCommit();
  if (window.innerWidth >= 1200) cbFit();
}
function cbNewWorkflow() {
  cbRemember();
  cbState.name = 'Workflow mới';
  cbState.template = 'custom';
  cbState.nodes = [];
  cbState.edges = [];
  cbState.selectedNode = null;
  cbState.selectedEdge = null;
  cbState.pendingFrom = null;
  cbState.runInput = '{\n  "name": "Khách hàng mẫu",\n  "unit": "A-1208"\n}';
  cbState.runFailureNode = '';
  cbCommit();
}
function cbUniqueId(prefix, items) { let n = 1; while (items.some(item => item.id === `${prefix}${n}`)) n += 1; return `${prefix}${n}`; }
function cbHasPath(from, target, seen = new Set()) { if (from === target) return true; if (seen.has(from)) return false; seen.add(from); return cbState.edges.filter(edge => edge.from === from).some(edge => cbHasPath(edge.to, target, seen)); }
function cbConnect(from, to, branch = 'default') {
  if (!cbNode(from) || !cbNode(to) || from === to || cbHasPath(to, from) || cbNode(from).type === 'end' || cbDef(cbNode(to)).kind === 'trigger') { notify('Kết nối không hợp lệ: không thể nối vòng lặp, sau node Kết thúc hoặc vào Trigger.'); return false; }
  if (cbState.edges.some(edge => edge.from === from && edge.to === to && edge.branch === branch)) { notify('Kết nối này đã tồn tại.'); return false; }
  cbRemember();
  if (cbNode(from).type === 'condition') cbState.edges = cbState.edges.filter(edge => !(edge.from === from && edge.branch === branch));
  cbState.edges.push({ id: cbUniqueId('e', cbState.edges), from, to, branch });
  cbState.pendingFrom = null;
  cbCommit();
  return true;
}
function cbAdd(type) {
  const def = cbDefinitions[type]; if (!def) return;
  cbRemember();
  const source = cbNode(cbState.pendingFrom || cbState.selectedNode);
  const node = {
    id: cbUniqueId('n', cbState.nodes), type,
    x: source ? Math.min(source.x + 290, 1410) : 80 + (cbState.nodes.length % 3) * 30,
    y: source ? Math.max(80, Math.min(source.y + (cbState.pendingBranch === 'false' ? 175 : 0), 690)) : 250 + (cbState.nodes.length % 3) * 30,
    label: def.title,
    data: Object.fromEntries(def.fields.map(field => [field.key, field.options?.[0] || field.placeholder || '']))
  };
  cbState.nodes.push(node);
  if (cbState.pendingFrom && def.kind !== 'trigger' && cbNode(cbState.pendingFrom)?.type !== 'end') {
    if (cbNode(cbState.pendingFrom)?.type === 'condition') cbState.edges = cbState.edges.filter(edge => !(edge.from === cbState.pendingFrom && edge.branch === cbState.pendingBranch));
    cbState.edges.push({ id: cbUniqueId('e', cbState.edges), from: cbState.pendingFrom, to: node.id, branch: cbState.pendingBranch });
  }
  cbState.selectedNode = node.id;
  cbState.selectedEdge = null;
  cbState.pendingFrom = null;
  cbCommit();
}
function cbDeleteNode() {
  if (!cbState.selectedNode) return;
  cbRemember();
  cbState.nodes = cbState.nodes.filter(node => node.id !== cbState.selectedNode);
  cbState.edges = cbState.edges.filter(edge => edge.from !== cbState.selectedNode && edge.to !== cbState.selectedNode);
  cbState.selectedNode = cbState.nodes[0]?.id || null;
  cbCommit();
}
function cbDuplicateNode() {
  const source = cbNode(cbState.selectedNode); if (!source) return;
  cbRemember();
  const copy = cbClone(source);
  copy.id = cbUniqueId('n', cbState.nodes);
  copy.label += ' (bản sao)'; copy.x = Math.min(copy.x + 40, 1410); copy.y = Math.min(copy.y + 145, 690);
  cbState.nodes.push(copy); cbState.selectedNode = copy.id; cbCommit();
}
function cbEdgePoints(edge) {
  const from = cbNode(edge.from), to = cbNode(edge.to);
  if (!from || !to) return null;
  const x1 = from.x + 220, y1 = from.y + (from.type === 'condition' ? edge.branch === 'false' ? 101 : 52 : 61);
  const x2 = to.x, y2 = to.y + 61;
  const bend = Math.max(75, (x2 - x1) * .52);
  return { x1, y1, x2, y2, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` };
}
function cbEdgesSvg() {
  return `<svg class="cb-edges" width="1650" height="900" viewBox="0 0 1650 900" aria-hidden="true">${cbState.edges.map(edge => { const p = cbEdgePoints(edge); if (!p) return ''; return `<g class="cb-edge ${cbState.selectedEdge === edge.id ? 'selected' : ''}"><path class="cb-edge-halo" data-cb-edge="${edge.id}" d="${p.path}"/><path class="cb-edge-line" data-cb-edge="${edge.id}" d="${p.path}"/><circle cx="${p.x2}" cy="${p.y2}" r="4" fill="#fff" stroke="#7dabc1" stroke-width="2"/>${edge.branch !== 'default' ? `<rect x="${p.x1 + 20}" y="${p.y1 - 26}" width="39" height="18" rx="6" class="cb-edge-label-bg ${edge.branch}"/><text x="${p.x1 + 39}" y="${p.y1 - 13}" text-anchor="middle" class="cb-edge-label">${edge.branch === 'true' ? 'Đúng' : 'Sai'}</text>` : ''}</g>`; }).join('')}</svg>`;
}
function cbNodeSummary(node) {
  const d = node.data || {};
  if (node.type === 'condition') return `${d.field || 'field'} ${d.operator || '='} ${d.value || '?'}`;
  if (node.type === 'sendNotification') return `${d.channel || 'Kênh'} → ${d.recipient || 'Người nhận'}`;
  if (node.type === 'createTask') return d.assignee || 'Chưa chọn người xử lý';
  if (node.type === 'approval') return d.approver || 'Quản lý';
  if (node.type === 'wait') return d.duration || 'Chưa đặt thời gian';
  if (node.type === 'triggerLead') return d.source === 'Tất cả' ? 'Mọi nguồn khách' : `Nguồn: ${d.source}`;
  return cbDef(node).description;
}
function cbNodeMarkup(node) {
  const def = cbDef(node), active = cbState.selectedNode === node.id;
  const runStep = cbState.runResult?.trace?.filter(step => step.id === node.id).at(-1);
  const runClass = runStep ? `run-${runStep.status}` : '';
  return `<div class="cb-node ${def.kind} ${active ? 'active' : ''} ${runClass}" data-cb-node="${node.id}" style="left:${node.x}px;top:${node.y}px"><div class="cb-node-head" data-cb-drag="${node.id}"><span class="cb-node-icon">${icon(def.icon, 18)}</span><span><strong>${esc(node.label)}</strong><small>${esc(def.subtitle)}</small></span><span class="cb-node-menu">${icon('more', 16)}</span></div><div class="cb-node-body">${esc(cbNodeSummary(node))}</div><span class="cb-node-type">${def.kind === 'trigger' ? 'TRIGGER' : def.kind === 'logic' ? 'LOGIC' : 'ACTION'}</span>${def.kind !== 'trigger' ? `<button class="cb-port in" data-cb-port="in" data-cb-node-id="${node.id}" title="Nối vào ${esc(node.label)}"></button>` : ''}${node.type !== 'end' ? node.type === 'condition' ? `<button class="cb-port out branch-true" data-cb-port="true" data-cb-node-id="${node.id}" title="Nhánh Đúng"></button><button class="cb-port out branch-false" data-cb-port="false" data-cb-node-id="${node.id}" title="Nhánh Sai"></button>` : `<button class="cb-port out" data-cb-port="default" data-cb-node-id="${node.id}" title="Nối đến node tiếp theo"></button>` : ''}</div>`;
}
function cbCatalog() {
  const categories = [['trigger', 'TRIGGER · KHI NÀO'], ['logic', 'LOGIC · ĐIỀU KIỆN'], ['action', 'ACTION · LÀM GÌ']];
  const q = cbState.paletteQuery.trim().toLocaleLowerCase('vi');
  return `<aside class="cb-catalog"><div class="cb-side-head"><strong>Thư viện node</strong><small>Chọn để thêm vào canvas</small></div><label class="cb-palette-search">${icon('search', 14)}<input id="cb-palette-search" value="${esc(cbState.paletteQuery)}" placeholder="Tìm trigger, action..."></label><div class="cb-catalog-scroll">${categories.map(([kind, heading]) => { const items = Object.entries(cbDefinitions).filter(([, def]) => def.kind === kind && (!q || `${def.title} ${def.description}`.toLocaleLowerCase('vi').includes(q))); return items.length ? `<div class="cb-catalog-group"><h3>${heading}</h3>${items.map(([type, def]) => `<button class="cb-catalog-item ${kind}" data-cb-add="${type}"><span>${icon(def.icon, 16)}</span><span><strong>${def.title}</strong><small>${def.subtitle}</small></span>${icon('plus', 13)}</button>`).join('')}</div>` : ''; }).join('')}</div></aside>`;
}
function cbField(field, node) {
  const value = node.data[field.key] ?? '';
  const id = `cb-field-${field.key}`;
  const control = field.type === 'select' ? `<select id="${id}" data-cb-field="${field.key}">${field.options.map(option => `<option ${value === option ? 'selected' : ''}>${option}</option>`).join('')}</select>` : field.type === 'textarea' ? `<textarea id="${id}" data-cb-field="${field.key}" placeholder="${esc(field.placeholder || '')}">${esc(value)}</textarea>` : `<input id="${id}" data-cb-field="${field.key}" type="${field.type}" value="${esc(value)}" placeholder="${esc(field.placeholder || '')}">`;
  return `<label class="cb-field"><span>${field.label}</span>${control}</label>`;
}
function cbInspector() {
  const node = cbNode(cbState.selectedNode);
  if (cbState.selectedEdge) { const edge = cbState.edges.find(row => row.id === cbState.selectedEdge); if (edge) return `<aside class="cb-inspector"><div class="cb-side-head"><strong>Kết nối</strong><small>${edge.id}</small></div><div class="cb-inspector-body"><div class="cb-inspector-icon logic">${icon('workflow', 20)}</div><h3>${esc(cbNode(edge.from)?.label)} → ${esc(cbNode(edge.to)?.label)}</h3><p>Nhánh: ${edge.branch === 'true' ? 'Đúng' : edge.branch === 'false' ? 'Sai' : 'Mặc định'}</p><div class="cb-inspector-actions"><button class="btn" data-cb-action="delete-edge">${icon('close', 13)} Xóa kết nối</button></div></div></aside>`; }
  if (!node) return `<aside class="cb-inspector"><div class="cb-side-head"><strong>Cấu hình node</strong><small>Chưa chọn node</small></div><div class="cb-inspector-empty">${icon('settings', 25)}<strong>Chọn một node</strong><p>Nhấp node trên canvas để sửa trigger, điều kiện hoặc action.</p></div></aside>`;
  const def = cbDef(node);
  const incoming = cbState.edges.filter(edge => edge.to === node.id), outgoing = cbState.edges.filter(edge => edge.from === node.id);
  return `<aside class="cb-inspector"><div class="cb-side-head"><strong>Cấu hình node</strong><small>${node.id} · ${def.kind.toUpperCase()}</small></div><div class="cb-inspector-body"><div class="cb-inspector-icon ${def.kind}">${icon(def.icon, 20)}</div><h3>${esc(def.title)}</h3><p>${def.description}</p><label class="cb-field"><span>Tên hiển thị</span><input id="cb-node-label" value="${esc(node.label)}"></label>${def.fields.map(field => cbField(field, node)).join('')}<div class="cb-inspector-section"><strong>Kết nối</strong><small>${incoming.length} đầu vào · ${outgoing.length} đầu ra</small>${outgoing.map(edge => `<div class="cb-connection"><span>${edge.branch === 'default' ? '→' : edge.branch === 'true' ? 'Đúng →' : 'Sai →'} ${esc(cbNode(edge.to)?.label)}</span><button data-cb-delete-edge="${edge.id}" title="Xóa kết nối">×</button></div>`).join('')}</div><div class="cb-inspector-actions"><button class="btn" data-cb-action="duplicate-node">${icon('plus', 13)} Nhân bản</button>${node.type === 'end' ? '' : `<button class="btn soft" data-cb-action="add-after">${icon('plus', 13)} Thêm sau</button>`}<button class="btn danger" data-cb-action="delete-node">${icon('close', 13)} Xóa node</button></div></div></aside>`;
}
function cbExecutionPanel() {
  const triggers = cbState.nodes.filter(node => cbDef(node).kind === 'trigger');
  const actions = cbState.nodes.filter(node => cbDef(node).kind === 'action');
  const result = cbState.runResult;
  const run = result?.id ? cbRunById(result.id) : null;
  return `<div class="cb-execution card"><div class="cb-execution-head"><div><span class="cb-kicker">TEST WORKFLOW</span><h3>Kích hoạt một sự kiện mẫu</h3><p>Xem trigger có khớp không, action nào chạy, bước nào cần chờ hoặc xử lý lỗi.</p></div><button class="btn primary" data-cb-action="run">${icon('arrow', 14)} Chạy thử</button></div><div class="cb-execution-grid"><div><div class="cb-execution-label"><strong>Input JSON</strong><select id="cb-run-trigger" aria-label="Chọn trigger">${triggers.map(node => `<option value="${node.id}" ${cbState.runTrigger === node.id ? 'selected' : ''}>${esc(node.label)}</option>`).join('')}</select></div><textarea id="cb-run-input" spellcheck="false">${esc(cbState.runInput)}</textarea><label class="cb-failure-select"><span>Mô phỏng lỗi tại action</span><select id="cb-run-failure"><option value="">Không có lỗi</option>${actions.map(node => `<option value="${node.id}" ${cbState.runFailureNode === node.id ? 'selected' : ''}>${esc(node.label)}</option>`).join('')}</select></label><p class="cb-sim-note">Đây là môi trường mô phỏng: không tạo hợp đồng, hóa đơn hay gửi tin thật.</p></div><div><div class="cb-execution-label"><strong>Kết quả lần chạy</strong>${run ? cbRunBadge(run.status) : '<span>Chưa chạy</span>'}</div><div class="cb-run-output ${run ? 'has-run' : ''}">${result?.error ? `<div class="cb-run-error">${esc(result.error)}</div>` : run ? cbRunOverview(run) : `<div class="cb-run-placeholder">${icon('spark', 22)}<p>Nhấn “Chạy thử” để thấy dữ liệu đi qua trigger, logic và action.</p></div>`}</div><button class="cb-runs-link" data-cb-run-action="view-runs">Xem tất cả lần chạy →</button></div></div></div>`;
}

function cbFit() {
  if (!cbState.nodes.length) return;
  const view = document.querySelector('.cb-viewport');
  const minX = Math.min(...cbState.nodes.map(node => node.x)), minY = Math.min(...cbState.nodes.map(node => node.y));
  const maxX = Math.max(...cbState.nodes.map(node => node.x + 220)), maxY = Math.max(...cbState.nodes.map(node => node.y + 120));
  cbState.zoom = Math.max(.2, Math.min(1.2, Math.floor(Math.min(((view?.clientWidth || 700) - 45) / (maxX - minX), ((view?.clientHeight || 600) - 45) / (maxY - minY)) * 100) / 100));
  cbRender();
  const next = document.querySelector('.cb-viewport');
  if (next) { next.scrollLeft = Math.max(0, minX * cbState.zoom - 20); next.scrollTop = Math.max(0, minY * cbState.zoom - 20); }
}
function cbValidation() {
  const issues = [];
  const triggers = cbState.nodes.filter(node => cbDef(node).kind === 'trigger');
  if (!triggers.length) issues.push('Cần ít nhất một Trigger.');
  if (!cbState.nodes.some(node => cbDef(node).kind === 'action')) issues.push('Cần ít nhất một Action.');
  for (const node of cbState.nodes) {
    if (cbDef(node).kind !== 'trigger' && !cbState.edges.some(edge => edge.to === node.id)) issues.push(`${node.label} chưa được nối đầu vào.`);
    if (node.type === 'condition' && !['true', 'false'].every(branch => cbState.edges.some(edge => edge.from === node.id && edge.branch === branch))) issues.push(`${node.label} cần đủ hai nhánh Đúng và Sai.`);
  }
  return issues;
}
function wfCanvasView() {
  const count = cbState.nodes.length;
  const issues = cbValidation();
  return `<div class="cb-toolbar card"><div class="cb-workflow-name"><span class="cb-kicker">WORKFLOW / ${cbState.published ? `PUBLISHED V${cbState.version}` : 'DRAFT'}</span><input id="cb-workflow-name" value="${esc(cbState.name)}" aria-label="Tên workflow"><small>${count} node · ${cbState.edges.length} kết nối</small></div><div class="cb-toolbar-actions"><select id="cb-template" class="filter-select" aria-label="Chọn mẫu workflow"><option value="">Mở mẫu workflow...</option>${Object.entries(cbTemplates).map(([key, template]) => `<option value="${key}">${template.title}</option>`).join('')}</select><button class="cb-tool-btn" data-cb-action="undo" title="Hoàn tác" ${cbState.history.length ? '' : 'disabled'}>↶</button><button class="cb-tool-btn" data-cb-action="redo" title="Làm lại" ${cbState.future.length ? '' : 'disabled'}>↷</button><button class="cb-tool-btn" data-cb-action="fit" title="Vừa khung">⤢</button><button class="cb-tool-btn" data-cb-action="zoom-out" title="Thu nhỏ">−</button><span class="cb-zoom">${Math.round(cbState.zoom * 100)}%</span><button class="cb-tool-btn" data-cb-action="zoom-in" title="Phóng to">+</button><button class="btn" data-cb-action="save">${icon('check', 13)} Lưu nháp</button><button class="btn primary" data-cb-action="publish" ${cbState.published ? 'disabled' : ''}>${icon('spark', 13)} ${cbState.published ? 'Đã xuất bản' : 'Xuất bản'}</button></div></div>${issues.length ? `<div class="cb-validation">${icon('shield', 14)} ${issues.length} mục cần hoàn thiện trước khi xuất bản: ${esc(issues[0])}</div>` : ''}<div class="cb-shell card">${cbCatalog()}<div class="cb-viewport"><div class="cb-world" style="transform:scale(${cbState.zoom})">${cbEdgesSvg()}${cbState.nodes.map(cbNodeMarkup).join('')}${count ? '' : '<div class="cb-empty-canvas"><strong>Canvas đang trống</strong><p>Thêm một Trigger từ thư viện để bắt đầu workflow.</p></div>'}</div><div class="cb-canvas-tip">${cbState.pendingFrom ? `Đang nối từ ${esc(cbNode(cbState.pendingFrom)?.label)} · chọn đầu vào node đích` : 'Kéo node để sắp xếp · Nhấp chấm tròn để nối · Chọn đường nối để xóa'}</div></div>${cbInspector()}</div>${cbExecutionPanel()}`;
}

function cbGetField(payload, path) { return String(path || '').split('.').reduce((value, key) => value?.[key], payload); }
function cbInterpolate(text, payload) { return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => String(cbGetField(payload, path) ?? '')); }
function cbEvaluateCondition(node, payload) {
  const actual = cbGetField(payload, node.data.field);
  const expected = node.data.value;
  switch (node.data.operator) {
    case '>=': return Number(actual) >= Number(expected);
    case '>': return Number(actual) > Number(expected);
    case '<': return Number(actual) < Number(expected);
    case 'contains': return String(actual ?? '').toLocaleLowerCase('vi').includes(String(expected).toLocaleLowerCase('vi'));
    default: return String(actual ?? '') === String(expected);
  }
}
function cbExecuteNode(node, payload) {
  const d = node.data || {};
  switch (node.type) {
    case 'condition': { const passed = cbEvaluateCondition(node, payload); return { message: `${d.field || 'field'} ${d.operator || '='} ${d.value || ''} → ${passed ? 'Đúng' : 'Sai'}`, branch: passed ? 'true' : 'false' }; }
    case 'createTask': return { message: `Tạo việc “${cbInterpolate(d.taskTitle, payload)}” → ${d.assignee || 'Chưa phân công'} (${d.due || 'Chưa có hạn'})` };
    case 'sendNotification': return { message: `Mô phỏng gửi ${d.channel || 'thông báo'} cho ${d.recipient || 'người nhận'}: ${cbInterpolate(d.message, payload)}` };
    case 'createBooking': return { message: `Giữ căn ${cbInterpolate(d.unit, payload)} trong ${d.holdHours || 48} giờ` };
    case 'createContract': return { message: `Tạo dự thảo “${d.template || 'Hợp đồng thuê'}” · ${d.sendForApproval || 'Lưu bản nháp'}` };
    case 'createInvoice': return { message: `Lập hóa đơn ${d.invoiceType || 'Tiền thuê'}, hạn sau ${d.dueDays || 7} ngày` };
    case 'updateRecord': return { message: `${d.entity || 'Hồ sơ'} → ${d.status || 'Đã cập nhật'}` };
    case 'wait': return { message: `Tạm dừng ${d.duration || '2 giờ'}; chờ đến thời điểm tiếp tục.` };
    case 'approval': return { message: `Gửi yêu cầu cho ${d.approver || 'Quản lý'} · hạn ${d.deadline || '24 giờ'}; chờ quyết định.` };
    case 'end': return { message: 'Hoàn tất luồng.' };
    default: return { message: `Trigger ${cbDef(node).subtitle} nhận dữ liệu đầu vào.` };
  }
}
function cbRun() { cbStartRun(); }

let cbDrag = null;
document.addEventListener('pointerdown', event => {
  const head = event.target.closest('[data-cb-drag]');
  if (!head || event.button !== 0) return;
  const node = cbNode(head.dataset.cbDrag); if (!node) return;
  cbDrag = { id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, moved: false };
  cbState.selectedNode = node.id;
  cbState.selectedEdge = null;
  head.setPointerCapture?.(event.pointerId);
});
document.addEventListener('pointermove', event => {
  if (!cbDrag) return;
  const node = cbNode(cbDrag.id); if (!node) return;
  const dx = (event.clientX - cbDrag.startX) / cbState.zoom, dy = (event.clientY - cbDrag.startY) / cbState.zoom;
  if (Math.abs(dx) + Math.abs(dy) > 3 && !cbDrag.moved) { cbRemember(); cbDrag.moved = true; }
  if (!cbDrag.moved) return;
  node.x = Math.max(10, Math.min(1410, Math.round(cbDrag.x + dx)));
  node.y = Math.max(10, Math.min(720, Math.round(cbDrag.y + dy)));
  const element = document.querySelector(`[data-cb-node="${node.id}"]`);
  if (element) { element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; }
  const svg = document.querySelector('.cb-edges');
  if (svg) svg.outerHTML = cbEdgesSvg();
});
document.addEventListener('pointerup', () => {
  if (!cbDrag) return;
  cbDrag = null; cbPersist(); cbRender();
});
document.addEventListener('click', event => {
  const port = event.target.closest('[data-cb-port]');
  if (port) {
    const id = port.dataset.cbNodeId;
    if (port.dataset.cbPort === 'in') { if (cbState.pendingFrom) cbConnect(cbState.pendingFrom, id, cbState.pendingBranch); else notify('Hãy chọn đầu ra của node nguồn trước.'); }
    else { cbState.pendingFrom = id; cbState.pendingBranch = port.dataset.cbPort; cbState.selectedNode = id; cbRender(); }
    return;
  }
  const edge = event.target.closest('[data-cb-edge]');
  if (edge) { cbState.selectedEdge = edge.dataset.cbEdge; cbState.selectedNode = null; cbRender(); return; }
  const add = event.target.closest('[data-cb-add]');
  if (add) { cbAdd(add.dataset.cbAdd); return; }
  const remove = event.target.closest('[data-cb-delete-edge]');
  if (remove) { cbRemember(); cbState.edges = cbState.edges.filter(edge => edge.id !== remove.dataset.cbDeleteEdge); cbCommit(); return; }
  const actionElement = event.target.closest('[data-cb-action]');
  if (actionElement) {
    const action = actionElement.dataset.cbAction;
    if (action === 'delete-node') cbDeleteNode();
    else if (action === 'add-after' && cbState.selectedNode) { cbState.pendingFrom = cbState.selectedNode; cbState.pendingBranch = cbNode(cbState.selectedNode)?.type === 'condition' ? 'true' : 'default'; cbRender(); notify('Chọn node trong thư viện để thêm và nối vào luồng.'); }
    else if (action === 'duplicate-node') cbDuplicateNode();
    else if (action === 'delete-edge') { cbRemember(); cbState.edges = cbState.edges.filter(edge => edge.id !== cbState.selectedEdge); cbState.selectedEdge = null; cbCommit(); }
    else if (action === 'undo' && cbState.history.length) { cbState.future.push(cbSnapshot()); cbRestore(cbState.history.pop()); }
    else if (action === 'redo' && cbState.future.length) { cbState.history.push(cbSnapshot()); cbRestore(cbState.future.pop()); }
    else if (action === 'zoom-in' || action === 'zoom-out') { cbState.zoom = Math.max(.2, Math.min(1.25, Math.round((cbState.zoom + (action === 'zoom-in' ? .1 : -.1)) * 100) / 100)); cbRender(); }
    else if (action === 'fit') cbFit();
    else if (action === 'save') { cbPersist(); notify('Đã lưu bản nháp workflow trên trình duyệt.'); }
    else if (action === 'publish') { const issues = cbValidation(); if (issues.length) { notify(issues[0]); return; } cbState.published = true; cbState.version += 1; cbPersist(); notify(`Đã xuất bản workflow v${cbState.version} trong bản mô phỏng.`); }
    else if (action === 'run') cbRun();
    return;
  }
  const node = event.target.closest('[data-cb-node]');
  if (node) { cbState.selectedNode = node.dataset.cbNode; cbState.selectedEdge = null; cbRender(); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'cb-template' && event.target.value) { cbLoadTemplate(event.target.value); return; }
  if (event.target.id === 'cb-workflow-name') { cbRemember(); cbState.name = event.target.value || 'Workflow mới'; cbCommit(); return; }
  if (event.target.id === 'cb-node-label') { const node = cbNode(cbState.selectedNode); if (node) { cbRemember(); node.label = event.target.value || cbDef(node).title; cbCommit(); } return; }
  if (event.target.dataset.cbField) { const node = cbNode(cbState.selectedNode); if (node) { cbRemember(); node.data[event.target.dataset.cbField] = event.target.value; cbCommit(); } return; }
  if (event.target.id === 'cb-run-trigger') { cbState.runTrigger = event.target.value; return; }
  if (event.target.id === 'cb-run-failure') { cbState.runFailureNode = event.target.value; return; }
  if (event.target.id === 'cb-run-input') { cbState.runInput = event.target.value; return; }
});
document.addEventListener('input', event => {
  if (event.target.id === 'cb-run-input') { cbState.runInput = event.target.value; return; }
  if (event.target.id !== 'cb-palette-search') return;
  cbState.paletteQuery = event.target.value;
  const position = event.target.selectionStart;
  cbRender();
  const field = document.getElementById('cb-palette-search');
  field?.focus(); field?.setSelectionRange(position, position);
});
document.addEventListener('keydown', event => {
  if (wfState.tab !== 'canvas') return;
  if (event.key === 'Escape' && cbState.pendingFrom) { cbState.pendingFrom = null; cbRender(); }
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) { if (cbState.selectedEdge) { cbRemember(); cbState.edges = cbState.edges.filter(edge => edge.id !== cbState.selectedEdge); cbState.selectedEdge = null; cbCommit(); } else cbDeleteNode(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); if (event.shiftKey && cbState.future.length) { cbState.history.push(cbSnapshot()); cbRestore(cbState.future.pop()); } else if (cbState.history.length) { cbState.future.push(cbSnapshot()); cbRestore(cbState.history.pop()); } }
});
