// Interactive, local-only walkthrough of the rental lifecycle. Loaded before app.js.
const wfStages = [
  {
    name: 'Tiếp nhận', short: 'Lead', icon: 'users', owner: 'Tư vấn viên', sla: '4 giờ',
    entry: 'Khách gửi yêu cầu từ website, Zalo, đối tác hoặc được nhân viên nhập mới.',
    exit: 'Có thông tin liên hệ, nhu cầu thuê và người phụ trách.',
    checks: ['Xác minh liên hệ', 'Ghi nhu cầu và ngân sách', 'Giao tư vấn viên'],
    automation: 'Tạo hồ sơ khách và thông báo cho tư vấn viên.'
  },
  {
    name: 'Tư vấn & xem', short: 'Lịch xem', icon: 'calendar', owner: 'Tư vấn viên', sla: '24 giờ',
    entry: 'Lead đã được xác minh và có căn phù hợp.',
    exit: 'Khách đã xem căn và xác nhận muốn tiếp tục.',
    checks: ['Chốt căn phù hợp', 'Xác nhận lịch xem', 'Ghi nhận phản hồi khách'],
    automation: 'Gửi lịch hẹn và nhắc khách trước giờ xem 2 tiếng.'
  },
  {
    name: 'Giữ căn', short: 'Reservation', icon: 'key', owner: 'Kinh doanh', sla: '48 giờ',
    entry: 'Khách chọn căn sau buổi xem.',
    exit: 'Căn còn khả dụng và tiền giữ chỗ đã được đối soát.',
    checks: ['Kiểm tra căn khả dụng', 'Xác nhận điều khoản giữ chỗ', 'Đối soát tiền giữ chỗ'],
    automation: 'Tạm khóa tồn kho, tạo đặt chỗ và nhắc khi sắp hết hạn.'
  },
  {
    name: 'Ký hợp đồng', short: 'Contract', icon: 'file', owner: 'Pháp lý / quản lý', sla: '3 ngày',
    entry: 'Đặt chỗ hợp lệ và thông tin khách đầy đủ.',
    exit: 'Quản lý phê duyệt, hai bên ký và hồ sơ được lưu.',
    checks: ['Soạn từ mẫu hợp đồng', 'Kiểm tra điều khoản', 'Hai bên đã ký'],
    automation: 'Tạo dự thảo, gửi yêu cầu phê duyệt và lưu bản ký.'
  },
  {
    name: 'Bàn giao', short: 'Check-in', icon: 'building', owner: 'Vận hành', sla: '2 ngày',
    entry: 'Hợp đồng có hiệu lực và lịch bàn giao đã được xác nhận.',
    exit: 'Căn được kiểm tra, ký biên bản và cấp quyền ra vào.',
    checks: ['Kiểm tra hiện trạng', 'Ký biên bản bàn giao', 'Cấp khóa / thẻ ra vào'],
    automation: 'Tạo lịch bàn giao, checklist hiện trạng và quyền ra vào.'
  },
  {
    name: 'Vận hành & thu phí', short: 'Living', icon: 'wallet', owner: 'Kế toán / CSKH', sla: 'Hàng tháng',
    entry: 'Khách đã nhận nhà.',
    exit: 'Phí kỳ hiện tại đã thu và lịch chăm sóc được thiết lập.',
    checks: ['Tạo hóa đơn kỳ đầu', 'Đối soát thanh toán', 'Thiết lập nhắc phí định kỳ'],
    automation: 'Phát hành hóa đơn, nhắc hạn và tạo ticket khi có sự cố.'
  },
  {
    name: 'Gia hạn / trả phòng', short: 'Renewal', icon: 'clock', owner: 'CSKH / vận hành', sla: '30 ngày trước hạn',
    entry: 'Hợp đồng gần hết hạn hoặc khách yêu cầu chấm dứt.',
    exit: 'Khách gia hạn sang chu kỳ mới hoặc hoàn tất trả phòng.',
    checks: ['Thông báo trước hạn', 'Kiểm tra hiện trạng cuối kỳ', 'Chốt công nợ và hoàn cọc'],
    automation: 'Nhắc gia hạn, tạo phụ lục hoặc lịch trả phòng.'
  },
  {
    name: 'Hoàn tất', short: 'Closed', icon: 'check', owner: 'Quản lý', sla: '1 ngày',
    entry: 'Quy trình trả phòng và đối soát đã hoàn tất.',
    exit: 'Hồ sơ được đóng và lưu lịch sử.',
    checks: ['Lưu biên bản thanh lý', 'Đóng quyền ra vào'],
    automation: 'Đóng booking, giải phóng căn và lưu nhật ký kiểm toán.'
  }
];

const wfState = {
  tab: 'canvas', selectedStage: 2, selectedCase: 'FL-2026-104',
  search: '', filter: 'Tất cả', modal: null, published: true, version: 3,
  stageConfig: wfStages.map(s => ({ owner: s.owner, sla: s.sla })),
  rules: [
    { id: 'R01', event: 'Lead mới', condition: 'Đủ liên hệ + nguồn', action: 'Tạo việc tư vấn và thông báo', channel: 'In-app / Zalo', enabled: true },
    { id: 'R02', event: 'Lịch xem được xác nhận', condition: 'Trước giờ xem 2 tiếng', action: 'Nhắc khách và tư vấn viên', channel: 'Zalo / Email', enabled: true },
    { id: 'R03', event: 'Giữ căn', condition: 'Căn khả dụng', action: 'Khóa căn 48 giờ; mở lại nếu hết hạn', channel: 'Hệ thống', enabled: true },
    { id: 'R04', event: 'Hợp đồng chờ duyệt', condition: 'Đủ hồ sơ + điều khoản', action: 'Giao quản lý phê duyệt', channel: 'In-app', enabled: true },
    { id: 'R05', event: 'Hóa đơn đến hạn', condition: 'Còn dư nợ sau 3 ngày', action: 'Nhắc phí và gắn cờ quá hạn', channel: 'Email / Zalo', enabled: true },
    { id: 'R06', event: 'Hợp đồng gần hết hạn', condition: 'Còn 30 ngày', action: 'Tạo việc gia hạn hoặc trả phòng', channel: 'In-app / Email', enabled: true }
  ],
  cases: [
    { id: 'FL-2026-104', name: 'Nguyễn Minh Anh', unit: 'A-1208 · The Metropole', stage: 1, owner: 'Hoàng Linh', due: '02/10 · 14:00', status: 'Đang chạy', checks: { 1: [true, true, false] }, approval: 'none', cycle: 1, source: 'Website', budget: '28 triệu/tháng', started: '01/10/2026', activity: [{ text: 'Lịch xem căn A-1208 được xác nhận', at: '01/10 · 09:30' }, { text: 'Lead được giao cho Hoàng Linh', at: '01/10 · 08:45' }] },
    { id: 'FL-2026-103', name: 'Trần Hoàng Nam', unit: 'A-0905 · Rivergate', stage: 2, owner: 'Thu Hà', due: '03/10 · 17:00', status: 'Đang chạy', checks: { 2: [true, true, false] }, approval: 'none', cycle: 1, source: 'Zalo', budget: '18,5 triệu/tháng', started: '29/09/2026', activity: [{ text: 'Khách đã chọn căn A-0905', at: '30/09 · 15:20' }] },
    { id: 'FL-2026-102', name: 'Nova Studio', unit: 'VP-03 · Saigon Centre', stage: 3, owner: 'Anh Nguyễn', due: '04/10 · 12:00', status: 'Chờ duyệt', checks: { 3: [true, true, false] }, approval: 'pending', cycle: 1, source: 'Đối tác', budget: '68 triệu/tháng', started: '25/09/2026', activity: [{ text: 'Đã gửi dự thảo cho quản lý phê duyệt', at: '01/10 · 10:20' }] },
    { id: 'FL-2026-101', name: 'Lê Thảo Vy', unit: 'B-1806 · The Metropole', stage: 4, owner: 'Hoàng Linh', due: '03/10 · 09:00', status: 'Đang chạy', checks: { 4: [true, false, false] }, approval: 'approved', cycle: 1, source: 'Giới thiệu', budget: '28 triệu/tháng', started: '18/09/2026', activity: [{ text: 'Hợp đồng HD-2026-079 đã ký', at: '30/09 · 14:12' }] },
    { id: 'FL-2026-100', name: 'Công ty Orion', unit: 'VP-08 · Saigon Centre', stage: 5, owner: 'Anh Nguyễn', due: '05/10 · 17:00', status: 'Đang chạy', checks: { 5: [true, false, true] }, approval: 'approved', cycle: 1, source: 'Đối tác', budget: '72 triệu/tháng', started: '01/11/2025', activity: [{ text: 'Hóa đơn INV-2609-081 được phát hành', at: '29/09 · 08:00' }] },
    { id: 'FL-2026-099', name: 'Mai Phương Linh', unit: 'A-0603 · Sun Avenue', stage: 6, owner: 'Thu Hà', due: '10/10 · 17:00', status: 'Đang chạy', checks: { 6: [true, false, false] }, approval: 'approved', cycle: 1, source: 'Website', budget: '16,8 triệu/tháng', started: '01/10/2025', activity: [{ text: 'Đã gửi đề nghị gia hạn', at: '30/09 · 09:30' }] },
    { id: 'FL-2026-098', name: 'Dương Gia Bảo', unit: 'C-0803 · Sun Avenue', stage: 0, owner: 'Hoàng Linh', due: '01/10 · 17:00', status: 'Đang chạy', checks: { 0: [true, false, false] }, approval: 'none', cycle: 1, source: 'Website', budget: '17 triệu/tháng', started: '01/10/2026', activity: [{ text: 'Lead mới từ website', at: '01/10 · 11:05' }] },
    { id: 'FL-2026-097', name: 'Trần Hải Đăng', unit: 'A-1402 · Rivergate', stage: 7, owner: 'Anh Nguyễn', due: 'Đã đóng', status: 'Hoàn tất', checks: { 7: [true, true] }, approval: 'approved', cycle: 1, source: 'Giới thiệu', budget: '19,2 triệu/tháng', started: '01/10/2025', activity: [{ text: 'Đóng hồ sơ và giải phóng căn', at: '30/09 · 17:00' }] }
  ],
  log: [
    { at: '01/10 · 10:20', actor: 'Anh Nguyễn', event: 'Yêu cầu phê duyệt hợp đồng', caseId: 'FL-2026-102', kind: 'approval' },
    { at: '01/10 · 09:30', actor: 'Hệ thống', event: 'Gửi xác nhận lịch xem cho Nguyễn Minh Anh', caseId: 'FL-2026-104', kind: 'automation' },
    { at: '01/10 · 08:45', actor: 'Hoàng Linh', event: 'Tiếp nhận khách từ website', caseId: 'FL-2026-104', kind: 'action' },
    { at: '30/09 · 15:20', actor: 'Thu Hà', event: 'Chuyển hồ sơ sang bước Giữ căn', caseId: 'FL-2026-103', kind: 'transition' },
    { at: '30/09 · 14:12', actor: 'Hệ thống', event: 'Lưu hợp đồng đã ký và tạo lịch bàn giao', caseId: 'FL-2026-101', kind: 'automation' }
  ]
};

const wfDeepLink = new URLSearchParams(location.search);
if (['canvas', 'runs', 'board', 'cases', 'design', 'automation', 'audit', 'detail'].includes(wfDeepLink.get('wf'))) wfState.tab = wfDeepLink.get('wf');
if (wfState.cases.some(item => item.id === wfDeepLink.get('case'))) wfState.selectedCase = wfDeepLink.get('case');

const wfCaseById = id => wfState.cases.find(item => item.id === id);
const wfCurrentCase = () => wfCaseById(wfState.selectedCase);
const wfChecks = item => item.checks[item.stage] || wfStages[item.stage].checks.map(() => false);
const wfTag = (label, tone = 'green') => `<span class="wf-tag ${tone}">${esc(label)}</span>`;
const wfStatusTone = status => ({ 'Đang chạy': 'green', 'Chờ duyệt': 'amber', 'Ngoại lệ': 'red', 'Nuôi dưỡng': 'blue', 'Đã hủy': 'gray', 'Hoàn tất': 'gray' })[status] || 'gray';
const wfButton = (label, action, style = '', ico = '') => `<button class="btn ${style}" data-wf-action="${action}">${ico ? icon(ico, 14) : ''}${label}</button>`;
function wfRecord(item, text, kind = 'action') {
  item.activity.unshift({ text, at: '01/10 · vừa xong' });
  wfState.log.unshift({ at: '01/10 · vừa xong', actor: kind === 'automation' ? 'Hệ thống' : 'Bạn (demo)', event: text, caseId: item.id, kind });
}
function wfRunRule(item, ruleId) {
  const rule = wfState.rules.find(row => row.id === ruleId);
  if (rule?.enabled) wfRecord(item, `Tự động: ${rule.action}`, 'automation');
}
function wfMove(item, next) {
  const from = wfStages[item.stage].name;
  item.stage = next;
  item.status = 'Đang chạy';
  item.due = next === 7 ? 'Đã đóng' : ['03/10 · 12:00', '04/10 · 14:00', '05/10 · 17:00', '07/10 · 17:00', '08/10 · 09:00', '05/11 · 17:00', '01/09/2027', '01/10 · 17:00'][next];
  wfRecord(item, `Chuyển từ ${from} sang ${wfStages[next].name}`, 'transition');
  if (next === 2) wfRunRule(item, 'R03');
  if (next === 4) wfRecord(item, 'Tự động: tạo lịch bàn giao và checklist hiện trạng', 'automation');
  if (next === 5) wfRecord(item, 'Tự động: thiết lập lịch hóa đơn và chăm sóc định kỳ', 'automation');
  if (next === 6) wfRunRule(item, 'R06');
}

function wfTabs() {
  const tabs = [['canvas', 'Trình dựng luồng', 'workflow'], ['runs', 'Lần chạy', 'arrow'], ['board', 'Hành trình thuê mẫu', 'grid'], ['cases', 'Hồ sơ thuê mẫu', 'users'], ['design', 'Cấu hình mẫu thuê', 'settings'], ['automation', 'Quy tắc thuê & SLA', 'spark'], ['audit', 'Nhật ký hồ sơ', 'clock']];
  return `<div class="wf-tabs" role="tablist" aria-label="Các góc nhìn workflow">${tabs.map(([id, title, ico]) => `<button role="tab" aria-selected="${wfState.tab === id || (id === 'cases' && wfState.tab === 'detail')}" class="wf-tab ${wfState.tab === id || (id === 'cases' && wfState.tab === 'detail') ? 'active' : ''}" data-wf-tab="${id}">${icon(ico, 15)}${title}</button>`).join('')}</div>`;
}
function wfStageMap() {
  return `<div class="wf-stage-map">${wfStages.map((stage, index) => {
    const count = wfState.cases.filter(item => item.stage === index && item.status !== 'Đã hủy').length;
    return `<button class="wf-stage-node ${wfState.selectedStage === index ? 'active' : ''}" data-wf-stage="${index}"><span class="wf-node-top"><span class="wf-node-number">${String(index + 1).padStart(2, '0')}</span><span class="wf-node-icon">${icon(stage.icon, 16)}</span></span><strong>${stage.name}</strong><small>${stage.short} · ${wfState.stageConfig[index].sla}</small><span class="wf-node-count">${count} hồ sơ</span></button>`;
  }).join('')}</div>`;
}
function wfSummary() {
  const running = wfState.cases.filter(c => c.status === 'Đang chạy').length;
  const pending = wfState.cases.filter(c => c.status === 'Chờ duyệt').length;
  const dueSoon = wfState.cases.filter(c => c.status === 'Đang chạy' && /^(02|03)\/10/.test(c.due)).length;
  return `<div class="wf-summary"><div><span>${icon('workflow', 18)}</span><strong>${running}</strong><small>Hồ sơ đang chạy</small></div><div><span>${icon('clock', 18)}</span><strong>${pending}</strong><small>Chờ phê duyệt</small></div><div><span>${icon('calendar', 18)}</span><strong>${String(dueSoon).padStart(2, '0')}</strong><small>Sắp đến hạn</small></div><div><span>${icon('check', 18)}</span><strong>92%</strong><small>Đúng SLA tháng này</small></div></div>`;
}
function wfBoard() {
  const s = wfStages[wfState.selectedStage], cfg = wfState.stageConfig[wfState.selectedStage];
  return `<div class="wf-intro card"><div><span class="wf-overline">QUY TRÌNH MẪU · V1.${wfState.version} ${wfState.published ? 'ĐANG ÁP DỤNG' : 'BẢN NHÁP'}</span><h2>Hành trình thuê & vận hành bất động sản</h2><p>Mỗi hồ sơ đi qua 8 bước. Điều kiện hoàn tất, người phụ trách, phê duyệt và tự động hóa quyết định bước tiếp theo.</p></div><div class="wf-intro-actions">${wfButton('Chạy thử một hồ sơ', 'open-demo', 'primary', 'arrow')}${wfButton('Tạo hồ sơ mới', 'new-case', '', 'plus')}</div></div>${wfSummary()}<div class="wf-block-head"><div><h2>Sơ đồ hành trình</h2><p>Chọn từng bước để xem đầu vào, điều kiện chuyển bước và việc hệ thống tự làm.</p></div>${wfButton('Cấu hình quy trình', 'design', '', 'settings')}</div>${wfStageMap()}<div class="wf-columns"><section class="card wf-panel"><div class="section-head"><div><h2>Bước ${String(wfState.selectedStage + 1).padStart(2, '0')} · ${s.name}</h2><p>Người phụ trách: ${esc(cfg.owner)} · SLA: ${esc(cfg.sla)}</p></div>${wfTag(`${wfState.cases.filter(c => c.stage === wfState.selectedStage).length} hồ sơ`, 'green')}</div><div class="wf-rule-list"><div><span class="wf-rule-icon mint">${icon('arrow', 16)}</span><span><strong>Điều kiện vào</strong><small>${s.entry}</small></span></div><div><span class="wf-rule-icon blue">${icon('check', 16)}</span><span><strong>Điều kiện hoàn tất</strong><small>${s.exit}</small></span></div><div><span class="wf-rule-icon peach">${icon('spark', 16)}</span><span><strong>Hệ thống tự làm</strong><small>${s.automation}</small></span></div></div></section><section class="card wf-panel"><div class="section-head"><div><h2>Hồ sơ cần chú ý</h2><p>Nhấp để xem checklist và thử chuyển bước.</p></div><button class="text-link" data-wf-tab="cases">Xem tất cả →</button></div>${wfState.cases.filter(c => c.status === 'Chờ duyệt' || c.due.includes('02/10') || c.due.includes('03/10')).slice(0,3).map(c => `<button class="wf-focus-row" data-wf-case="${c.id}"><span class="wf-mini-avatar">${esc(c.name.split(' ').slice(-2).map(x => x[0]).join(''))}</span><span><strong>${esc(c.name)}</strong><small>${esc(wfStages[c.stage].name)} · ${esc(c.unit)}</small></span><span class="wf-focus-end">${wfTag(c.status, wfStatusTone(c.status))}<small>${esc(c.due)}</small></span></button>`).join('')}</section></div><div class="wf-block-head"><div><h2>Nhánh quyết định</h2><p>Những hướng đi khác ngoài luồng chuẩn.</p></div></div><div class="wf-branches"><div class="card"><span class="wf-branch-ico">${icon('users', 18)}</span><strong>Khách chưa sẵn sàng</strong><p>Sau buổi xem, chuyển sang nuôi dưỡng và hẹn liên hệ lại.</p><small>Tư vấn → Nuôi dưỡng</small></div><div class="card"><span class="wf-branch-ico">${icon('shield', 18)}</span><strong>Hợp đồng bị từ chối</strong><p>Quản lý trả lại dự thảo để sửa điều khoản và gửi duyệt lại.</p><small>Ký hợp đồng → Chỉnh sửa</small></div><div class="card"><span class="wf-branch-ico">${icon('file', 18)}</span><strong>Khách muốn gia hạn</strong><p>Tạo phụ lục và quay lại bước phê duyệt, ký kết cho chu kỳ mới.</p><small>Gia hạn → Ký hợp đồng</small></div></div>`;
}
function wfCasesView() {
  const q = wfState.search.toLocaleLowerCase('vi');
  const list = wfState.cases.filter(c => (!q || [c.id, c.name, c.unit, c.owner].some(v => v.toLocaleLowerCase('vi').includes(q))) && (wfState.filter === 'Tất cả' || c.status === wfState.filter));
  return `<div class="wf-block-head"><div><h2>Hồ sơ thuê mẫu</h2><p>Các hồ sơ minh họa quy trình thuê 8 bước, gắn với khách và căn cụ thể.</p></div>${wfButton('Tạo hồ sơ', 'new-case', 'primary', 'plus')}</div><div class="card table-card"><div class="toolbar"><label class="search-field">${icon('search', 14)}<input id="wf-search" value="${esc(wfState.search)}" placeholder="Tìm khách, căn, mã hồ sơ..."></label><select class="filter-select" id="wf-filter" aria-label="Lọc trạng thái">${['Tất cả', 'Đang chạy', 'Chờ duyệt', 'Nuôi dưỡng', 'Đã hủy', 'Hoàn tất'].map(x => `<option ${wfState.filter === x ? 'selected' : ''}>${x}</option>`).join('')}</select><span class="wf-list-count">${list.length} hồ sơ</span></div><div class="table-wrap"><table><thead><tr><th>HỒ SƠ</th><th>TÀI SẢN</th><th>BƯỚC HIỆN TẠI</th><th>PHỤ TRÁCH</th><th>HẠN XỬ LÝ</th><th>TRẠNG THÁI</th></tr></thead><tbody>${list.length ? list.map(c => `<tr data-wf-case="${c.id}"><td><strong>${esc(c.name)}</strong><span class="cell-sub">${c.id}</span></td><td>${esc(c.unit)}</td><td><span class="wf-stage-cell"><b>${c.stage + 1}/8</b>${wfStages[c.stage].name}</span></td><td>${esc(c.owner)}</td><td>${esc(c.due)}</td><td>${wfTag(c.status, wfStatusTone(c.status))}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Không có hồ sơ phù hợp.</td></tr>'}</tbody></table></div></div>`;
}
function wfDesignView() {
  const index = wfState.selectedStage, s = wfStages[index], cfg = wfState.stageConfig[index];
  return `<div class="wf-design-hero"><div><span class="wf-overline">WORKFLOW BUILDER</span><h2>Thiết kế hành trình thuê</h2><p>Chọn bước để xem trigger, người phụ trách, điều kiện hoàn tất và tự động hóa.</p></div><div>${wfTag(wfState.published ? `Đang áp dụng v1.${wfState.version}` : `Bản nháp v1.${wfState.version + 1}`, wfState.published ? 'green' : 'amber')} ${wfButton(wfState.published ? 'Tạo bản nháp' : 'Xuất bản quy trình', wfState.published ? 'make-draft' : 'publish', 'primary', 'check')}</div></div>${wfStageMap()}<div class="wf-columns design"><section class="card wf-panel"><div class="section-head"><div><h2>Cấu hình bước ${index + 1}: ${s.name}</h2><p>Các thông tin hiển thị cho người xử lý trong hồ sơ.</p></div>${icon(s.icon, 19)}</div><div class="wf-config-grid"><label><span>Nhóm phụ trách</span><select id="wf-owner" ${wfState.published ? 'disabled' : ''}>${['Tư vấn viên', 'Kinh doanh', 'Pháp lý / quản lý', 'Vận hành', 'Kế toán / CSKH', 'CSKH / vận hành', 'Quản lý'].map(x => `<option ${cfg.owner === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label><span>Thời hạn xử lý (SLA)</span><input id="wf-sla" value="${esc(cfg.sla)}" ${wfState.published ? 'disabled' : ''}></label></div><div class="wf-config-section"><h3>Điều kiện vào</h3><p>${s.entry}</p></div><div class="wf-config-section"><h3>Checklist bắt buộc để chuyển bước</h3>${s.checks.map((c, i) => `<div class="wf-check-preview"><span>${String(i + 1).padStart(2, '0')}</span>${c}${icon('check', 14)}</div>`).join('')}</div><div class="wf-config-section"><h3>Kết quả</h3><p>${s.exit}</p></div></section><section class="card wf-panel"><div class="section-head"><div><h2>Logic & phân nhánh</h2><p>Điều kiện quyết định đường đi của hồ sơ.</p></div></div><div class="wf-logic-row"><span class="wf-logic-line green"></span><span><strong>Đủ điều kiện</strong><small>Hoàn tất checklist → Chuyển sang ${wfStages[Math.min(index + 1, 7)].name}</small></span></div>${index === 1 ? '<div class="wf-logic-row"><span class="wf-logic-line amber"></span><span><strong>Khách chưa quyết định</strong><small>Đưa vào danh sách nuôi dưỡng và đặt lịch liên hệ lại</small></span></div>' : ''}${index === 3 ? '<div class="wf-logic-row"><span class="wf-logic-line red"></span><span><strong>Quản lý từ chối</strong><small>Trả dự thảo; bắt buộc gửi duyệt lại trước khi ký</small></span></div>' : ''}${index === 6 ? '<div class="wf-logic-row"><span class="wf-logic-line blue"></span><span><strong>Khách gia hạn</strong><small>Tạo chu kỳ mới và quay về bước Ký hợp đồng</small></span></div>' : ''}<div class="wf-config-section"><h3>Tự động hóa khi hoàn tất</h3><p>${s.automation}</p></div><div class="wf-note">Bản nháp cho phép sửa nhóm phụ trách và SLA. Nút “Xuất bản” sẽ áp dụng cấu hình mới cho bản mô phỏng.</div></section></div>`;
}
function wfAutomationView() {
  return `<div class="wf-block-head"><div><h2>Tự động hóa & thời hạn</h2><p>Trigger → điều kiện → hành động. Tắt hoặc bật từng quy tắc để xem ảnh hưởng khi chuyển bước.</p></div>${wfButton('Chạy thử quy tắc', 'test-rules', 'primary', 'spark')}</div><div class="wf-auto-layout"><section class="card wf-panel"><div class="section-head"><div><h2>Quy tắc đang cấu hình</h2><p>${wfState.rules.filter(r => r.enabled).length}/${wfState.rules.length} quy tắc đang bật</p></div></div><div class="wf-rule-table">${wfState.rules.map(rule => `<div class="wf-auto-rule"><span class="wf-auto-code">${rule.id}</span><div><strong>${rule.event}</strong><small>NẾU ${rule.condition}</small><span>THÌ ${rule.action}</span><em>${rule.channel}</em></div><button class="wf-toggle ${rule.enabled ? 'on' : ''}" data-wf-rule="${rule.id}" aria-label="${rule.enabled ? 'Tắt' : 'Bật'} quy tắc ${rule.id}" aria-pressed="${rule.enabled}"><i></i></button></div>`).join('')}</div></section><section class="card wf-panel"><div class="section-head"><div><h2>SLA & escalations</h2><p>Ai được nhắc khi quá thời hạn xử lý.</p></div></div>${wfStages.slice(0, 7).map((s, i) => `<div class="wf-sla-row"><span class="wf-sla-num">${String(i + 1).padStart(2, '0')}</span><span><strong>${s.name}</strong><small>${esc(wfState.stageConfig[i].owner)}</small></span><b>${esc(wfState.stageConfig[i].sla)}</b></div>`).join('')}<div class="wf-escalation">${icon('bell', 17)}<span><strong>Khi trễ SLA</strong><small>Nhắc người phụ trách → sau 2 giờ báo quản lý → gắn cờ tại bảng điều phối.</small></span></div></section></div>`;
}
function wfAuditView() {
  return `<div class="wf-block-head"><div><h2>Nhật ký quy trình</h2><p>Mọi thay đổi, phê duyệt và hành động tự động được ghi lại theo thời gian.</p></div>${wfTag(`${wfState.log.length} sự kiện`, 'blue')}</div><div class="card wf-audit-card">${wfState.log.map(row => `<div class="wf-audit-row"><span class="wf-audit-dot ${row.kind}">${icon(row.kind === 'automation' ? 'spark' : row.kind === 'approval' ? 'shield' : 'arrow', 13)}</span><div><strong>${esc(row.event)}</strong><small>${esc(row.actor)} · ${row.caseId === '—' ? 'Cấu hình' : `<button data-wf-case="${row.caseId}">${row.caseId}</button>`}</small></div><time>${esc(row.at)}</time></div>`).join('')}</div>`;
}
function wfCaseView() {
  const item = wfCurrentCase();
  if (!item) return wfCasesView();
  const stage = wfStages[item.stage], checks = wfChecks(item), ready = checks.every(Boolean) && (item.stage !== 3 || item.approval === 'approved');
  const isTerminal = ['Hoàn tất', 'Đã hủy', 'Nuôi dưỡng'].includes(item.status);
  return `<button class="wf-back" data-wf-tab="cases">← Trở lại danh sách hồ sơ</button><div class="wf-case-header card"><div><span class="wf-overline">${item.id} · CHU KỲ ${item.cycle}</span><h2>${esc(item.name)}</h2><p>${icon('pin', 13)} ${esc(item.unit)} · ${esc(item.budget)}</p></div><div class="wf-case-meta">${wfTag(item.status, wfStatusTone(item.status))}<small>Phụ trách: ${esc(item.owner)}<br>Hạn xử lý: ${esc(item.due)}</small></div></div><div class="wf-case-stepper">${wfStages.map((s, i) => `<button class="wf-case-step ${i < item.stage ? 'done' : i === item.stage ? 'current' : ''}" data-wf-stage="${i}" title="${s.name}"><span>${i < item.stage ? '✓' : i + 1}</span><small>${s.name}</small></button>`).join('')}</div><div class="wf-case-layout"><section class="card wf-panel"><div class="section-head"><div><span class="wf-overline">BƯỚC ${String(item.stage + 1).padStart(2, '0')} / 08</span><h2>${stage.name}</h2><p>${stage.exit}</p></div>${wfTag(wfState.stageConfig[item.stage].sla, 'blue')}</div>${isTerminal ? `<div class="wf-terminal">${icon('check', 19)} Hồ sơ đang ở trạng thái ${esc(item.status.toLocaleLowerCase('vi'))}.</div>${item.status !== 'Hoàn tất' ? `<div class="wf-action-line">${wfButton('Khôi phục hồ sơ', 'resume', 'soft', 'arrow')}</div>` : ''}` : `<div class="wf-checklist"><h3>Checklist bắt buộc <span>${checks.filter(Boolean).length}/${checks.length}</span></h3>${stage.checks.map((label, i) => `<label class="wf-check-item ${checks[i] ? 'done' : ''}"><input type="checkbox" data-wf-check="${i}" ${checks[i] ? 'checked' : ''} ${item.stage === 3 && i === 2 && item.approval !== 'approved' ? 'disabled' : ''}><span class="wf-check-box">${checks[i] ? icon('check', 13) : ''}</span><span><strong>${label}</strong><small>${['Hồ sơ / thao tác được lưu vào lịch sử.', 'Người phụ trách xác nhận hoàn thành.', 'Bắt buộc trước khi chuyển bước.'][i % 3]}</small></span></label>`).join('')}</div>${item.stage === 3 ? `<div class="wf-approval"><div><strong>Phê duyệt của quản lý</strong><small>${item.approval === 'approved' ? 'Đã duyệt · có thể ký và chuyển bước.' : item.approval === 'pending' ? 'Đang chờ quản lý xem xét dự thảo.' : item.approval === 'rejected' ? 'Bị từ chối · sửa dự thảo rồi gửi lại.' : 'Chưa gửi phê duyệt.'}</small></div>${wfTag(({ approved: 'Đã duyệt', pending: 'Chờ duyệt', rejected: 'Từ chối', none: 'Chưa gửi' })[item.approval], item.approval === 'approved' ? 'green' : item.approval === 'rejected' ? 'red' : 'amber')}</div>${item.approval === 'pending' ? `<div class="wf-action-line">${wfButton('Duyệt', 'approve', 'soft', 'check')}${wfButton('Từ chối', 'reject')}</div>` : item.approval !== 'approved' ? `<div class="wf-action-line">${wfButton('Gửi yêu cầu phê duyệt', 'request-approval', 'soft', 'shield')}</div>` : ''}` : ''}<div class="wf-gate ${ready ? 'ready' : ''}">${icon(ready ? 'check' : 'clock', 17)}<span>${ready ? 'Đủ điều kiện chuyển bước.' : item.stage === 3 && item.approval !== 'approved' ? 'Cần hoàn tất checklist và được quản lý phê duyệt.' : `Cần hoàn tất ${checks.filter(x => !x).length} mục checklist trước khi chuyển bước.`}</span></div><div class="wf-action-line">${item.stage === 6 ? `${wfButton('Gia hạn → chu kỳ mới', 'renew', checks[0] ? 'soft' : '')}${wfButton('Trả phòng → bước hoàn tất', 'advance', 'primary', 'arrow')}` : wfButton(item.stage === 7 ? 'Đóng hồ sơ' : 'Hoàn tất & chuyển bước', 'advance', 'primary', 'arrow')}${item.stage === 1 ? wfButton('Khách chưa sẵn sàng', 'nurture') : ''}${item.stage === 2 ? wfButton('Hủy giữ căn', 'cancel-reservation') : ''}</div>`}<p class="wf-guard-hint">${!isTerminal && item.stage === 6 ? 'Gia hạn cần mục thông báo trước hạn; trả phòng cần đủ 3 mục.' : !isTerminal && !ready ? 'Nút chuyển bước sẽ giải thích điều kiện còn thiếu khi nhấn.' : 'Mọi thao tác trong prototype chỉ thay đổi dữ liệu mẫu trên trang này.'}</p></section><aside class="wf-case-side"><div class="card wf-panel"><div class="section-head"><h2>Thông tin hồ sơ</h2></div><div class="wf-info-row"><span>Nguồn khách</span><strong>${esc(item.source)}</strong></div><div class="wf-info-row"><span>Ngày bắt đầu</span><strong>${esc(item.started)}</strong></div><div class="wf-info-row"><span>Người phụ trách</span><strong>${esc(item.owner)}</strong></div><div class="wf-info-row"><span>Nhóm xử lý bước này</span><strong>${esc(wfState.stageConfig[item.stage].owner)}</strong></div><div class="wf-info-row"><span>Thời hạn SLA</span><strong>${esc(wfState.stageConfig[item.stage].sla)}</strong></div></div><div class="card wf-panel"><div class="section-head"><h2>Tài liệu & dữ liệu liên quan</h2></div>${['Hồ sơ khách hàng', item.stage >= 2 ? 'Phiếu đặt chỗ' : 'Lịch xem', item.stage >= 3 ? 'Hợp đồng thuê' : 'Thông tin căn', item.stage >= 4 ? 'Biên bản bàn giao' : 'Bảng giá'].map((x, i) => `<button class="wf-doc-row" data-page="${['customers', 'bookings', item.stage >= 3 ? 'contracts' : 'properties', item.stage >= 4 ? 'operations' : 'properties'][i]}">${icon(i === 0 ? 'users' : 'file', 15)}<span>${x}</span>${icon('arrow', 13)}</button>`).join('')}</div><div class="card wf-panel"><div class="section-head"><h2>Lịch sử hồ sơ</h2></div><div class="timeline">${item.activity.slice(0, 5).map(x => `<div class="timeline-item"><strong>${esc(x.text)}</strong><p>${esc(x.at)}</p></div>`).join('')}</div></div></aside></div>`;
}
function wfCreateModal() {
  return `<div class="wf-modal-backdrop" data-wf-action="close-modal"><div class="wf-modal card" role="dialog" aria-modal="true" aria-label="Tạo hồ sơ workflow"><div class="modal-head"><div><h2>Khởi tạo hồ sơ workflow</h2><p>Hồ sơ mới bắt đầu từ bước Tiếp nhận.</p></div><button class="icon-btn" data-wf-action="close-modal" aria-label="Đóng">${icon('close', 16)}</button></div><form id="wf-create-form"><label class="form-field"><span>Khách hàng / doanh nghiệp</span><input name="name" placeholder="VD: Nguyễn Minh Anh" required></label><label class="form-field"><span>Căn / tòa nhà quan tâm</span><input name="unit" placeholder="VD: A-1208 · The Metropole" required></label><div class="form-row"><label class="form-field"><span>Ngân sách</span><input name="budget" placeholder="28 triệu/tháng" required></label><label class="form-field"><span>Nguồn khách</span><select name="source"><option>Website</option><option>Zalo</option><option>Đối tác</option><option>Giới thiệu</option></select></label></div><label class="form-field"><span>Người phụ trách</span><select name="owner"><option>Hoàng Linh</option><option>Thu Hà</option><option>Anh Nguyễn</option></select></label><div class="modal-actions">${wfButton('Hủy', 'close-modal')}<button class="btn primary" type="submit">${icon('plus', 14)} Tạo & mở hồ sơ</button></div></form></div></div>`;
}
function workflowStudio() {
  const content = wfState.tab === 'canvas' ? wfCanvasView() : wfState.tab === 'runs' ? cbRunsView() : wfState.tab === 'board' ? wfBoard() : wfState.tab === 'cases' ? wfCasesView() : wfState.tab === 'design' ? wfDesignView() : wfState.tab === 'automation' ? wfAutomationView() : wfState.tab === 'audit' ? wfAuditView() : wfCaseView();
  return `${header('Workflow builder', 'Thiết kế workflow tự động', 'Tạo trigger, nối action, rẽ nhánh điều kiện và chạy thử với dữ liệu bất động sản.', wfButton('Mẫu quy trình thuê', 'show-template', '', 'grid') + wfButton('Tạo workflow mới', 'new-workflow', 'primary', 'plus'))}${wfTabs()}${content}${wfState.modal === 'create' ? wfCreateModal() : ''}`;
}

document.addEventListener('click', event => {
  const tab = event.target.closest('[data-wf-tab]');
  if (tab) { wfState.tab = tab.dataset.wfTab; render(); return; }
  const stage = event.target.closest('[data-wf-stage]');
  if (stage) { wfState.selectedStage = Number(stage.dataset.wfStage); if (wfState.tab === 'detail') wfState.tab = 'design'; render(); return; }
  const itemEl = event.target.closest('[data-wf-case]');
  if (itemEl) { wfState.selectedCase = itemEl.dataset.wfCase; wfState.tab = 'detail'; render(); return; }
  const ruleEl = event.target.closest('[data-wf-rule]');
  if (ruleEl) { const rule = wfState.rules.find(r => r.id === ruleEl.dataset.wfRule); rule.enabled = !rule.enabled; wfState.log.unshift({ at: '01/10 · vừa xong', actor: 'Bạn (demo)', event: `${rule.enabled ? 'Bật' : 'Tắt'} quy tắc ${rule.id}: ${rule.event}`, caseId: '—', kind: 'action' }); render(); return; }
  const actionEl = event.target.closest('[data-wf-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.wfAction;
  const item = wfCurrentCase();
  if (action === 'close-modal') { if (actionEl.classList.contains('wf-modal-backdrop') && event.target !== actionEl) return; wfState.modal = null; render(); return; }
  if (action === 'new-case') { wfState.modal = 'create'; render(); return; }
  if (action === 'open-demo') { wfState.selectedCase = 'FL-2026-104'; wfState.tab = 'detail'; render(); return; }
  if (action === 'design') { wfState.tab = 'design'; render(); return; }
  if (action === 'show-template') { wfState.tab = 'board'; render(); return; }
  if (action === 'new-workflow') { wfState.tab = 'canvas'; cbNewWorkflow(); return; }
  if (action === 'make-draft') { wfState.published = false; wfState.log.unshift({ at: '01/10 · vừa xong', actor: 'Bạn (demo)', event: `Tạo bản nháp v1.${wfState.version + 1}`, caseId: '—', kind: 'action' }); render(); return; }
  if (action === 'publish') { wfState.published = true; wfState.version += 1; wfState.log.unshift({ at: '01/10 · vừa xong', actor: 'Bạn (demo)', event: `Xuất bản quy trình v1.${wfState.version}`, caseId: '—', kind: 'action' }); render(); return; }
  if (action === 'test-rules') { wfState.log.unshift({ at: '01/10 · vừa xong', actor: 'Hệ thống', event: `Chạy thử ${wfState.rules.filter(r => r.enabled).length} quy tắc đang bật`, caseId: '—', kind: 'automation' }); notify('Đã chạy thử các quy tắc đang bật; xem kết quả trong Nhật ký.'); return; }
  if (!item) return;
  if (action === 'resume' && item.status !== 'Hoàn tất') { item.status = 'Đang chạy'; if (item.stage === 2) item.stage = 1; wfRecord(item, 'Khôi phục hồ sơ để tiếp tục xử lý', 'transition'); render(); return; }
  if (action === 'advance' || action === 'renew') {
    const checks = wfChecks(item);
    if (action === 'renew' && item.stage === 6) { if (!checks[0]) { notify('Cần thông báo trước hạn trước khi tạo chu kỳ gia hạn.'); return; } item.cycle += 1; item.approval = 'none'; item.checks[3] = [false, false, false]; wfMove(item, 3); wfRecord(item, `Bắt đầu chu kỳ gia hạn ${item.cycle}`, 'automation'); render(); return; }
    if (!checks.every(Boolean)) { notify(`Còn ${checks.filter(x => !x).length} mục checklist cần hoàn tất.`); return; }
    if (item.stage === 3 && item.approval !== 'approved') { notify('Hợp đồng cần được quản lý phê duyệt trước khi chuyển bước.'); return; }
    if (item.stage === 7) { item.status = 'Hoàn tất'; item.due = 'Đã đóng'; wfRecord(item, 'Đóng hồ sơ và giải phóng căn', 'transition'); }
    else wfMove(item, item.stage + 1);
    render(); return;
  }
  if (action === 'request-approval') { if (!wfChecks(item).slice(0, 2).every(Boolean)) { notify('Cần soạn và kiểm tra điều khoản trước khi gửi duyệt.'); return; } item.approval = 'pending'; item.status = 'Chờ duyệt'; wfRecord(item, 'Gửi dự thảo hợp đồng cho quản lý phê duyệt', 'approval'); wfRunRule(item, 'R04'); render(); return; }
  if (action === 'approve') { item.approval = 'approved'; item.status = 'Đang chạy'; wfRecord(item, 'Quản lý phê duyệt hợp đồng', 'approval'); render(); return; }
  if (action === 'reject') { item.approval = 'rejected'; item.status = 'Ngoại lệ'; item.checks[3] = [false, false, false]; wfRecord(item, 'Quản lý từ chối; trả dự thảo để sửa', 'approval'); render(); return; }
  if (action === 'nurture' && item.stage === 1) { item.status = 'Nuôi dưỡng'; wfRecord(item, 'Khách chưa sẵn sàng; chuyển sang chăm sóc lại', 'transition'); render(); return; }
  if (action === 'cancel-reservation' && item.stage === 2) { item.status = 'Đã hủy'; wfRecord(item, 'Hủy giữ căn; giải phóng tồn kho', 'transition'); render(); return; }
});
document.addEventListener('change', event => {
  if (event.target.matches('[data-wf-check]')) { const item = wfCurrentCase(); if (!item) return; const checkIndex = Number(event.target.dataset.wfCheck); const checks = wfChecks(item).slice(); checks[checkIndex] = event.target.checked; item.checks[item.stage] = checks; wfRecord(item, `${event.target.checked ? 'Hoàn tất' : 'Bỏ xác nhận'}: ${wfStages[item.stage].checks[checkIndex]}`); if (item.stage === 1 && checkIndex === 1 && event.target.checked) wfRunRule(item, 'R02'); render(); return; }
  if (event.target.id === 'wf-filter') { wfState.filter = event.target.value; render(); return; }
  if (event.target.id === 'wf-owner' || event.target.id === 'wf-sla') { const field = event.target.id === 'wf-owner' ? 'owner' : 'sla'; wfState.stageConfig[wfState.selectedStage][field] = event.target.value; wfState.log.unshift({ at: '01/10 · vừa xong', actor: 'Bạn (demo)', event: `Sửa ${field === 'owner' ? 'nhóm phụ trách' : 'SLA'} bước ${wfStages[wfState.selectedStage].name}: ${event.target.value}`, caseId: '—', kind: 'action' }); render(); }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'wf-search') return;
  wfState.search = event.target.value;
  const position = event.target.selectionStart;
  render();
  const field = document.getElementById('wf-search');
  field?.focus(); field?.setSelectionRange(position, position);
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'wf-create-form') return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const nextId = `FL-2026-${Math.max(...wfState.cases.map(item => Number(item.id.split('-').at(-1)))) + 1}`;
  const item = { id: nextId, name: data.name, unit: data.unit, stage: 0, owner: data.owner, due: '01/10 · 17:00', status: 'Đang chạy', checks: {}, approval: 'none', cycle: 1, source: data.source, budget: data.budget, started: '01/10/2026', activity: [] };
  wfState.cases.unshift(item);
  wfState.selectedCase = nextId;
  wfState.tab = 'detail';
  wfState.modal = null;
  wfRecord(item, 'Khởi tạo hồ sơ workflow từ nguồn ' + data.source);
  wfRunRule(item, 'R01');
  render();
});
