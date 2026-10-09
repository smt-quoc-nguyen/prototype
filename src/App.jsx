import WorkflowBuilder from "./StepWorkflowBuilder.jsx";
import { TYPE_LABELS } from "./maintenance-workflow.js";
import GraphRunDetails from "./GraphRunDetails.jsx";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  Building2,
  LayoutDashboard,
  Ticket,
  Wrench,
  Workflow,
  Bell,
  Plus,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  LogOut,
  Check,
  X,
  Clock3,
  CircleCheck,
  Play,
  Pause,
  Search,
  Layers,
  FileText,
  ExternalLink,
  Zap,
  ShieldCheck,
  Send,
  Activity,
  MapPin,
  Settings2,
  Info,
  Menu,
} from "lucide-react";
import { USERS, TYPES } from "./engine.js";
import {
  subscribe,
  getSnapshot,
  refresh,
  dispatch,
  enableNotifications,
  registerWorker,
} from "./browser-store.js";
const labels = {
  submitted: "Đã gửi",
  approved: "Đã duyệt",
  inprogress: "Đang xử lý",
  resolved: "Hoàn tất",
  cancelled: "Đã hủy",
  todo: "Cần làm",
  "in-progress": "Đang làm",
  pause: "Tạm dừng",
  completed: "Hoàn thành",
  closed: "Đã đóng",
  "waiting-approval": "Chờ duyệt",
  "waiting-event": "Chờ công việc hoặc trạng thái",
  "waiting-data": "Chờ công việc liên quan",
  "waiting-workorder": "Chờ công việc",
  "waiting-linked-workorders": "Chờ việc liên quan",
  running: "Đang chạy",
  rejected: "Từ chối",
  error: "Lỗi quy trình",
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
};
const roleNames = { tenant: "Tenant", maintainer: "Maintainer", pms: "PMS" };
const short = (value) =>
  value ? value.split("-").slice(0, 2).join("-").toUpperCase() : "—";
const time = (value) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(value))
    : "—";
const actorName = (value) =>
  Object.values(USERS).find((u) => u.id === value)?.name ||
  (value === "workflow" ? "Quy trình tự động" : value || "—");
function auditLabel(event) {
  const exact = {
    "ticket.created": "Đã tiếp nhận yêu cầu",
    "workorder.completed": "Hoàn thành công việc",
    "ticket.resolved": "Hoàn tất yêu cầu",
  };
  return (
    exact[event] ||
    event
      .replace("Cập nhật ticket.status", "Cập nhật trạng thái yêu cầu")
      .replace("Cập nhật workorder.status", "Cập nhật trạng thái công việc")
      .replace("Phê duyệt node:", "Phê duyệt bước:")
      .replace("Từ chối node:", "Từ chối bước:")
      .replace("Tạo work order:", "Giao công việc:")
      .replace("workflow", "quy trình")
  );
}
function Badge({ value }) {
  return <span className={`badge ${value}`}>{labels[value] || value}</span>;
}
function Button({ children, icon: Icon, primary, className = "", ...props }) {
  return (
    <button
      className={`btn ${primary ? "primary" : ""} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Layers size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function AsyncCheckbox({ checked, disabled, change }) {
  const [value, setValue] = useState(checked);
  useEffect(() => setValue(checked), [checked]);
  return (
    <input
      type="checkbox"
      checked={value}
      disabled={disabled}
      onChange={async (e) => {
        const next = e.target.checked;
        setValue(next);
        if (!(await change(next))) setValue(checked);
      }}
    />
  );
}
function SLA({ item }) {
  const stoppedAt =
    item.closedAt || (item.status === "cancelled" ? item.processedTime : null);
  const elapsed = (end) =>
    Math.max(
      0,
      Math.round(
        (new Date(end || stoppedAt || Date.now()) - new Date(item.createdAt)) /
          60000,
      ),
    );
  return (
    <div className="sla-grid">
      {[
        ["Phản hồi", item.responsedTime, item.responseTimeSLA],
        ["Xử lý", item.processedTime, item.processTimeSLA],
      ].map(([name, end, limit]) => (
        <div
          key={name}
          className={elapsed(end) > limit ? "sla overdue" : "sla"}
        >
          <span>{name} SLA</span>
          <strong>
            {elapsed(end)} / {limit} phút
          </strong>
          <small>
            {end
              ? "Đã ghi nhận"
              : stoppedAt
                ? "Đã dừng"
                : "Đang tính từ lúc tạo"}
          </small>
        </div>
      ))}
    </div>
  );
}
export default function App() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  const query = new URLSearchParams(location.search),
    initRole = USERS[query.get("app")] ? query.get("app") : "pms";
  const [role, setRole] = useState(initRole),
    [page, setPage] = useState(query.get("view") || "dashboard");
  const [modal, setModal] = useState(null),
    [detail, setDetail] = useState(query.get("ticket")),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState([]),
    [mobile, setMobile] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  );
  useEffect(() => {
    refresh()
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
    registerWorker().catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const t = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!modal && !detail) return;
    const previous = document.activeElement;
    const root =
      document.querySelector(".modal") || document.querySelector(".drawer");
    if (!root) return;
    const focusables = () =>
      [
        ...root.querySelectorAll(
          "button:not(:disabled), input:not(:disabled), select, textarea, a[href]",
        ),
      ].filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus();
    function keydown(e) {
      if (e.key === "Escape") {
        if (modal) setModal(null);
        else setDetail(null);
        setError("");
      }
      if (e.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [modal, detail, ready]);
  const notice = s.notifications.filter(
      (n) =>
        n.recipient === USERS[role].id &&
        (!n.channels || n.channels.includes("in-app")),
    ),
    unread = notice.filter((n) => !n.read).length;
  const tickets = s.tickets.filter(
    (t) => role !== "tenant" || t.customer === USERS.tenant.id,
  );
  const orders = s.workOrders.filter(
    (w) => role !== "maintainer" || w.assignees.includes(USERS.maintainer.id),
  );
  const nav = [
    ["dashboard", "Tổng quan", LayoutDashboard],
    ...(role !== "maintainer"
      ? [["tickets", role === "tenant" ? "Yêu cầu của tôi" : "Tickets", Ticket]]
      : []),
    ...(role !== "tenant"
      ? [
          [
            "orders",
            role === "maintainer" ? "Công việc của tôi" : "Công việc",
            Wrench,
          ],
        ]
      : []),
    ...(role === "pms"
      ? [
          ["templates", "Mẫu công việc", FileText],
          ["workflows", "Quy trình xử lý", Workflow],
          ["runs", "Tiến độ & nhật ký", Activity],
        ]
      : []),
    ["notifications", "Thông báo", Bell],
    ["guide", "Hướng dẫn prototype", Info],
  ];
  const actualPage = nav.some((n) => n[0] === page) ? page : "dashboard";
  async function act(type, payload = {}, message = "Đã lưu thay đổi") {
    setBusy(true);
    setError("");
    try {
      await dispatch({ type, payload, role });
      setToast(message);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function go(p) {
    setPage(p);
    setSearch("");
    setFilter("all");
    setSelected([]);
    setMobile(false);
    const u = new URL(location.href);
    u.search = `?app=${role}&view=${p}`;
    history.replaceState(null, "", u);
  }
  function switchRole(r) {
    setRole(r);
    go("dashboard");
    setDetail(null);
    setModal(null);
    const u = new URL(location.href);
    u.search = `?app=${r}`;
    history.replaceState(null, "", u);
  }
  function openNotice(n) {
    void act("READ_NOTIFICATION", { id: n.id }, "Đã đọc thông báo");
    if (!n.ticketId && !n.workOrderId) {
      go("notifications");
      return;
    }
    if (
      role === "maintainer" ||
      (n.context?.resource === "workorder" && role === "pms")
    ) {
      go("orders");
      setSearch(n.workOrderId || "");
    } else {
      go("tickets");
      setDetail(n.ticketId);
    }
  }
  const ticket = tickets.find((t) => t.id === detail);
  const title = nav.find((n) => n[0] === actualPage)?.[1];
  function approval(t, requestedNodeId = null) {
    const run = s.runs.find(
      (r) => r.ticketId === t.id && r.status === "waiting-approval",
    );
    if (!run || role !== "pms") return null;
    const pending = run.nodeStates
      ? Object.entries(run.approvals)
          .filter(
            ([nodeId, a]) =>
              a.status === "pending" &&
              (!requestedNodeId || requestedNodeId === nodeId),
          )
          .map(([nodeId]) => nodeId)
      : [null];
    return pending.map((nodeId) => (
      <div className="approval-box" key={nodeId || run.id}>
        <ShieldCheck size={20} />
        <div>
          <strong>Yêu cầu đang chờ phê duyệt</strong>
          {nodeId && (
            <small className="approval-node-title">
              {run.workflow.nodes.find((n) => n.id === nodeId)?.title}
            </small>
          )}
          <p>
            {nodeId &&
            run.workflow.transitions.some(
              (e) => e.source === nodeId && e.sourceHandle === "rejected",
            )
              ? "Quyết định sẽ kích hoạt nhánh Approved hoặc Rejected đã cấu hình."
              : "Duyệt để tiếp tục xử lý. Từ chối sẽ hủy yêu cầu và báo lý do cho người gửi."}
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={() => setModal({ type: "reject", runId: run.id, nodeId })}
        >
          Từ chối
        </Button>
        <Button
          primary
          disabled={busy}
          icon={Check}
          onClick={() =>
            act(
              "APPROVE",
              { runId: run.id, nodeId },
              "Đã phê duyệt · tiếp tục xử lý",
            )
          }
        >
          Phê duyệt
        </Button>
      </div>
    ));
  }
  function metrics() {
    const values =
      role === "maintainer"
        ? [
            orders.filter((w) => w.status === "todo").length,
            orders.filter((w) => w.status === "in-progress").length,
            orders.filter(
              (w) =>
                w.status === "completed" ||
                (w.status === "closed" && w.processedTime),
            ).length,
            unread,
          ]
        : [
            tickets.filter((t) => !["resolved", "cancelled"].includes(t.status))
              .length,
            s.runs.filter(
              (r) =>
                r.status === "waiting-approval" &&
                tickets.some((t) => t.id === r.ticketId),
            ).length,
            tickets.filter((t) => t.status === "resolved").length,
            unread,
          ];
    const names =
      role === "maintainer"
        ? [
            "Công việc cần làm",
            "Đang thực hiện",
            "Đã hoàn thành",
            "Thông báo chưa đọc",
          ]
        : [
            "Yêu cầu đang mở",
            "Chờ phê duyệt",
            "Đã hoàn tất",
            "Thông báo chưa đọc",
          ];
    return (
      <div className="metrics">
        {names.map((n, i) => (
          <div className="metric card" key={n}>
            <div className="metric-top">
              {n}
              <span className={`metric-icon tone-${i}`}>
                {React.createElement([Ticket, Clock3, CircleCheck, Bell][i], {
                  size: 18,
                })}
              </span>
            </div>
            <strong>{String(values[i]).padStart(2, "0")}</strong>
            <small>
              {
                [
                  "Dữ liệu trong trình duyệt",
                  "Cập nhật theo sự kiện",
                  "Kết quả thực tế",
                  "Theo người dùng hiện tại",
                ][i]
              }
            </small>
          </div>
        ))}
      </div>
    );
  }
  async function moveOut(ticketIds) {
    if (await act("UNGROUP_TICKETS", { ticketIds }, "Đã đưa ticket ra khỏi nhóm")) {
      setSelected((current) => current.filter((tid) => !ticketIds.includes(tid)));
      setCollapsedGroups((current) => current.filter((gid) => gid !== "ungrouped"));
    }
  }
  function ticketTable(list, compact = false) {
    const buckets = compact ? [] : [
      ...s.groups.map((g) => ({
        ...g,
        members: list.filter((t) => t.groupId === g.id),
        total: tickets.filter((t) => t.groupId === g.id).length,
      })),
      {
        id: "ungrouped",
        name: "Chưa gom nhóm",
        members: list.filter((t) => !s.groups.some((g) => g.id === t.groupId)),
        total: tickets.filter((t) => !s.groups.some((g) => g.id === t.groupId)).length,
      },
    ].filter((g) => g.members.length);
    const renderTicket = (t, nested = false) => (
      <tr key={t.id} className={nested ? "ticket-child-row" : ""}>
        {!compact && role === "pms" && (
          <td>
            <input
              aria-label={`Chọn ${t.title}`}
              type="checkbox"
              checked={selected.includes(t.id)}
              onChange={(e) => {
                const checked = e.target.checked;
                setSelected((current) => checked
                  ? [...new Set([...current, t.id])]
                  : current.filter((x) => x !== t.id));
              }}
            />
          </td>
        )}
        <td className={nested ? "ticket-child-title" : ""}>
          <button className="table-title" onClick={() => setDetail(t.id)}>
            {t.title}
          </button>
          <small>{short(t.id)} · {TYPE_LABELS[t.type] || t.type}</small>
        </td>
        <td>{t.location}<small>{t.area}</small></td>
        <td><Badge value={t.priority} /></td>
        <td><Badge value={t.status} /></td>
        {!compact && <td>{time(t.createdAt)}</td>}
        <td>
          <div className="ticket-row-actions">
            {!compact && role === "pms" && t.groupId && (
              <button
                className="ticket-move-out"
                aria-label={`Đưa ${t.title} khỏi nhóm`}
                disabled={busy}
                onClick={() => moveOut([t.id])}
              >
                <LogOut size={14} /> Đưa khỏi nhóm
              </button>
            )}
            <button className="icon-btn" aria-label={`Xem ${t.title}`} onClick={() => setDetail(t.id)}>
              <ChevronRight size={17} />
            </button>
          </div>
        </td>
      </tr>
    );
    return list.length ? (
      <div className="table-scroll">
        <table className={!compact ? "ticket-group-table" : ""}>
          <thead>
            <tr>
              {!compact && role === "pms" && <th><span className="sr-only">Chọn</span></th>}
              <th>Ticket / Yêu cầu</th>
              <th>Vị trí</th>
              <th>Ưu tiên</th>
              <th>Trạng thái</th>
              {!compact && <th>Ngày tạo</th>}
              <th></th>
            </tr>
          </thead>
          {compact ? <tbody>{list.map((t) => renderTicket(t))}</tbody> : buckets.map((g) => {
            const collapsed = collapsedGroups.includes(g.id);
            const selectable = g.id === "ungrouped" ? g.members : tickets.filter((t) => t.groupId === g.id);
            const checkedCount = selectable.filter((t) => selected.includes(t.id)).length;
            return (
              <tbody key={g.id} data-ticket-group={g.id}>
                <tr className="ticket-group-row">
                  {role === "pms" && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Chọn tất cả trong ${g.name}`}
                        checked={checkedCount === selectable.length}
                        ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && checkedCount < selectable.length; }}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const ids = selectable.map((t) => t.id);
                          setSelected((current) => checked
                            ? [...new Set([...current, ...ids])]
                            : current.filter((tid) => !ids.includes(tid)));
                        }}
                      />
                    </td>
                  )}
                  <td colSpan={6}>
                    <button
                      className="ticket-group-toggle"
                      aria-expanded={!collapsed}
                      onClick={() => setCollapsedGroups((current) => collapsed
                        ? current.filter((gid) => gid !== g.id)
                        : [...current, g.id])}
                    >
                      {collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                      {g.id === "ungrouped" ? <Ticket size={17} /> : <Layers size={17} />}
                      <strong>{g.name}</strong>
                      <span className="ticket-group-count">
                        {g.members.length === g.total ? `${g.total} ticket` : `${g.members.length} / ${g.total} ticket`}
                      </span>
                    </button>
                  </td>
                </tr>
                {!collapsed && g.members.map((t) => renderTicket(t, true))}
              </tbody>
            );
          })}
        </table>
      </div>
    ) : (
      <Empty
        title={tickets.length ? "Không tìm thấy ticket" : "Chưa có yêu cầu"}
        text={tickets.length ? "Thử đổi từ khóa hoặc bộ lọc trạng thái." : "Tạo ticket đầu tiên để bắt đầu quy trình xử lý."}
      >
        {!tickets.length && <Button primary icon={Plus} onClick={() => setModal({ type: "ticket" })}>Tạo yêu cầu</Button>}
      </Empty>
    );
  }
  function orderCard(w) {
    const linked = s.links
      .filter((l) => l.workOrderId === w.id)
      .map((l) => s.tickets.find((t) => t.id === l.ticketId));
    return (
      <article className="card order-card" key={w.id}>
        <div className="row-between">
          <span className="overline">
            {short(w.id)} {w.runId ? "· WORKFLOW" : "· THỦ CÔNG"}
          </span>
          <Badge value={w.status} />
        </div>
        <h3>{w.title}</h3>
        <div className="order-meta">
          <MapPin size={14} />
          {linked.map((t) => t.location).join(" · ")}
          <Badge value={w.priority} />
        </div>
        <div className="linked-tags">
          {linked.map((t) => (
            <button
              key={t.id}
              className="chip"
              onClick={() => {
                if (role === "pms") setDetail(t.id);
              }}
            >
              {t.title} {t.status === "cancelled" && "· đã hủy"}
            </button>
          ))}
        </div>
        <SLA item={w} />
        <div className="checklist">
          {w.checklist.length ? (
            w.checklist.map((c, i) => (
              <label key={i}>
                <AsyncCheckbox
                  checked={c.done}
                  disabled={busy || ["completed", "closed"].includes(w.status)}
                  change={(done) =>
                    act(
                      "WO_CHECK",
                      { workOrderId: w.id, index: i, done },
                      "Checklist đã cập nhật",
                    )
                  }
                />
                <span>{c.text}</span>
              </label>
            ))
          ) : (
            <p>Work order tự tạo không có checklist.</p>
          )}
        </div>
        {w.note && <p className="muted">{w.note}</p>}
        <div className="order-footer">
          <span className="person">
            <span className="avatar tiny">HN</span>Trần Hoàng Nam
          </span>
          <div className="actions">
            {["todo", "pause"].includes(w.status) && (
              <Button
                primary
                icon={Play}
                disabled={busy}
                onClick={() =>
                  act(
                    "WO_STATUS",
                    { workOrderId: w.id, status: "in-progress" },
                    "Đã bắt đầu công việc",
                  )
                }
              >
                {w.status === "pause" ? "Tiếp tục" : "Bắt đầu"}
              </Button>
            )}
            {w.status === "in-progress" && (
              <>
                <Button
                  icon={Pause}
                  disabled={busy}
                  onClick={() =>
                    act("WO_STATUS", { workOrderId: w.id, status: "pause" })
                  }
                >
                  Tạm dừng
                </Button>
                <Button
                  primary
                  icon={Check}
                  disabled={busy || w.checklist.some((c) => !c.done)}
                  onClick={() =>
                    act(
                      "WO_STATUS",
                      { workOrderId: w.id, status: "completed" },
                      "Đã hoàn thành · chuyển sang bước tiếp theo",
                    )
                  }
                >
                  Hoàn thành
                </Button>
              </>
            )}
            {w.status === "completed" && role === "pms" && (
              <Button
                disabled={busy}
                onClick={() =>
                  act("WO_STATUS", { workOrderId: w.id, status: "closed" })
                }
              >
                Đóng work order
              </Button>
            )}
          </div>
        </div>
      </article>
    );
  }
  return (
    <div className="shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Building2 size={24} />
          </span>
          smart<span>os</span>
          <span className="brand-dot">•</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={20} />
          </span>
          <div>
            <strong>Saigon Centre</strong>
            <small>Maintenance workspace</small>
          </div>
        </div>
        <div className="nav-label">{roleNames[role]} WORKSPACE</div>
        <nav>
          {nav.map(([p, name, Icon]) => (
            <button
              key={p}
              className={actualPage === p ? "active" : ""}
              onClick={() => go(p)}
            >
              <Icon size={18} />
              {name}
              {p === "notifications" && unread > 0 && (
                <span className="nav-count">{unread}</span>
              )}
              {actualPage === p && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="live-dot" />
            <strong>Browser workspace</strong>
            <p>
              Ba app · cùng một dữ liệu
              <br />
              Realtime trên các tab cùng origin
            </p>
            <a
              href={`/?app=${role === "tenant" ? "pms" : "tenant"}`}
              target="_blank"
              rel="noreferrer"
            >
              Mở app khác <ExternalLink size={13} />
            </a>
          </div>
          <div className="profile">
            <span className="avatar">
              {role === "pms" ? "TV" : role === "tenant" ? "MA" : "HN"}
            </span>
            <div>
              <strong>{USERS[role].name}</strong>
              <small>
                {role === "pms"
                  ? "Quản lý tòa nhà"
                  : role === "tenant"
                    ? "Khách thuê · VP-03"
                    : "Kỹ thuật viên · HVAC"}
              </small>
            </div>
            <Settings2 size={16} />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Menu"
            >
              <Menu size={18} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="top-right">
            <div className="app-switch" aria-label="Chọn ứng dụng">
              {Object.keys(USERS).map((r) => (
                <button
                  className={role === r ? "active" : ""}
                  key={r}
                  onClick={() => switchRole(r)}
                >
                  {roleNames[r]}
                </button>
              ))}
            </div>
            <button
              className="icon-btn bell-button"
              aria-label="Thông báo"
              onClick={() => go("notifications")}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <span className="avatar small">
              {role === "pms" ? "TV" : role === "tenant" ? "MA" : "HN"}
            </span>
          </div>
        </header>
        <main className="page">
          <div className="page-heading">
            <div>
              <span className="overline">SMARTOS / MAINTENANCE</span>
              <h1>
                {actualPage === "dashboard"
                  ? role === "tenant"
                    ? "Không gian tốt hơn, mỗi ngày."
                    : role === "maintainer"
                      ? "Một ngày làm việc hiệu quả."
                      : "Vận hành liền mạch."
                  : title}
              </h1>
              <p>
                {actualPage === "dashboard"
                  ? `Chào ${USERS[role].name.split(" ").slice(-2).join(" ")}, đây là tình hình bảo trì của bạn.`
                  : {
                      tickets:
                        "Tiếp nhận, theo dõi và xử lý yêu cầu trong một không gian.",
                      orders:
                        "Từng công việc rõ ràng. Từng bước xử lý được ghi nhận.",
                      templates:
                        "Chuẩn hoá checklist và SLA cho các công việc lặp lại.",
                      workflows:
                        "Thiết kế luồng xử lý tự động, từ yêu cầu đến hoàn tất.",
                      runs: "Theo dõi bước đang chờ và lịch sử xử lý yêu cầu.",
                      notifications: "Những cập nhật mới nhất dành cho bạn.",
                      guide:
                        "Cách chạy và giới hạn của prototype không backend.",
                    }[actualPage]}
              </p>
            </div>
            <div className="actions">
              <span className="sync-label">
                <span className="live-dot" />
                {ready ? "Đã đồng bộ" : "Đang kết nối"}
              </span>
              {["dashboard", "tickets"].includes(actualPage) &&
                role !== "maintainer" && (
                  <Button
                    primary
                    icon={Plus}
                    onClick={() => setModal({ type: "ticket" })}
                  >
                    {role === "tenant" ? "Tạo yêu cầu" : "Tạo ticket"}
                  </Button>
                )}
              {actualPage === "orders" && role === "pms" && (
                <Button
                  primary
                  icon={Plus}
                  onClick={() => setModal({ type: "order" })}
                >
                  Tạo work order
                </Button>
              )}
              {actualPage === "templates" && (
                <Button
                  primary
                  icon={Plus}
                  onClick={() => setModal({ type: "template" })}
                >
                  Tạo template
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error-banner">
              <Info size={17} />
              {error}
              <button onClick={() => setError("")} aria-label="Đóng lỗi">
                <X size={16} />
              </button>
            </div>
          )}
          {actualPage === "dashboard" && (
            <>
              {metrics()}
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <Zap size={14} />{" "}
                    {s.workflows.some(
                      (w) =>
                        w.published &&
                        w.triggerType === "Equipment malfunction",
                    )
                      ? "QUY TRÌNH ĐANG ÁP DỤNG"
                      : "QUY TRÌNH MẪU · CHƯA XUẤT BẢN"}
                  </span>
                  <h2>
                    Từ sự cố đến giải pháp.
                    <br />
                    Tự động, từng bước.
                  </h2>
                  <p>
                    Phê duyệt yêu cầu, giao việc kiểm tra và sửa chữa điều hoà.
                    <br />
                    Mỗi người nhận đúng thông tin, đúng thời điểm.
                  </p>
                  <div className="actions">
                    <Button
                      primary
                      icon={role === "pms" ? Workflow : ArrowUpRight}
                      onClick={() =>
                        go(
                          role === "pms"
                            ? "workflows"
                            : role === "maintainer"
                              ? "orders"
                              : "tickets",
                        )
                      }
                    >
                      {role === "pms"
                        ? "Xem quy trình"
                        : role === "maintainer"
                          ? "Xem công việc"
                          : "Xem yêu cầu"}
                    </Button>
                    <a
                      className="hero-link"
                      href="/?app=tenant"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Mở Tenant app <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
                <div className="hero-flow">
                  <div className="hero-node">
                    <Ticket size={19} />
                    <div>
                      <strong>Yêu cầu mới</strong>
                      <small>Sự cố thiết bị</small>
                    </div>
                    <Check size={15} />
                  </div>
                  <div className="hero-line" />
                  <div className="hero-node">
                    <ShieldCheck size={19} />
                    <div>
                      <strong>Phê duyệt & giao việc</strong>
                      <small>Kiểm tra → sửa chữa máy lạnh</small>
                    </div>
                    <Activity size={16} />
                  </div>
                  <div className="hero-line" />
                  <div className="hero-node">
                    <CircleCheck size={19} />
                    <div>
                      <strong>Hoàn tất & thông báo</strong>
                      <small>Tenant · Maintainer · PMS</small>
                    </div>
                  </div>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>
                        {role === "maintainer"
                          ? "Công việc gần đây"
                          : "Yêu cầu gần đây"}
                      </h2>
                      <p>Cập nhật trực tiếp từ các ứng dụng</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        go(role === "maintainer" ? "orders" : "tickets")
                      }
                    >
                      Xem tất cả <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {role === "maintainer" ? (
                    orders.length ? (
                      orders.slice(0, 3).map((w) => (
                        <button
                          className="list-row"
                          key={w.id}
                          onClick={() => {
                            go("orders");
                            setSearch(w.id);
                          }}
                        >
                          <span className="list-icon">
                            <Wrench size={18} />
                          </span>
                          <span>
                            <strong>{w.title}</strong>
                            <small>{short(w.id)}</small>
                          </span>
                          <Badge value={w.status} />
                        </button>
                      ))
                    ) : (
                      <Empty
                        title="Bạn đã sẵn sàng"
                        text="Work order sẽ xuất hiện sau khi PMS duyệt ticket."
                      />
                    )
                  ) : (
                    ticketTable(tickets.slice(0, 5), true)
                  )}
                </section>
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Hoạt động mới</h2>
                      <p>Thông tin dành cho bạn</p>
                    </div>
                    <Bell size={17} />
                  </div>
                  <div className="activity-list">
                    {notice.length ? (
                      notice.slice(0, 5).map((n) => (
                        <button
                          className="activity-item"
                          key={n.id}
                          onClick={() => openNotice(n)}
                        >
                          <span className={`activity-dot ${n.kind}`} />
                          <div>
                            <strong>{n.title}</strong>
                            <small>{time(n.createdAt)}</small>
                          </div>
                          {!n.read && <span className="unread-dot" />}
                        </button>
                      ))
                    ) : (
                      <Empty
                        title="Chưa có cập nhật"
                        text="Thông báo sẽ được gửi khi yêu cầu đến bước xử lý tương ứng."
                      />
                    )}
                  </div>
                  <div className="card-footer">
                    <span className="live-dot" /> IndexedDB + BroadcastChannel
                  </div>
                </section>
              </div>
              {role === "pms" &&
                tickets
                  .filter((t) =>
                    s.runs.some(
                      (r) =>
                        r.ticketId === t.id && r.status === "waiting-approval",
                    ),
                  )
                  .map((t) => (
                    <div key={t.id} className="pending-card">
                      <button
                        className="text-button"
                        onClick={() => setDetail(t.id)}
                      >
                        {t.title}
                      </button>
                      {approval(t)}
                    </div>
                  ))}
            </>
          )}
          {actualPage === "tickets" && (
            <>
              <div className="toolbar card">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Tìm ticket"
                    placeholder="Tìm ticket, vị trí, tên nhóm..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Lọc trạng thái ticket"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Tất cả trạng thái</option>
                  {[
                    "submitted",
                    "approved",
                    "inprogress",
                    "resolved",
                    "cancelled",
                  ].map((x) => (
                    <option key={x} value={x}>
                      {labels[x]}
                    </option>
                  ))}
                </select>
                {role === "pms" && (
                  <div className="ticket-bulk-actions">
                  <Button
                    icon={Layers}
                    disabled={busy || selected.length < 2}
                    onClick={() => setModal({
                      type: "group",
                      ticketIds: selected,
                      groupId: s.groups.find((g) => tickets.some((t) => selected.includes(t.id) && t.groupId === g.id))?.id || "",
                    })}
                  >
                    Gom nhóm ({selected.length})
                  </Button>
                  {selected.some((tid) => tickets.some((t) => t.id === tid && t.groupId)) && (
                    <Button
                      icon={LogOut}
                      disabled={busy}
                      onClick={() => moveOut(selected.filter((tid) => tickets.some((t) => t.id === tid && t.groupId)))}
                    >Đưa khỏi nhóm</Button>
                  )}
                  </div>
                )}
              </div>
              <section className="card">
                <div className="ticket-group-help">
                  <Layers size={16} />
                  <span>Nhóm → Ticket · Bấm tên nhóm để thu gọn hoặc mở rộng.</span>
                  {selected.length > 0 && <strong>Đã chọn {selected.length} ticket</strong>}
                </div>
                {ticketTable(
                  tickets.filter(
                    (t) =>
                      (filter === "all" || t.status === filter) &&
                      [t.title, t.id, t.location, t.type, s.groups.find((g) => g.id === t.groupId)?.name]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  ),
                )}
              </section>
              <p className="footnote">
                {tickets.length} ticket · Ticket đưa khỏi nhóm sẽ trở về “Chưa gom nhóm”.
                Mỗi ticket giữ nguyên quy trình và lịch sử riêng.
              </p>
            </>
          )}
          {actualPage === "orders" && (
            <>
              <div className="toolbar card">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Tìm work order"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm công việc hoặc mã work order..."
                  />
                </div>
                <select
                  aria-label="Lọc trạng thái work order"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Tất cả trạng thái</option>
                  {["todo", "in-progress", "pause", "completed", "closed"].map(
                    (x) => (
                      <option key={x} value={x}>
                        {labels[x]}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="order-grid">
                {orders
                  .filter(
                    (w) =>
                      (filter === "all" || w.status === filter) &&
                      [w.id, w.title]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map(orderCard)}
              </div>
              {!orders.filter(
                (w) =>
                  (filter === "all" || w.status === filter) &&
                  [w.id, w.title]
                    .join(" ")
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              ).length && (
                <section className="card">
                  <Empty
                    title="Không có công việc phù hợp"
                    text="Công việc tự động được tạo khi yêu cầu được duyệt hoặc bước trước hoàn tất."
                  />
                </section>
              )}
            </>
          )}
          {actualPage === "templates" && (
            <div className="template-grid">
              {s.templates.map((t) => (
                <article className="card template-card" key={t.id}>
                  <span className="template-icon">
                    <FileText size={23} />
                  </span>
                  <h2>{t.name}</h2>
                  <p>
                    {t.checklist.length} bước checklist · Giao cho kỹ thuật viên
                    HVAC
                  </p>
                  <ul>
                    {t.checklist.map((c) => (
                      <li key={c}>
                        <Check size={14} />
                        {c}
                      </li>
                    ))}
                  </ul>
                  <div className="template-slas">
                    <span>
                      <Clock3 size={14} /> Phản hồi: {t.responseTimeSLA} phút
                    </span>
                    <span>
                      <CircleCheck size={14} /> Xử lý: {t.processTimeSLA} phút
                    </span>
                  </div>
                  <Button
                    icon={Plus}
                    onClick={() =>
                      setModal({ type: "order", templateId: t.id })
                    }
                  >
                    Tạo work order từ mẫu
                  </Button>
                </article>
              ))}
            </div>
          )}
          {actualPage === "workflows" && ready && (
            <WorkflowBuilder
              s={s}
              busy={busy}
              save={async (w) =>
                act(
                  "SAVE_WORKFLOW",
                  w,
                  w.published
                    ? "Quy trình đã được xuất bản"
                    : "Đã lưu bản nháp",
                )
              }
            />
          )}
          {actualPage === "runs" && (
            <>
              <div className="runs-list">
                {s.runs.length ? (
                  s.runs.map((r) => (
                    <article className="card run-card" key={r.id}>
                      <div className="section-heading">
                        <div>
                          <span className="overline">
                            {short(r.id)} · Quy trình v{r.workflow.version}
                          </span>
                          <h2>{r.workflow.name}</h2>
                          <button
                            className="text-button"
                            onClick={() => setDetail(r.ticketId)}
                          >
                            {s.tickets.find((t) => t.id === r.ticketId)?.title}
                          </button>
                        </div>
                        <Badge value={r.status} />
                      </div>
                      {r.nodeStates ? (
                        <GraphRunDetails
                          run={r}
                          busy={busy}
                          retry={() =>
                            act(
                              "RETRY_RUN",
                              { runId: r.id },
                              "Đã thử lại bước xử lý",
                            )
                          }
                        />
                      ) : (
                        <>
                          <div className="run-steps">
                            {r.workflow.nodes.map((n, i) => (
                              <div
                                key={n.id}
                                className={`run-step ${i < r.cursor ? "done" : i === r.cursor ? "current" : ""}`}
                              >
                                <span>
                                  {i < r.cursor ? <Check size={14} /> : i + 1}
                                </span>
                                <div>
                                  <strong>{n.title}</strong>
                                  <small>
                                    {i < r.cursor
                                      ? `Hoàn tất · ${time(r.trace.findLast((t) => t.nodeId === n.id && t.status === "completed")?.at)}`
                                      : i === r.cursor
                                        ? labels[r.status]
                                        : "Chưa chạy"}
                                  </small>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {r.reason && (
                        <p className="error-text">Lý do từ chối: {r.reason}</p>
                      )}
                      <p className="footnote">
                        Khởi tạo {time(r.createdAt)} ·{" "}
                        {r.waitingWorkOrderId
                          ? `Đang đợi ${short(r.waitingWorkOrderId)}`
                          : r.status === "completed"
                            ? "Các bước đã hoàn tất"
                            : r.status === "waiting-approval"
                              ? "PMS cần duyệt yêu cầu"
                              : ["cancelled", "rejected"].includes(r.status)
                                ? "Quy trình đã dừng"
                                : "Đang xử lý theo các bước"}
                      </p>
                    </article>
                  ))
                ) : (
                  <section className="card">
                    <Empty
                      title="Chưa có lần chạy"
                      text="Tenant tạo ticket sự cố thiết bị để bắt đầu quy trình xử lý."
                    />
                  </section>
                )}
              </div>
              <section className="card audit-card">
                <div className="section-heading">
                  <h2>Nhật ký sự kiện</h2>
                  <span>{s.audit.length} sự kiện</span>
                </div>
                {s.audit.slice(0, 50).map((a) => (
                  <div className="audit-row" key={a.id}>
                    <Activity size={15} />
                    <strong>{auditLabel(a.event)}</strong>
                    <span>{actorName(a.actor)}</span>
                    <small>{time(a.at)}</small>
                  </div>
                ))}
              </section>
            </>
          )}
          {actualPage === "notifications" && (
            <>
              <div className="notification-settings card">
                <span className="metric-icon tone-1">
                  <Bell size={21} />
                </span>
                <div>
                  <h2>Thông báo ngay trên trình duyệt</h2>
                  <p>
                    {permission === "granted"
                      ? "Đã bật · bạn sẽ nhận thông báo trình duyệt theo cấu hình quy trình."
                      : "Bật thông báo hệ thống để thấy cập nhật ngoài cửa sổ app."}
                  </p>
                </div>
                <Button
                  icon={Bell}
                  onClick={async () => {
                    try {
                      setPermission(await enableNotifications());
                      setToast("Đã bật thông báo trình duyệt");
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Bật thông báo
                </Button>
                <Button
                  disabled={busy || !unread}
                  onClick={() => act("READ_NOTIFICATION", {}, "Đã đọc tất cả")}
                >
                  Đọc tất cả
                </Button>
              </div>
              <section className="card notifications-list">
                {notice.length ? (
                  notice.map((n) => (
                    <div
                      key={n.id}
                      className={`notification-row ${!n.read ? "unread" : ""}`}
                    >
                      <span className={`notification-icon ${n.kind}`}>
                        {n.kind === "approval" ? (
                          <ShieldCheck size={21} />
                        ) : (
                          <Bell size={20} />
                        )}
                      </span>
                      <div className="notification-content">
                        <button onClick={() => openNotice(n)}>{n.title}</button>
                        {n.body && n.body !== n.title && (
                          <div className="notification-body-text">{n.body}</div>
                        )}
                        <p>
                          {time(n.createdAt)} ·{" "}
                          {n.kind === "approval"
                            ? "Yêu cầu phê duyệt"
                            : {
                                info: "Thông tin",
                                reminder: "Nhắc nhở",
                                alert: "Cần chú ý",
                              }[n.kind] || "Cập nhật quy trình"}
                        </p>
                        {role === "pms" &&
                          n.kind === "approval" &&
                          s.tickets.find((t) => t.id === n.ticketId) &&
                          approval(
                            s.tickets.find((t) => t.id === n.ticketId),
                            n.nodeId,
                          )}
                      </div>
                      {!n.read && <span className="unread-dot" />}
                    </div>
                  ))
                ) : (
                  <Empty
                    title="Hộp thư đang trống"
                    text="Bạn sẽ nhận cập nhật của các yêu cầu và công việc liên quan."
                  />
                )}
              </section>
            </>
          )}
          {actualPage === "guide" && (
            <section className="card guide">
              <h2>Thử kịch bản bảo trì điều hoà</h2>
              <ol>
                <li>
                  Mở Tenant, PMS và Maintainer ở ba tab cùng địa chỉ origin bằng
                  các liên kết dưới đây.
                </li>
                <li>
                  Tenant tạo ticket có type{" "}
                  <strong>Equipment malfunction</strong>.
                </li>
                <li>
                  PMS vào Thông báo và phê duyệt. Work order{" "}
                  <strong>Kiểm tra điều hoà</strong> được tạo.
                </li>
                <li>
                  Maintainer bắt đầu, tick đủ checklist, rồi hoàn thành work
                  order kiểm tra.
                </li>
                <li>
                  Work order <strong>Sửa chữa máy lạnh</strong> xuất hiện. Bắt
                  đầu và hoàn tất checklist, rồi hoàn thành.
                </li>
                <li>
                  PMS nhận thông báo, ticket chuyển sang{" "}
                  <strong>resolved / Hoàn tất</strong>.
                </li>
              </ol>
              <div className="actions">
                {Object.keys(USERS).map((r) => (
                  <a
                    className="btn"
                    href={`/?app=${r}`}
                    target="_blank"
                    rel="noreferrer"
                    key={r}
                  >
                    Mở {roleNames[r]} <ExternalLink size={14} />
                  </a>
                ))}
              </div>
              <h2>Trigger và realtime</h2>
              <p>
                Command tạo ticket ghi dữ liệu vào IndexedDB và chạy workflow đã
                xuất bản phù hợp với type. BroadcastChannel thông báo các tab
                đọc lại state; storage event làm phương án dự phòng. Transaction
                IndexedDB tuần tự hoá thao tác từ các tab.
              </p>
              <h2>Phạm vi của prototype</h2>
              <p>
                Không backend; dữ liệu chỉ nằm trong hồ sơ trình duyệt này. Các
                tab phải cùng scheme, host và port. Không đồng bộ giữa máy,
                trình duyệt hoặc domain khác nhau. App cần tab đang mở để nhận
                sự kiện; Service Worker hiển thị thông báo hệ thống sau khi cấp
                quyền, không có remote Push. Chạy bằng localhost hoặc HTTPS.
              </p>
              <p>
                Ba vai trò là mô phỏng để kiểm tra nghiệp vụ, chưa có cơ chế
                đăng nhập hay phân quyền bảo mật. Ticket resolved chỉ sau khi
                mọi work order liên quan hoàn tất. Hủy ticket dừng run và đóng
                work order chỉ còn liên kết với ticket đã hủy. Dữ liệu vẫn tồn
                tại khi tải lại; xóa site data sẽ xóa prototype.
              </p>
              <h2>Thiết lập quy trình xử lý</h2>
              <p>
                Chọn loại ticket, bật hoặc tắt PMS phê duyệt, rồi thêm công
                việc, thông báo và nhóm làm song song. Mỗi công việc có người
                nhận, checklist và thời hạn. Mặc định chờ hoàn thành trước khi
                đi tiếp; bạn có thể tắt chờ để tiếp tục ngay sau khi giao việc.
                Nhóm song song chờ tất cả nhánh và công việc trong nhóm trước
                khi đi tiếp.
              </p>
              <p>
                Bước điều kiện đọc trạng thái hiện tại của ticket hoặc công việc
                đã tạo ở bước trước. Chọn kiểm tra ngay để đi nhánh Đúng/Không
                đúng, hoặc chờ đến khi đạt trạng thái rồi thực hiện. Chỉ nhánh
                được chọn mới tạo việc và gửi thông báo. Ticket hoàn tất khi tất
                cả công việc liên quan đã xong; hủy ticket sẽ dừng quy trình.
              </p>
              <p>
                Chạy thử để kiểm tra các bước trước khi áp dụng. Lưu bản nháp
                giữ nguyên bản đang chạy. Xuất bản áp dụng cho ticket mới;
                ticket đang xử lý tiếp tục dùng quy trình của lần tạo. Mỗi loại
                ticket chỉ dùng một quy trình đã xuất bản.
              </p>
            </section>
          )}
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CircleCheck size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          kind={modal}
          role={role}
          s={s}
          busy={busy}
          error={error}
          close={() => {
            setModal(null);
            setError("");
          }}
          submit={async (type, payload) => {
            const ok = await act(type, payload);
            if (ok) {
              setModal(null);
              setSelected([]);
              if (type === "GROUP_TICKETS" && payload.groupId)
                setCollapsedGroups((current) => current.filter((gid) => gid !== payload.groupId));
            }
            return ok;
          }}
        />
      )}{" "}
      {ticket && (
        <div className="drawer-backdrop" onClick={() => setDetail(null)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Chi tiết ticket"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row-between">
              <span className="overline">
                CHI TIẾT YÊU CẦU · {short(ticket.id)}
              </span>
              <button
                className="icon-btn"
                aria-label="Đóng chi tiết"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <h2>{ticket.title}</h2>
            <div className="actions">
              <Badge value={ticket.status} />
              <Badge value={ticket.priority} />
            </div>
            {approval(ticket)}
            <div className="detail-grid">
              {[
                ["Loại", ticket.type],
                ["Khách hàng", actorName(ticket.customer)],
                ["Vị trí", ticket.location],
                ["Khu vực", ticket.area],
                [
                  "Nhóm",
                  s.groups.find((g) => g.id === ticket.groupId)?.name || "—",
                ],
                [
                  "Người phụ trách",
                  ticket.assignees.map(actorName).join(", ") || "Chưa giao",
                ],
                ["Tạo bởi", actorName(ticket.createdBy)],
                ["Cập nhật bởi", actorName(ticket.updatedBy)],
                ["Duyệt bởi", actorName(ticket.approvedBy)],
                ["Hoàn tất bởi", actorName(ticket.resolvedBy)],
                ["Hủy bởi", actorName(ticket.cancelledBy)],
                ["Ngày tạo", time(ticket.createdAt)],
                ["Phản hồi lúc", time(ticket.responsedTime)],
                ["Xử lý xong lúc", time(ticket.processedTime)],
              ].map(([label, value]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <SLA item={ticket} />
            <h3>Mô tả & bằng chứng</h3>
            <p className="detail-note">{ticket.note || "Không có ghi chú."}</p>
            <div className="evidences">
              {ticket.evidences.map((e, i) => (
                <a key={i} href={e.data} download={e.name}>
                  <img src={e.data} alt={e.name} />
                  <small>{e.name}</small>
                </a>
              ))}
            </div>
            <h3>Work orders liên quan</h3>
            {s.links
              .filter((l) => l.ticketId === ticket.id)
              .map((l) => {
                const wo = s.workOrders.find((w) => w.id === l.workOrderId);
                return (
                  <div key={wo.id} className="related-order">
                    <Wrench size={17} />
                    <strong>{wo.title}</strong>
                    <Badge value={wo.status} />
                  </div>
                );
              })}
            {!s.links.some((l) => l.ticketId === ticket.id) && (
              <p className="muted">Chưa có work order.</p>
            )}
            <h3>Lịch sử</h3>
            <div className="detail-history">
              {s.audit
                .filter((a) => a.entityId === ticket.id)
                .map((a) => (
                  <div key={a.id}>
                    <span className="live-dot" />
                    <div>
                      <strong>{auditLabel(a.event)}</strong>
                      <small>
                        {actorName(a.actor)} · {time(a.at)}
                      </small>
                    </div>
                  </div>
                ))}
            </div>
            <div className="drawer-actions">
              {role === "pms" && ticket.groupId && (
                <Button icon={LogOut} disabled={busy} onClick={() => moveOut([ticket.id])}>
                  Đưa khỏi nhóm
                </Button>
              )}
              {!["resolved", "cancelled"].includes(ticket.status) && (
                <Button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    setModal({ type: "cancel", ticketId: ticket.id })
                  }
                >
                  Hủy yêu cầu
                </Button>
              )}
              {role === "pms" &&
                !["resolved", "cancelled"].includes(ticket.status) &&
                !s.runs.some(
                  (r) =>
                    r.ticketId === ticket.id &&
                    !["completed", "rejected", "cancelled"].includes(r.status),
                ) && (
                  <Button
                    primary
                    disabled={busy}
                    onClick={() =>
                      act("RESOLVE_MANUAL", { ticketId: ticket.id })
                    }
                  >
                    Hoàn tất thủ công
                  </Button>
                )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
function Modal({ kind, role, s, busy, close, submit, error }) {
  const isTenantTicket = kind.type === "ticket" && role === "tenant";
  const [form, setForm] = useState({
    title: "",
    type: TYPES[0],
    priority: "medium",
    location: "VP-03 · Saigon Centre",
    area: "Office building",
    note: "",
    name: "",
    groupId: kind.groupId || "",
    reason: "",
    templateId: kind.templateId || "",
    ticketIds: [],
    checklist: "",
    responseTimeSLA: 60,
    processTimeSLA: 240,
    evidences: [],
  });
  const [uploading, setUploading] = useState(false),
    [fileError, setFileError] = useState("");
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const names = {
    ticket: "Tạo yêu cầu bảo trì",
    order: "Tạo work order",
    template: "Tạo work order template",
    group: "Gom nhóm tickets",
    reject: "Từ chối yêu cầu",
    cancel: "Hủy yêu cầu",
  };
  const template = s.templates.find((t) => t.id === form.templateId);
  async function files(event) {
    const fs = [...event.target.files];
    setUploading(true);
    setFileError("");
    try {
      if (
        fs.length > 3 ||
        fs.reduce((n, f) => n + f.size, 0) > 2 * 1024 * 1024 ||
        fs.some(
          (f) => !["image/png", "image/jpeg", "image/webp"].includes(f.type),
        )
      )
        throw Error(
          "Chọn tối đa 3 ảnh PNG/JPG/WebP, tổng dung lượng tối đa 2 MB.",
        );
      const data = await Promise.all(
        fs.map(
          (f) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  name: f.name,
                  data: reader.result,
                  mimeType: f.type,
                });
              reader.onerror = reject;
              reader.readAsDataURL(f);
            }),
        ),
      );
      patch("evidences", data);
    } catch (e) {
      setFileError(e.message || "Không đọc được ảnh.");
      patch("evidences", []);
      event.target.value = "";
    } finally {
      setUploading(false);
    }
  }
  async function onSubmit(e) {
    e.preventDefault();
    if (busy || uploading) return;
    const commands = {
      ticket: ["CREATE_TICKET", form],
      order: [
        "CREATE_WO",
        {
          title: form.title || template?.name,
          templateId: form.templateId,
          priority: form.priority,
          note: form.note,
          ticketIds: form.ticketIds,
        },
      ],
      template: [
        "SAVE_TEMPLATE",
        {
          name: form.name,
          checklist: form.checklist
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          responseTimeSLA: Number(form.responseTimeSLA),
          processTimeSLA: Number(form.processTimeSLA),
        },
      ],
      group: ["GROUP_TICKETS", { name: form.name, groupId: form.groupId, ticketIds: kind.ticketIds }],
      reject: [
        "REJECT",
        { runId: kind.runId, nodeId: kind.nodeId, reason: form.reason },
      ],
      cancel: ["CANCEL_TICKET", { ticketId: kind.ticketId }],
    };
    await submit(...commands[kind.type]);
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="section-heading">
          <div>
            <span className="overline">{isTenantTicket ? "HỖ TRỢ NGƯỜI THUÊ" : "MAINTENANCE WORKSPACE"}</span>
            <h2 id="modal-title">{names[kind.type]}</h2>
          </div>
          <button className="icon-btn" aria-label="Đóng" onClick={close}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          {kind.type === "ticket" && (
            <>
              {isTenantTicket && (
                <p className="footnote">
                  Hãy cho biết vấn đề bạn đang gặp và vị trí cần hỗ trợ.
                  Ban quản lý sẽ tiếp nhận và cập nhật tiến độ cho bạn.
                </p>
              )}
              <Field label="Tên yêu cầu">
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(e) => patch("title", e.target.value)}
                  placeholder={isTenantTicket ? "Ví dụ: Máy lạnh không mát, vòi nước bị rò rỉ..." : "Ví dụ: Máy lạnh phòng họp không mát"}
                />
              </Field>
              <div className={isTenantTicket ? undefined : "form-row"}>
                <Field label="Loại yêu cầu">
                  <select
                    value={form.type}
                    onChange={(e) => patch("type", e.target.value)}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t] || t}
                      </option>
                    ))}
                  </select>
                </Field>
                {!isTenantTicket && <Field label="Ưu tiên">
                  <select
                    value={form.priority}
                    onChange={(e) => patch("priority", e.target.value)}
                  >
                    {["low", "medium", "high", "urgent"].map((x) => (
                      <option key={x} value={x}>
                        {labels[x]}
                      </option>
                    ))}
                  </select>
                </Field>}
              </div>
              <div className="form-row">
                <Field label="Vị trí">
                  <input
                    required
                    value={form.location}
                    onChange={(e) => patch("location", e.target.value)}
                  />
                </Field>
                <Field label="Khu vực">
                  <select
                    value={form.area}
                    onChange={(e) => patch("area", e.target.value)}
                  >
                    {["Office building", "Workspace", "Living"].map((x) => (
                      <option key={x} value={x}>
                        {isTenantTicket ? { "Office building": "Tòa nhà văn phòng", Workspace: "Không gian làm việc", Living: "Khu căn hộ" }[x] : x}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={isTenantTicket ? "Mô tả vấn đề" : "Mô tả / Ghi chú"}>
                <textarea
                  value={form.note}
                  onChange={(e) => patch("note", e.target.value)}
                  placeholder={isTenantTicket ? "Vấn đề xảy ra như thế nào, từ khi nào? Có thông tin nào giúp chúng tôi hỗ trợ bạn tốt hơn?" : "Mô tả sự cố để đội kỹ thuật hỗ trợ..."}
                />
              </Field>
              <Field label={isTenantTicket ? "Ảnh đính kèm (tối đa 3 ảnh, tổng 2 MB)" : "Bằng chứng (tối đa 3 ảnh, tổng 2 MB)"}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={files}
                />
              </Field>
              {fileError && (
                <p role="alert" className="error-text">
                  {fileError}
                </p>
              )}
              <div className="notice">
                {isTenantTicket ? <Info size={17} /> : <Zap size={17} />}
                {isTenantTicket ? "Sau khi gửi, bạn có thể theo dõi tiến độ trong Yêu cầu của tôi và nhận cập nhật ở Thông báo." : s.workflows.some(
                  (w) => w.published && w.triggerType === form.type,
                )
                  ? "Workflow phù hợp sẽ tự động kích hoạt sau khi gửi."
                  : "Chưa có workflow đã xuất bản cho loại này. PMS xử lý thủ công."}
              </div>
            </>
          )}
          {kind.type === "order" && (
            <>
              <Field label="Work order template">
                <select
                  value={form.templateId}
                  onChange={(e) => patch("templateId", e.target.value)}
                >
                  <option value="">Tự tạo (không dùng template)</option>
                  {s.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tên công việc">
                <input
                  required={!template}
                  value={form.title}
                  placeholder={template?.name || "Nhập tên công việc"}
                  onChange={(e) => patch("title", e.target.value)}
                />
              </Field>
              <Field label="Ưu tiên">
                <select
                  value={form.priority}
                  onChange={(e) => patch("priority", e.target.value)}
                >
                  {["low", "medium", "high", "urgent"].map((x) => (
                    <option key={x} value={x}>
                      {labels[x]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Người phụ trách">
                <select>
                  <option>Trần Hoàng Nam · HVAC</option>
                </select>
              </Field>
              <fieldset className="ticket-picker">
                <legend>Liên kết tickets (có thể chọn nhiều)</legend>
                {s.tickets
                  .filter((t) => !["cancelled", "resolved"].includes(t.status))
                  .map((t) => (
                    <label key={t.id}>
                      <input
                        type="checkbox"
                        checked={form.ticketIds.includes(t.id)}
                        onChange={(e) =>
                          patch(
                            "ticketIds",
                            e.target.checked
                              ? [...form.ticketIds, t.id]
                              : form.ticketIds.filter((x) => x !== t.id),
                          )
                        }
                      />
                      <span>
                        {t.title}
                        <small>{t.location}</small>
                      </span>
                    </label>
                  ))}
                {!s.tickets.some(
                  (t) => !["cancelled", "resolved"].includes(t.status),
                ) && <p>Tạo một ticket đang mở trước khi giao việc.</p>}
              </fieldset>
              <Field label="Ghi chú">
                <textarea
                  value={form.note}
                  onChange={(e) => patch("note", e.target.value)}
                />
              </Field>
              {template && (
                <div className="notice">
                  {template.checklist.length} bước checklist · SLA phản hồi{" "}
                  {template.responseTimeSLA} phút / xử lý{" "}
                  {template.processTimeSLA} phút
                </div>
              )}
            </>
          )}
          {kind.type === "template" && (
            <>
              <Field label="Tên template">
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => patch("name", e.target.value)}
                  placeholder="Ví dụ: Bảo dưỡng máy lạnh định kỳ"
                />
              </Field>
              <Field label="Checklist (mỗi dòng một bước)">
                <textarea
                  required
                  rows={5}
                  value={form.checklist}
                  onChange={(e) => patch("checklist", e.target.value)}
                  placeholder={"Kiểm tra bộ lọc\nVệ sinh dàn lạnh\nChạy thử"}
                />
              </Field>
              <div className="form-row">
                <Field label="SLA phản hồi (phút)">
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.responseTimeSLA}
                    onChange={(e) => patch("responseTimeSLA", e.target.value)}
                  />
                </Field>
                <Field label="SLA xử lý (phút)">
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.processTimeSLA}
                    onChange={(e) => patch("processTimeSLA", e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
          {kind.type === "group" && (
            <>
              <div className="notice">
                Đã chọn {kind.ticketIds.length} ticket. Tất cả ticket được đưa vào
                một nhóm, chỉ có 2 cấp: Nhóm → Ticket.
                Mỗi ticket giữ nguyên quy trình và lịch sử riêng.
              </div>
              {s.groups.some((g) => s.tickets.some((t) => t.groupId === g.id)) && (
                <Field label="Gom vào nhóm">
                  <select value={form.groupId} onChange={(e) => patch("groupId", e.target.value)}>
                    <option value="">Tạo nhóm mới</option>
                    {s.groups.filter((g) => s.tickets.some((t) => t.groupId === g.id)).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              {form.groupId ? (
                <p className="footnote">
                  Ticket được thêm trực tiếp vào “{s.groups.find((g) => g.id === form.groupId)?.name}”.
                  Nhóm này giữ nguyên tên và các ticket hiện có.
                </p>
              ) : (
              <Field label="Tên nhóm">
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => patch("name", e.target.value)}
                  placeholder="Ví dụ: Sự cố HVAC · Tầng 3"
                />
              </Field>
              )}
            </>
          )}
          {kind.type === "reject" && (
            <Field label="Lý do từ chối">
              <textarea
                autoFocus
                required
                value={form.reason}
                onChange={(e) => patch("reason", e.target.value)}
                placeholder="Nhập lý do để lưu trong lịch sử và output Approval."
              />
            </Field>
          )}
          {kind.type === "cancel" && (
            <p>
              Hủy sẽ dừng workflow của yêu cầu. Công việc dùng riêng cho ticket
              này được đóng; công việc liên kết ticket khác vẫn tiếp tục.
            </p>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <Button type="button" onClick={close}>
              Đóng
            </Button>
            <Button
              primary
              type="submit"
              disabled={busy || uploading}
              icon={kind.type === "ticket" ? Send : Check}
            >
              {busy || uploading
                ? "Đang xử lý..."
                : kind.type === "ticket"
                  ? "Gửi yêu cầu"
                  : kind.type === "cancel"
                    ? "Xác nhận hủy"
                    : kind.type === "reject"
                      ? "Từ chối yêu cầu"
                      : "Lưu"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
