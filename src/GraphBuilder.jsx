import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./graph-builder.css";
import {
  Zap,
  Wrench,
  ShieldCheck,
  Bell,
  GitBranch,
  GitFork,
  Cog,
  Plus,
  X,
  Trash2,
  Save,
  Send,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  Play,
  ChevronRight,
  Braces,
  Info,
  ArrowRight,
  Cable,
  Search,
  Check,
  Copy,
  Download,
  Upload,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import {
  TYPES,
  USERS,
  id,
  defaultWorkflow,
  validateWorkflow,
  initialState,
  reduceCommand,
} from "./engine.js";
import {
  TRIGGER_ID,
  toGraph,
  literal,
  reference,
  ports,
  hasPath,
  ancestors,
  OUTPUTS,
  outputFields,
  NODE_LABELS,
} from "./graph.js";
import {
  NotificationConfig,
  AutomationConfig,
  GeneralConfig,
  FormField,
  SignalTester,
} from "./WorkflowBusinessConfig.jsx";
import {
  STEP_NAMES,
  OPERATIONS,
  OPERATORS,
  VALUES,
  fieldLabel,
  stepSummary,
} from "./workflow-presentation.js";
const definitions = {
  trigger: {
    Icon: Zap,
    color: "green",
    title: "Bắt đầu",
    description: "Ticket mới theo loại yêu cầu",
  },
  workorder: {
    Icon: Wrench,
    color: "blue",
    title: "Công việc",
    description: "Tạo công việc từ template / tự tạo",
  },
  approval: {
    Icon: ShieldCheck,
    color: "amber",
    title: "Phê duyệt",
    description: "Đi tiếp theo quyết định duyệt",
  },
  automation: {
    Icon: Cog,
    color: "slate",
    title: "Tự động hóa",
    description: "Sự kiện, dữ liệu và biến",
  },
  condition: {
    Icon: GitBranch,
    color: "violet",
    title: "Điều kiện",
    description: "Nếu đúng đi nhánh này, sai đi nhánh khác",
  },
  parallel: {
    Icon: GitFork,
    color: "teal",
    title: "Nhánh song song",
    description: "Tách nhánh hoặc hợp các nhánh",
  },
  notify: {
    Icon: Bell,
    color: "peach",
    title: "Thông báo",
    description: "Chọn người nhận, kênh và nội dung",
  },
};
const actionNames = OPERATIONS;
const portName = (port) =>
  ({
    success: "Tiếp tục",
    approved: "Được duyệt",
    rejected: "Từ chối",
    true: "Đúng",
    false: "Sai",
  })[port] ||
  (port.startsWith("branch-") ? `Nhánh ${port.split("-").at(-1)}` : port);
function Button({ children, icon: Icon, primary, ...props }) {
  return (
    <button className={`btn ${primary ? "primary" : ""}`} {...props}>
      {Icon && <Icon size={14} />} {children}
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
function WorkflowNode({ data, selected }) {
  const { node, status } = data,
    def = definitions[node.type];
  return (
    <div
      className={`graph-node ${selected ? "selected" : ""} ${node.type === "trigger" ? "trigger-node" : ""} ${status || ""}`}
      data-domain-id={node.id}
    >
      {node.type !== "trigger" && (
        <Handle
          id="input"
          type="target"
          position={Position.Left}
          aria-label={`Input ${node.title}`}
        />
      )}
      <div className="graph-node-body">
        <span className={`node-icon ${def.color}`}>
          <def.Icon size={19} />
        </span>
        <div>
          <span className="graph-node-kind">{def.title}</span>
          <strong>{node.title}</strong>
        </div>
      </div>
      <div className="graph-node-subtitle">
        {node.type === "trigger"
          ? data.triggerType
          : node.type === "automation"
            ? actionNames[node.action]
            : node.type === "parallel"
              ? node.mode === "join"
                ? "Chờ các nhánh gặp nhau"
                : `${ports(node).length} nhánh song song`
              : node.type === "notify"
                ? node.channels?.length
                  ? node.channels
                      .map((c) =>
                        c === "in-app" ? "Trong ứng dụng" : "Trình duyệt",
                      )
                      .join(" + ")
                  : "Chưa chọn kênh gửi"
                : node.type === "condition"
                  ? `So sánh: ${OPERATORS[node.operator || "equals"]}`
                  : node.type === "workorder"
                    ? node.templateId
                      ? "Từ mẫu công việc"
                      : "Công việc tự tạo"
                    : "Chờ quyết định duyệt"}
      </div>
      <div className="graph-node-footer">
        <span>
          {status
            ? {
                completed: "✓ Hoàn tất",
                waiting: "◷ Đang chờ",
                skipped: "Bỏ qua",
                pending: "Chưa bắt đầu",
                error: "Có lỗi",
              }[status]
            : "Chọn để cấu hình"}
        </span>
        <div className="graph-node-ports">
          {ports(node).map((p) => (
            <div className={`graph-port ${p}`} key={p}>
              <span>{portName(p)}</span>
              <Handle
                id={p}
                type="source"
                position={Position.Right}
                aria-label={`${portName(p)} ${node.title}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const flowNodeTypes = { workflow: WorkflowNode };
function newNode(type, templates, position) {
  const node = {
    id: id(type),
    type,
    title: definitions[type].title,
    position,
    inputs: {},
  };
  if (type === "workorder")
    Object.assign(node, {
      templateId: templates[0]?.id || "",
      assignee: USERS.maintainer.id,
      inputs: {
        title: literal(templates[0]?.name || "Công việc mới"),
        ticketId: reference("trigger", "id"),
        priority: reference("trigger", "priority"),
        note: literal(""),
      },
    });
  if (type === "notify")
    Object.assign(node, {
      channels: ["in-app"],
      notificationKind: "info",
      inputs: {
        recipients: reference("trigger", "customer"),
        subject: literal("Có cập nhật mới"),
        message: literal("Có thông tin mới cần bạn xem."),
        contextResource: literal(""),
        contextId: literal(""),
      },
    });
  if (type === "condition")
    Object.assign(node, {
      operator: "equals",
      inputs: {
        left: reference("trigger", "priority"),
        right: literal("high"),
      },
    });
  if (type === "parallel")
    Object.assign(node, { mode: "split", branches: ["branch-1", "branch-2"] });
  if (type === "automation")
    Object.assign(node, {
      action: "log",
      inputs: { value: literal("Workflow đã chạy tới bước này") },
    });
  return node;
}
function keyOf(binding) {
  return !binding || binding.kind === "literal"
    ? "literal"
    : JSON.stringify([binding.scope, binding.nodeId || "", binding.path]);
}
function InputBinding({ field, binding, workflow, node, change, actual }) {
  const current = binding || literal(""),
    upstream = ancestors(workflow, node.id);
  const [literalType, setLiteralType] = useState(
    typeof current.value === "number"
      ? "number"
      : typeof current.value === "boolean"
        ? "boolean"
        : current.value && typeof current.value === "object"
          ? "object"
          : "string",
  );
  const value = current.value;
  function select(source) {
    if (source === "literal") change(literal(""));
    else {
      const [scope, nodeId, path] = JSON.parse(source);
      change(reference(scope, path, nodeId || undefined));
    }
  }
  return (
    <div className="input-binding">
      <div className="binding-heading">
        <strong>{field.label}</strong>
        <span>INPUT · {field.key}</span>
      </div>
      <select
        aria-label={`Nguồn input ${field.key}`}
        value={keyOf(current)}
        onChange={(e) => select(e.target.value)}
      >
        <option value="literal">Nhập giá trị (Literal)</option>
        <optgroup label="Trigger output">
          {OUTPUTS.trigger.map((path) => (
            <option key={path} value={JSON.stringify(["trigger", "", path])}>
              Trigger → {path}
            </option>
          ))}
        </optgroup>
        {workflow.variables?.length > 0 && (
          <optgroup label="Variables">
            {workflow.variables.map((v) => (
              <option
                key={v.name}
                value={JSON.stringify(["variable", "", v.name])}
              >
                Variables → {v.name}
              </option>
            ))}
          </optgroup>
        )}
        {workflow.nodes
          .filter((n) => upstream.has(n.id))
          .map((n) => (
            <optgroup key={n.id} label={`${n.title} · ${NODE_LABELS[n.type]}`}>
              {outputFields(n).map((path) => (
                <option key={path} value={JSON.stringify(["node", n.id, path])}>
                  {n.title} → {path}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
      {current.kind === "literal" ? (
        <div className="literal-editor">
          <select
            aria-label={`Kiểu literal ${field.key}`}
            value={literalType}
            onChange={(e) => {
              setLiteralType(e.target.value);
              change(
                literal(
                  { string: "", number: 0, boolean: true, object: {} }[
                    e.target.value
                  ],
                ),
              );
            }}
          >
            <option value="string">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="object">JSON</option>
          </select>
          {literalType === "boolean" ? (
            <select
              aria-label={`Giá trị input ${field.key}`}
              value={String(value)}
              onChange={(e) => change(literal(e.target.value === "true"))}
            >
              <option>true</option>
              <option>false</option>
            </select>
          ) : (
            <input
              aria-label={`Giá trị input ${field.key}`}
              type={literalType === "number" ? "number" : "text"}
              value={
                literalType === "object" && typeof value === "object"
                  ? JSON.stringify(value)
                  : (value ?? "")
              }
              onChange={(e) => {
                let val = e.target.value;
                if (literalType === "number")
                  val = val === "" ? null : Number(val);
                if (literalType === "object") {
                  try {
                    val = JSON.parse(val);
                  } catch {
                    /* Invalid JSON remains a string and publish/run validation reports it. */
                  }
                }
                change(literal(val));
              }}
            />
          )}
        </div>
      ) : (
        <code className="binding-expression">{`{{ ${current.scope === "node" ? "nodes." + current.nodeId : current.scope === "trigger" ? "trigger" : "variables"}.${current.path} }}`}</code>
      )}
      {actual !== undefined && (
        <small className="binding-actual">
          Chạy thử: {JSON.stringify(actual)}
        </small>
      )}
    </div>
  );
}
function nodeFields(node) {
  if (node.type === "workorder")
    return [
      { key: "title", label: "Tên công việc" },
      { key: "ticketId", label: "Ticket liên kết" },
      { key: "priority", label: "Ưu tiên" },
      { key: "note", label: "Ghi chú" },
    ];
  if (node.type === "notify") return [];
  if (node.type === "condition")
    return [
      { key: "left", label: "Giá trị so sánh" },
      { key: "right", label: "So sánh với" },
    ];
  if (node.action === "wait-event")
    return [
      { key: "eventName", label: "Tên sự kiện" },
      ...(node.filters || []).map((f) => ({
        key: `filter_${f.id}`,
        label: `Giá trị lọc · ${f.path || "payload path"}`,
      })),
    ];
  if (node.action === "emit-event")
    return [
      { key: "eventName", label: "Tên sự kiện" },
      { key: "payload", label: "Payload" },
    ];
  if (["read-record", "update-record"].includes(node.action))
    return [
      { key: "resource", label: "Resource" },
      { key: "recordId", label: "Record ID" },
      ...(node.action === "update-record"
        ? [
            { key: "field", label: "Trường cần cập nhật" },
            { key: "value", label: "Giá trị" },
          ]
        : []),
    ];
  if (["set-variable", "log"].includes(node.action))
    return [{ key: "value", label: "Giá trị" }];
  return [];
}
export default function WorkflowBuilder(props) {
  return (
    <ReactFlowProvider>
      <GraphStudio {...props} />
    </ReactFlowProvider>
  );
}
function GraphStudio({ s, busy, save }) {
  const [advanced, setAdvanced] = useState(false);
  const [eventName, setEventName] = useState("example.received");
  const [eventPayload, setEventPayload] = useState("{}");
  const [draft, setDraft] = useState(() =>
      toGraph(s.workflows[0] || defaultWorkflow()),
    ),
    [selection, setSelection] = useState({ kind: "node", id: TRIGGER_ID }),
    [panel, setPanel] = useState("node"),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [full, setFull] = useState(false),
    [showPanel, setShowPanel] = useState(true),
    [past, setPast] = useState([]),
    [future, setFuture] = useState([]),
    [preview, setPreview] = useState(null),
    [testOpen, setTestOpen] = useState(false),
    [testPayload, setTestPayload] = useState(
      JSON.stringify(
        {
          title: "Máy lạnh phòng họp không mát",
          priority: "high",
          location: "VP-03 · Saigon Centre",
          area: "Office building",
          note: "Nhiệt độ phòng cao hơn bình thường",
        },
        null,
        2,
      ),
    );
  const { screenToFlowPosition, fitView } = useReactFlow();
  const canvasRef = useRef(null),
    dragOrigin = useRef(null),
    fileRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  function commit(next, before = draftRef.current) {
    setPast((p) => [...p.slice(-39), structuredClone(before)]);
    setFuture([]);
    setDraft({ ...next, published: false });
    setError("");
    setPreview(null);
  }
  function patch(change) {
    commit({ ...draft, ...change });
  }
  function patchNode(changes) {
    patch({
      nodes: draft.nodes.map((n) =>
        n.id === selection.id ? { ...n, ...changes } : n,
      ),
    });
  }
  function undo() {
    if (!past.length) return;
    setFuture((f) => [structuredClone(draft), ...f]);
    setDraft({ ...past.at(-1), published: false });
    setPast((p) => p.slice(0, -1));
    setPreview(null);
  }
  function redo() {
    if (!future.length) return;
    setPast((p) => [...p, structuredClone(draft)]);
    setDraft({ ...future[0], published: false });
    setFuture((f) => f.slice(1));
    setPreview(null);
  }
  function load(w) {
    setDraft(toGraph(w));
    setSelection({ kind: "node", id: TRIGGER_ID });
    setPanel("node");
    setError("");
    setPast([]);
    setFuture([]);
    setPreview(null);
    setTimeout(
      () => fitView({ padding: 0.18, duration: 300, maxZoom: 0.9 }),
      50,
    );
  }
  useEffect(() => {
    function key(e) {
      if (
        e.target.closest("input,textarea,select") ||
        e.target.isContentEditable
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [draft, past, future]);
  useEffect(() => {
    if (!testOpen) return;
    const timer = setTimeout(
      () => fitView({ padding: 0.18, duration: 200, maxZoom: 0.9 }),
      80,
    );
    return () => clearTimeout(timer);
  }, [testOpen, fitView]);
  const node = draft.nodes.find((n) => n.id === selection.id),
    edge = draft.transitions.find((e) => e.id === selection.id),
    run = preview?.runs[0];
  const flowNodes = useMemo(
    () => [
      {
        id: TRIGGER_ID,
        type: "workflow",
        position: draft.trigger.position,
        selected: selection.kind === "node" && selection.id === TRIGGER_ID,
        deletable: false,
        data: {
          node: { id: TRIGGER_ID, type: "trigger", title: "Ticket được tạo" },
          triggerType: draft.triggerType,
          status: run ? "completed" : null,
        },
      },
      ...draft.nodes.map((n) => ({
        id: n.id,
        type: "workflow",
        position: n.position,
        selected: selection.kind === "node" && selection.id === n.id,
        data: { node: n, status: run?.nodeStates?.[n.id]?.status },
      })),
    ],
    [draft, selection, run],
  );
  const flowEdges = useMemo(
    () =>
      draft.transitions.map((e) => ({
        ...e,
        targetHandle: "input",
        type: "smoothstep",
        label: e.label || portName(e.sourceHandle),
        selected: selection.kind === "edge" && selection.id === e.id,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: run?.edgeStates[e.id] === "skipped" ? "#c7d1ce" : "#79a995",
        },
        style: {
          stroke:
            run?.edgeStates[e.id] === "fired"
              ? "#238d66"
              : run?.edgeStates[e.id] === "skipped"
                ? "#c7d1ce"
                : "#8da99e",
          strokeWidth: 1.7,
          ...(run?.edgeStates[e.id] === "skipped"
            ? { strokeDasharray: "5 5" }
            : {}),
        },
        animated: run?.edgeStates[e.id] === "fired",
      })),
    [draft.transitions, selection, run],
  );
  function add(type, position) {
    const bounds = canvasRef.current.getBoundingClientRect();
    const at =
      position ||
      screenToFlowPosition({
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
    if (!position) {
      const occupied = [draft.trigger, ...draft.nodes];
      while (
        occupied.some(
          (n) =>
            Math.abs(n.position.x - at.x) < 260 &&
            Math.abs(n.position.y - at.y) < 170,
        )
      )
        at.x += 280;
    }
    const n = newNode(type, s.templates, at);
    patch({ nodes: [...draft.nodes, n] });
    setSelection({ kind: "node", id: n.id });
    setPanel("node");
    setShowPanel(true);
    if (!position)
      setTimeout(
        () => fitView({ padding: 0.18, duration: 200, maxZoom: 0.9 }),
        80,
      );
  }
  function addNext(type, sourceId, sourceHandle) {
    const source =
      sourceId === TRIGGER_ID
        ? draft.trigger
        : draft.nodes.find((n) => n.id === sourceId);
    if (
      !source ||
      draft.transitions.some(
        (e) => e.source === sourceId && e.sourceHandle === sourceHandle,
      )
    )
      return;
    const columns = Math.max(
      2,
      Math.floor(canvasRef.current.getBoundingClientRect().width / 260),
    );
    const position = {
      x: source.position.x + 310,
      y:
        source.position.y +
        (sourceHandle === "rejected" || sourceHandle === "false" ? 190 : 0),
    };
    if (position.x > draft.trigger.position.x + (columns - 1) * 310) {
      position.x = draft.trigger.position.x;
      position.y = source.position.y + 190;
    }
    while (
      [draft.trigger, ...draft.nodes].some(
        (n) =>
          Math.abs(n.position.x - position.x) < 260 &&
          Math.abs(n.position.y - position.y) < 160,
      )
    )
      position.y += 190;
    const n = newNode(type, s.templates, position);
    patch({
      nodes: [...draft.nodes, n],
      transitions: [
        ...draft.transitions,
        { id: id("edge"), source: sourceId, sourceHandle, target: n.id },
      ],
    });
    setSelection({ kind: "node", id: n.id });
    setPanel("node");
    setShowPanel(true);
    setTimeout(
      () => fitView({ padding: 0.18, maxZoom: 0.9, duration: 200 }),
      80,
    );
  }
  function deleteNode() {
    if (!node) return;
    patch({
      nodes: draft.nodes.filter((n) => n.id !== node.id),
      transitions: draft.transitions.filter(
        (e) => e.source !== node.id && e.target !== node.id,
      ),
    });
    setSelection({ kind: "node", id: TRIGGER_ID });
  }
  const canConnect = useCallback((c) => {
    const w = draftRef.current;
    if (
      !c.source ||
      !c.target ||
      c.target === TRIGGER_ID ||
      c.source === c.target ||
      hasPath(w, c.target, c.source)
    )
      return false;
    const source =
      c.source === TRIGGER_ID
        ? { type: "trigger" }
        : w.nodes.find((n) => n.id === c.source);
    if (
      !source ||
      !w.nodes.some((n) => n.id === c.target) ||
      !ports(source).includes(c.sourceHandle)
    )
      return false;
    return !w.transitions.some(
      (e) => e.source === c.source && e.sourceHandle === c.sourceHandle,
    );
  }, []);
  function connect(c) {
    if (!canConnect(c)) {
      setError(
        "Transition không hợp lệ: cổng đã nối, vòng lặp hoặc nối vào Trigger.",
      );
      return;
    }
    const e = {
      id: id("edge"),
      source: c.source,
      target: c.target,
      sourceHandle: c.sourceHandle,
    };
    patch({ transitions: [...draft.transitions, e] });
    setSelection({ kind: "edge", id: e.id });
    setPanel("transitions");
  }
  function changePositions(changes) {
    const deletes = changes
      .filter((c) => c.type === "remove")
      .map((c) => c.id)
      .filter((id) => id !== TRIGGER_ID);
    if (deletes.length) {
      commit({
        ...draft,
        nodes: draft.nodes.filter((n) => !deletes.includes(n.id)),
        transitions: draft.transitions.filter(
          (e) => !deletes.includes(e.source) && !deletes.includes(e.target),
        ),
      });
      return;
    }
    const positions = changes.filter(
      (c) => c.type === "position" && c.position,
    );
    if (positions.length)
      setDraft((d) => ({
        ...d,
        trigger: {
          ...d.trigger,
          position:
            positions.find((p) => p.id === TRIGGER_ID)?.position ||
            d.trigger.position,
        },
        nodes: d.nodes.map((n) => ({
          ...n,
          position:
            positions.find((p) => p.id === n.id)?.position || n.position,
        })),
      }));
  }
  async function persist(published) {
    try {
      if (published) validateWorkflow(draft, s.templates);
      const ok = await save({ ...draft, published });
      if (ok) {
        setDraft((d) => ({
          ...d,
          published,
          version:
            (s.workflows.find((w) => w.id === draft.id)?.version || 0) + 1,
        }));
        setError("");
      }
    } catch (e) {
      setError(e.message);
    }
  }
  function simulate() {
    try {
      validateWorkflow(draft, s.templates);
      const input = JSON.parse(testPayload);
      const base = initialState();
      base.templates = structuredClone(s.templates);
      base.workflows = [{ ...structuredClone(draft), published: true }];
      setPreview(
        reduceCommand(base, {
          type: "CREATE_TICKET",
          role: "tenant",
          payload: { ...input, type: draft.triggerType },
        }),
      );
      setError("");
      setTestOpen(true);
    } catch (e) {
      setError(e.message);
    }
  }
  function simulateCommand(type, payload, role = "pms") {
    try {
      setPreview(reduceCommand(preview, { type, payload, role }));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  function finishPreview(wo) {
    try {
      let next = preview;
      if (["todo", "pause"].includes(wo.status))
        next = reduceCommand(next, {
          type: "WO_STATUS",
          role: "maintainer",
          payload: { workOrderId: wo.id, status: "in-progress" },
        });
      wo.checklist.forEach((_, index) => {
        next = reduceCommand(next, {
          type: "WO_CHECK",
          role: "maintainer",
          payload: { workOrderId: wo.id, index, done: true },
        });
      });
      next = reduceCommand(next, {
        type: "WO_STATUS",
        role: "maintainer",
        payload: { workOrderId: wo.id, status: "completed" },
      });
      setPreview(next);
    } catch (e) {
      setError(e.message);
    }
  }
  function exportJSON() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "smartos-workflow.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  async function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw Error("File workflow tối đa 1 MB.");
      const incoming = toGraph(JSON.parse(await file.text()));
      validateWorkflow(incoming, s.templates);
      incoming.id = id("wf");
      incoming.published = false;
      incoming.version = 0;
      load(incoming);
    } catch (err) {
      setError(err.message);
    }
    e.target.value = "";
  }
  function changeAction(action) {
    const inputs =
      action === "wait-event"
        ? { eventName: literal("") }
        : action === "emit-event"
          ? { eventName: literal(""), payload: literal({}) }
          : ["read-record", "update-record"].includes(action)
            ? {
                resource: literal(""),
                recordId: literal(""),
                ...(action === "update-record"
                  ? { field: literal(""), value: literal("") }
                  : {}),
              }
            : { value: literal("") };
    patchNode({
      action,
      inputs,
      filters: [],
      outputPaths: [],
      legacyAction: undefined,
      variableName:
        action === "set-variable" ? draft.variables[0]?.name || "" : undefined,
    });
  }
  let sampleInput;
  try {
    sampleInput = JSON.parse(testPayload);
  } catch {
    sampleInput = {};
  }
  const inspector = selection.id === TRIGGER_ID && selection.kind === "node";
  return (
    <div className={`graph-studio ${full ? "fullscreen" : ""}`}>
      <div className="graph-toolbar">
        <div className="graph-title">
          <span className="graph-title-icon">
            <GitFork size={19} />
          </span>
          <div>
            <strong>Thiết kế quy trình</strong>
            <small>Thêm bước · nối luồng · chạy thử</small>
          </div>
        </div>
        <select
          aria-label="Workflow"
          value={s.workflows.some((w) => w.id === draft.id) ? draft.id : ""}
          onChange={(e) =>
            load(s.workflows.find((w) => w.id === e.target.value))
          }
        >
          <option value="" disabled>
            Workflow mới
          </option>
          {s.workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} · v{w.version}
            </option>
          ))}
        </select>
        <span className={`badge ${draft.published ? "resolved" : "pause"}`}>
          {draft.published ? "Đã xuất bản" : "Bản nháp"}
        </span>
        <div className="graph-toolbar-tools">
          <button
            className="icon-btn"
            disabled={!past.length}
            title="Undo · Ctrl/Cmd Z"
            aria-label="Undo"
            onClick={undo}
          >
            <Undo2 size={15} />
          </button>
          <button
            className="icon-btn"
            disabled={!future.length}
            aria-label="Redo"
            onClick={redo}
          >
            <Redo2 size={15} />
          </button>
          <button
            className="icon-btn"
            aria-label="Xuất workflow JSON"
            onClick={exportJSON}
          >
            <Download size={15} />
          </button>
          <button
            className="icon-btn"
            aria-label="Nhập workflow JSON"
            onClick={() => fileRef.current.click()}
          >
            <Upload size={15} />
          </button>
          <input
            hidden
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={importJSON}
          />
          <button
            className="icon-btn"
            aria-label={full ? "Thoát toàn màn hình" : "Toàn màn hình"}
            onClick={() => setFull(!full)}
          >
            {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
        <div className="actions">
          <Button
            icon={Plus}
            onClick={() =>
              load({
                graphVersion: 2,
                id: id("wf"),
                name: "Workflow mới",
                triggerType: "General request",
                version: 0,
                published: false,
                trigger: {
                  id: TRIGGER_ID,
                  event: "ticket.created",
                  position: { x: 60, y: 170 },
                },
                nodes: [],
                transitions: [],
                variables: [],
              })
            }
          >
            Tạo workflow
          </Button>
          <Button icon={Save} disabled={busy} onClick={() => persist(false)}>
            Lưu nháp
          </Button>
          <Button
            icon={Send}
            primary
            disabled={busy}
            onClick={() => persist(true)}
          >
            Xuất bản
          </Button>
        </div>
      </div>
      {error && (
        <div role="alert" className="error-banner graph-error">
          {error}
          <button aria-label="Đóng lỗi canvas" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="builder-guide">
        <div>
          <strong>Thiết kế từng bước</strong>
          <p>
            Chọn một bước để cấu hình. Dùng “Thêm bước tiếp theo” hoặc kéo nối
            hai bước trên sơ đồ.
          </p>
        </div>
        <ol>
          <li>Chọn lúc bắt đầu</li>
          <li>Thêm và nối các bước</li>
          <li>Chạy thử trước khi xuất bản</li>
        </ol>
        <button
          className={`btn ${advanced ? "active" : ""}`}
          aria-pressed={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          Cấu hình nâng cao
        </button>
      </div>
      <div className={`graph-body ${showPanel ? "" : "panel-hidden"}`}>
        <aside className="graph-library">
          <div className="graph-library-heading">
            <span>WORKFLOW</span>
            <button
              className="icon-btn"
              aria-label="Cấu hình workflow"
              onClick={() => {
                setPanel("node");
                setSelection({ kind: "node", id: TRIGGER_ID });
              }}
            >
              <Cog size={14} />
            </button>
          </div>
          <button
            className="graph-section-link"
            onClick={() => {
              setSelection({ kind: "node", id: TRIGGER_ID });
              setPanel("node");
              setShowPanel(true);
            }}
          >
            <Zap size={15} />
            Bắt đầu
            <ChevronRight size={13} />
          </button>
          <div className="graph-library-section">
            <span>CÁC BƯỚC</span>
            <small>Kéo thả vào canvas</small>
          </div>
          <div className="graph-library-search">
            <Search size={13} />
            <input
              aria-label="Tìm bước"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm bước..."
            />
          </div>
          <div className="graph-palette">
            {Object.entries(definitions)
              .filter(
                ([type, def]) =>
                  type !== "trigger" &&
                  (def.title + def.description)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map(([type, def]) => (
                <button
                  className="palette-node"
                  key={type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/smartos-node", type);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => add(type)}
                  aria-label={`Thêm ${def.title}`}
                >
                  <span className={`palette-node-icon ${def.color}`}>
                    <def.Icon size={17} />
                  </span>
                  <span>
                    <strong>{def.title}</strong>
                    <small>{def.description}</small>
                  </span>
                  <Plus size={12} />
                </button>
              ))}
          </div>
          <div className="graph-library-divider" />
          <button
            className={`graph-section-link ${panel === "transitions" ? "active" : ""}`}
            onClick={() => {
              setPanel("transitions");
              setSelection({
                kind: "edge",
                id: draft.transitions[0]?.id || "",
              });
              setShowPanel(true);
            }}
          >
            <Cable size={15} />
            Đường đi
            <span className="graph-count">{draft.transitions.length}</span>
          </button>
          <button
            className={`graph-section-link ${panel === "data" ? "active" : ""}`}
            onClick={() => {
              setPanel("data");
              setShowPanel(true);
            }}
          >
            <Braces size={15} />
            Thông tin dùng chung
            <span className="graph-count">{draft.variables.length}</span>
          </button>
          <div className="graph-library-tip">
            <strong>Thiết kế trên canvas</strong>
            <p>
              Kéo bước để đổi vị trí.
              <br />
              Kéo từ chấm bên phải sang chấm bên trái của bước tiếp theo.
            </p>
            <small>Delete: xoá · Ctrl/Cmd Z: undo</small>
          </div>
        </aside>
        <section className="graph-canvas-shell">
          <div className="graph-canvas-top">
            <span>
              <span className="live-dot" /> {draft.name}
            </span>
            <div>
              <Button
                icon={Play}
                onClick={() => {
                  setTestOpen(!testOpen);
                  if (full) setShowPanel(true);
                }}
              >
                Chạy thử
              </Button>
              <button
                className="icon-btn"
                aria-label="Ẩn hiện inspector"
                onClick={() => setShowPanel(!showPanel)}
              >
                {showPanel ? (
                  <PanelRightClose size={15} />
                ) : (
                  <PanelRightOpen size={15} />
                )}
              </button>
            </div>
          </div>
          <div
            className="graph-canvas"
            ref={canvasRef}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const type = e.dataTransfer.getData("application/smartos-node");
              if (NODE_LABELS[type])
                add(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            }}
          >
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={flowNodeTypes}
              onNodesChange={changePositions}
              onEdgesChange={(changes) => {
                const removed = changes
                  .filter((c) => c.type === "remove")
                  .map((c) => c.id);
                if (removed.length)
                  patch({
                    transitions: draft.transitions.filter(
                      (e) => !removed.includes(e.id),
                    ),
                  });
              }}
              onNodeDragStart={() => {
                dragOrigin.current = structuredClone(draftRef.current);
              }}
              onNodeDragStop={(_, moved) => {
                if (dragOrigin.current) {
                  const current = draftRef.current;
                  commit(
                    {
                      ...current,
                      trigger:
                        moved.id === TRIGGER_ID
                          ? { ...current.trigger, position: moved.position }
                          : current.trigger,
                      nodes: current.nodes.map((n) =>
                        n.id === moved.id
                          ? { ...n, position: moved.position }
                          : n,
                      ),
                    },
                    dragOrigin.current,
                  );
                  dragOrigin.current = null;
                }
              }}
              onNodeClick={(_, n) => {
                setSelection({ kind: "node", id: n.id });
                setPanel("node");
                setShowPanel(true);
              }}
              onEdgeClick={(_, e) => {
                setSelection({ kind: "edge", id: e.id });
                setPanel("transitions");
                setShowPanel(true);
              }}
              onPaneClick={() => {}}
              onConnect={connect}
              isValidConnection={canConnect}
              fitView
              fitViewOptions={{ padding: 0.13, maxZoom: 0.9 }}
              minZoom={0.25}
              maxZoom={1.6}
              deleteKeyCode={["Backspace", "Delete"]}
              snapToGrid
              snapGrid={[10, 10]}
              connectionRadius={25}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} color="#c9d9d1" />
              <MiniMap
                style={{ width: 120, height: 85 }}
                nodeColor={(n) =>
                  n.data.node.type === "trigger" ? "#6cab89" : "#c4d6ce"
                }
                pannable
                zoomable
              />
              <Controls
                showInteractive={false}
                fitViewOptions={{ padding: 0.18, maxZoom: 0.9 }}
              />
            </ReactFlow>
          </div>
          <div className="graph-canvas-bottom">
            <span>
              {draft.nodes.length} bước · {draft.transitions.length} đường nối
            </span>
            <span>
              <span className="legend-dot green" /> Hoàn tất{" "}
              <span className="legend-dot amber" /> Đang chờ{" "}
              <span className="legend-dot gray" /> Bỏ qua
            </span>
          </div>
        </section>
        {showPanel && (
          <aside className="graph-inspector">
            <div className="graph-inspector-heading">
              <strong>
                {panel === "data"
                  ? "Thông tin dùng chung"
                  : panel === "transitions"
                    ? "Đường đi"
                    : inspector
                      ? "Bắt đầu quy trình"
                      : definitions[node?.type]?.title || "Cấu hình bước"}
              </strong>
              <span>CẤU HÌNH</span>
            </div>
            <div className="graph-inspector-content">
              {panel === "node" &&
                (inspector ? (
                  <>
                    <Field label="Tên workflow">
                      <input
                        value={draft.name}
                        onChange={(e) => patch({ name: e.target.value })}
                      />
                    </Field>
                    {advanced && (
                      <>
                        <Field label="Sự kiện trigger">
                          <select value="ticket.created" readOnly>
                            <option>ticket.created</option>
                          </select>
                        </Field>
                      </>
                    )}
                    <Field label="Bắt đầu khi có yêu cầu mới thuộc loại">
                      <select
                        value={draft.triggerType}
                        onChange={(e) => patch({ triggerType: e.target.value })}
                      >
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {advanced
                              ? t
                              : {
                                  string: "Văn bản",
                                  number: "Số",
                                  boolean: "Có / Không",
                                  object: "Dữ liệu ghép",
                                }[t]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="graph-inspector-note">
                      <Zap size={16} />
                      <p>
                        Quy trình đã xuất bản sẽ tự chạy mỗi khi một yêu cầu mới
                        thuộc loại này được gửi lên.
                      </p>
                    </div>
                    {advanced && (
                      <>
                        <h3>Trigger output</h3>
                        <div className="output-schema">
                          {OUTPUTS.trigger.map((path) => (
                            <div key={path}>
                              <Braces size={11} />
                              <code>trigger.{path}</code>
                            </div>
                          ))}
                        </div>{" "}
                      </>
                    )}
                    <NextStepControl
                      draft={draft}
                      source={{ id: TRIGGER_ID, type: "trigger" }}
                      onAdd={addNext}
                    />
                  </>
                ) : (
                  node && (
                    <>
                      <div className="selected-node-type">
                        <span
                          className={`node-icon ${definitions[node.type].color}`}
                        >
                          {React.createElement(definitions[node.type].Icon, {
                            size: 19,
                          })}
                        </span>
                        <div>
                          <strong>{definitions[node.type].title}</strong>
                          <small>
                            {advanced
                              ? node.id.split("-").slice(0, 2).join("-")
                              : definitions[node.type].description}
                          </small>
                        </div>
                        <button
                          className="icon-btn"
                          aria-label="Nhân bản bước"
                          onClick={() => {
                            const n = {
                              ...structuredClone(node),
                              id: id(node.type),
                              title: node.title + " (bản sao)",
                              position: {
                                x: node.position.x + 40,
                                y: node.position.y + 150,
                              },
                            };
                            patch({ nodes: [...draft.nodes, n] });
                            setSelection({ kind: "node", id: n.id });
                          }}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <Field label="Tên bước">
                        <input
                          value={node.title}
                          onChange={(e) => patchNode({ title: e.target.value })}
                        />
                      </Field>
                      <div className="business-summary">
                        {stepSummary(node, draft)}
                      </div>
                      {node.type === "notify" && (
                        <NotificationConfig
                          node={node}
                          workflow={draft}
                          patch={patchNode}
                          users={USERS}
                          run={run}
                        />
                      )}
                      {!advanced &&
                        node.type !== "notify" &&
                        (node.type === "automation" ? (
                          <AutomationConfig
                            node={node}
                            workflow={draft}
                            patch={patchNode}
                            changeAction={changeAction}
                          />
                        ) : (
                          <GeneralConfig
                            node={node}
                            workflow={draft}
                            patch={patchNode}
                            templates={s.templates}
                            users={USERS}
                          />
                        ))}
                      {advanced && (
                        <>
                          {node.type === "workorder" && (
                            <>
                              <Field label="Template công việc">
                                <select
                                  value={node.templateId || ""}
                                  onChange={(e) =>
                                    patchNode({ templateId: e.target.value })
                                  }
                                >
                                  <option value="">Tự tạo</option>
                                  {s.templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Giao cho">
                                <select
                                  value={node.assignee}
                                  onChange={(e) =>
                                    patchNode({ assignee: e.target.value })
                                  }
                                >
                                  <option value="tech-01">
                                    Trần Hoàng Nam · HVAC
                                  </option>
                                </select>
                              </Field>
                              <p className="graph-inspector-note">
                                Bước này tạo công việc rồi đi tiếp. Để chờ một
                                thay đổi sau đó, thêm Tự động hóa → Chờ một thay
                                đổi.
                              </p>
                            </>
                          )}
                          {node.type === "approval" && (
                            <div className="graph-inspector-note">
                              <ShieldCheck size={17} />
                              <p>
                                Thông báo approve cho PMS. Quyết định đi qua
                                cổng Approved hoặc Rejected. Nếu Rejected không
                                có dây nối, run dừng và ticket bị hủy.
                              </p>
                            </div>
                          )}
                          {node.type === "condition" && (
                            <Field label="Phép so sánh">
                              <select
                                value={node.operator}
                                onChange={(e) =>
                                  patchNode({ operator: e.target.value })
                                }
                              >
                                {[
                                  "equals",
                                  "not-equals",
                                  ">",
                                  ">=",
                                  "<",
                                  "<=",
                                  "contains",
                                ].map((op) => (
                                  <option key={op}>{op}</option>
                                ))}
                              </select>
                            </Field>
                          )}
                          {node.type === "parallel" && (
                            <>
                              <Field label="Chế độ Parallel">
                                <select
                                  value={node.mode}
                                  onChange={(e) =>
                                    patchNode({ mode: e.target.value })
                                  }
                                >
                                  <option value="split">
                                    Split · chạy các nhánh song song
                                  </option>
                                  <option value="join">
                                    Join · đợi mọi nhánh hoạt động
                                  </option>
                                </select>
                              </Field>
                              {node.mode !== "join" && (
                                <Field label="Số nhánh">
                                  <input
                                    type="number"
                                    min={2}
                                    max={6}
                                    value={node.branches.length}
                                    onChange={(e) => {
                                      const count = Math.min(
                                        6,
                                        Math.max(2, Number(e.target.value)),
                                      );
                                      patchNode({
                                        branches: Array.from(
                                          { length: count },
                                          (_, i) => `branch-${i + 1}`,
                                        ),
                                      });
                                    }}
                                  />
                                </Field>
                              )}
                              <div className="graph-inspector-note">
                                Split kích hoạt mọi nhánh. Join đợi các nhánh
                                active hoàn tất; nhánh False/Rejected bị bỏ qua
                                không chặn Join.
                              </div>
                            </>
                          )}
                          {node.type === "automation" && (
                            <>
                              <Field label="Automation action">
                                <select
                                  value={node.action}
                                  onChange={(e) => changeAction(e.target.value)}
                                >
                                  {Object.entries(actionNames).map(
                                    ([key, label]) => (
                                      <option key={key} value={key}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </Field>
                              {node.action === "set-variable" && (
                                <Field label="Biến cần gán">
                                  <select
                                    value={node.variableName}
                                    onChange={(e) =>
                                      patchNode({
                                        variableName: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="" disabled>
                                      Chọn biến
                                    </option>
                                    {draft.variables.map((v) => (
                                      <option key={v.name}>{v.name}</option>
                                    ))}
                                  </select>
                                </Field>
                              )}
                              {node.action === "wait-event" && (
                                <>
                                  <div className="graph-inspector-note">
                                    Chờ sự kiện có tên và payload khớp tất cả bộ
                                    lọc. Có thể lấy giá trị lọc từ output node
                                    trước. Sự kiện được xét từ lúc bắt đầu run.
                                  </div>
                                  <h3>Payload filters · AND</h3>
                                  {(node.filters || []).map((filter, index) => (
                                    <div
                                      className="event-filter"
                                      key={filter.id}
                                    >
                                      <Field
                                        label={`Payload path ${index + 1}`}
                                      >
                                        <input
                                          value={filter.path}
                                          placeholder="data.id"
                                          onChange={(e) =>
                                            patchNode({
                                              filters: node.filters.map((f) =>
                                                f.id === filter.id
                                                  ? {
                                                      ...f,
                                                      path: e.target.value,
                                                    }
                                                  : f,
                                              ),
                                            })
                                          }
                                        />
                                      </Field>
                                      <Field
                                        label={`Filter operator ${index + 1}`}
                                      >
                                        <select
                                          value={filter.operator}
                                          onChange={(e) =>
                                            patchNode({
                                              filters: node.filters.map((f) =>
                                                f.id === filter.id
                                                  ? {
                                                      ...f,
                                                      operator: e.target.value,
                                                    }
                                                  : f,
                                              ),
                                            })
                                          }
                                        >
                                          {[
                                            "equals",
                                            "not-equals",
                                            ">",
                                            ">=",
                                            "<",
                                            "<=",
                                            "contains",
                                            "one-of",
                                          ].map((op) => (
                                            <option key={op}>{op}</option>
                                          ))}
                                        </select>
                                      </Field>
                                      <Button
                                        onClick={() => {
                                          const inputs = { ...node.inputs };
                                          delete inputs[`filter_${filter.id}`];
                                          patchNode({
                                            filters: node.filters.filter(
                                              (f) => f.id !== filter.id,
                                            ),
                                            inputs,
                                          });
                                        }}
                                      >
                                        Xóa bộ lọc {index + 1}
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    onClick={() => {
                                      const filterId = id("filter");
                                      patchNode({
                                        filters: [
                                          ...(node.filters || []),
                                          {
                                            id: filterId,
                                            path: "",
                                            operator: "equals",
                                          },
                                        ],
                                        inputs: {
                                          ...node.inputs,
                                          [`filter_${filterId}`]: literal(""),
                                        },
                                      });
                                    }}
                                  >
                                    Thêm bộ lọc
                                  </Button>
                                </>
                              )}
                              {["read-record", "update-record"].includes(
                                node.action,
                              ) && (
                                <p className="graph-inspector-note">
                                  Resource hiện có: ticket, workorder. Update hỗ
                                  trợ title, note, priority và ticket.status;
                                  giá trị được kiểm tra theo quy tắc nghiệp vụ.
                                </p>
                              )}
                              {[
                                "wait-event",
                                "emit-event",
                                "read-record",
                                "update-record",
                              ].includes(node.action) && (
                                <>
                                  <Field label="Output paths">
                                    <input
                                      value={(node.outputPaths || []).join(
                                        ", ",
                                      )}
                                      placeholder="data.id, data.status"
                                      onChange={(e) =>
                                        patchNode({
                                          outputPaths: e.target.value
                                            .split(",")
                                            .map((p) => p.trim())
                                            .filter(Boolean),
                                        })
                                      }
                                    />
                                  </Field>
                                  <div className="graph-inspector-note">
                                    Khai báo đường dẫn để node sau chọn từng
                                    trường trong{" "}
                                    {["wait-event", "emit-event"].includes(
                                      node.action,
                                    )
                                      ? "payload"
                                      : "record"}
                                    .
                                  </div>
                                </>
                              )}
                            </>
                          )}
                          {nodeFields(node).length > 0 && (
                            <h3>Inputs / Data mapping</h3>
                          )}
                          {nodeFields(node).map((field) => (
                            <InputBinding
                              key={`${node.id}:${field.key}`}
                              field={field}
                              binding={node.inputs[field.key]}
                              workflow={draft}
                              node={node}
                              change={(binding) =>
                                patchNode({
                                  inputs: {
                                    ...node.inputs,
                                    [field.key]: binding,
                                  },
                                })
                              }
                              actual={
                                run?.nodeStates?.[node.id]?.inputs?.[field.key]
                              }
                            />
                          ))}
                          <h3>Output của node</h3>
                          <div className="output-schema">
                            {outputFields(node).map((path) => (
                              <div key={path}>
                                <Braces size={11} />
                                <code>{path}</code>
                              </div>
                            ))}
                          </div>
                          {run?.outputs[node.id] && (
                            <pre className="actual-output">
                              {JSON.stringify(run.outputs[node.id], null, 2)}
                            </pre>
                          )}
                        </>
                      )}
                      <NextStepControl
                        draft={draft}
                        source={node}
                        onAdd={addNext}
                      />
                      <Button icon={Trash2} onClick={deleteNode}>
                        Xóa bước
                      </Button>
                    </>
                  )
                ))}
              {panel === "transitions" && (
                <TransitionPanel
                  draft={draft}
                  edge={edge}
                  patch={patch}
                  connect={connect}
                  select={(id) => setSelection({ kind: "edge", id })}
                />
              )}
              {panel === "data" && (
                <>
                  <div className="graph-inspector-note">
                    <Braces size={17} />
                    <p>
                      Lưu thông tin dùng chung giữa các bước, chẳng hạn ghi chú
                      xử lý. Mỗi lần chạy có giá trị riêng; các bước sau có thể
                      chọn thông tin này.
                    </p>
                  </div>
                  <Button
                    icon={Plus}
                    onClick={() =>
                      patch({
                        variables: [
                          ...draft.variables,
                          {
                            id: id("var"),
                            name: `variable${draft.variables.length + 1}`,
                            type: "string",
                            label: `Thông tin ${draft.variables.length + 1}`,
                            value: "",
                          },
                        ],
                      })
                    }
                  >
                    Thêm biến
                  </Button>
                  {draft.variables.map((v, i) => (
                    <div className="variable-card" key={v.id || i}>
                      <div className="row-between">
                        <strong>Thông tin {i + 1}</strong>
                        <button
                          className="icon-btn"
                          aria-label={`Xóa biến ${v.name}`}
                          onClick={() =>
                            patch({
                              variables: draft.variables.filter(
                                (_, index) => index !== i,
                              ),
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <Field
                        label={
                          advanced
                            ? `Tên biến ${i + 1}`
                            : `Tên thông tin dùng chung ${i + 1}`
                        }
                      >
                        <input
                          value={advanced ? v.name : v.label || v.name}
                          onChange={(e) =>
                            patch({
                              variables: draft.variables.map((x, index) =>
                                index === i
                                  ? {
                                      ...x,
                                      [advanced ? "name" : "label"]:
                                        e.target.value,
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={`Kiểu biến ${i + 1}`}>
                        <select
                          value={v.type}
                          onChange={(e) =>
                            patch({
                              variables: draft.variables.map((x, index) =>
                                index === i
                                  ? {
                                      ...x,
                                      type: e.target.value,
                                      value: {
                                        string: "",
                                        number: 0,
                                        boolean: true,
                                        object: {},
                                      }[e.target.value],
                                    }
                                  : x,
                              ),
                            })
                          }
                        >
                          {["string", "number", "boolean", "object"].map(
                            (t) => (
                              <option key={t} value={t}>
                                {advanced
                                  ? t
                                  : {
                                      string: "Văn bản",
                                      number: "Số",
                                      boolean: "Có / Không",
                                      object: "Dữ liệu ghép",
                                    }[t]}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                      <Field label={`Giá trị biến ${i + 1}`}>
                        {v.type === "boolean" ? (
                          <select
                            value={String(v.value)}
                            onChange={(e) =>
                              patch({
                                variables: draft.variables.map((x, index) =>
                                  index === i
                                    ? { ...x, value: e.target.value === "true" }
                                    : x,
                                ),
                              })
                            }
                          >
                            <option>true</option>
                            <option>false</option>
                          </select>
                        ) : (
                          <input
                            type={v.type === "number" ? "number" : "text"}
                            value={
                              v.type === "object" && typeof v.value === "object"
                                ? JSON.stringify(v.value)
                                : (v.value ?? "")
                            }
                            onChange={(e) => {
                              let value = e.target.value;
                              if (v.type === "number")
                                value = value === "" ? null : Number(value);
                              if (v.type === "object") {
                                try {
                                  value = JSON.parse(value);
                                } catch {}
                              }
                              patch({
                                variables: draft.variables.map((x, index) =>
                                  index === i ? { ...x, value } : x,
                                ),
                              });
                            }}
                          />
                        )}
                      </Field>
                      {run && (
                        <small className="binding-actual">
                          Lần chạy thử: {JSON.stringify(run.variables[v.name])}
                        </small>
                      )}
                    </div>
                  ))}
                  {advanced && (
                    <>
                      <h3>Data contract</h3>
                      <p className="graph-inspector-note">
                        Trigger là snapshot ticket lúc tạo. Output node là JSON
                        riêng theo node ID, không lấy công việc “mới nhất”. Node
                        chỉ dùng output của các node phía trước được nối bằng
                        transition.
                      </p>
                      <pre className="actual-output">
                        {JSON.stringify(
                          run
                            ? {
                                trigger: run.triggerOutput,
                                variables: run.variables,
                                outputs: run.outputs,
                              }
                            : {
                                trigger: "Ticket snapshot",
                                variables: Object.fromEntries(
                                  draft.variables.map((v) => [v.name, v.value]),
                                ),
                                outputs: "Có sau khi Chạy thử",
                              },
                          null,
                          2,
                        )}
                      </pre>{" "}
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      {testOpen && (
        <div className="graph-test-panel">
          <div className="graph-test-header">
            <strong>
              <Play size={15} /> Chạy thử workflow
            </strong>
            <span>Dữ liệu thử riêng, không gửi thông báo thật</span>
            <button
              className="icon-btn"
              aria-label="Đóng chạy thử"
              onClick={() => setTestOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          <div className="graph-test-body">
            <div>
              {advanced ? (
                <>
                  <Field label="Trigger input JSON">
                    <textarea
                      rows={7}
                      value={testPayload}
                      onChange={(e) => setTestPayload(e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <div className="business-test-form">
                  <strong>Thử với một yêu cầu mẫu</strong>
                  {["title", "location"].map((key) => (
                    <FormField
                      key={key}
                      label={
                        key === "title"
                          ? "Tên yêu cầu chạy thử"
                          : "Vị trí chạy thử"
                      }
                    >
                      <input
                        value={sampleInput[key] || ""}
                        onChange={(e) =>
                          setTestPayload(
                            JSON.stringify(
                              { ...sampleInput, [key]: e.target.value },
                              null,
                              2,
                            ),
                          )
                        }
                      />
                    </FormField>
                  ))}
                  <FormField label="Mức ưu tiên chạy thử">
                    <select
                      value={sampleInput.priority}
                      onChange={(e) =>
                        setTestPayload(
                          JSON.stringify(
                            { ...sampleInput, priority: e.target.value },
                            null,
                            2,
                          ),
                        )
                      }
                    >
                      {["low", "medium", "high", "urgent"].map((value) => (
                        <option key={value} value={value}>
                          {VALUES[value]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              )}
              <Button primary icon={Play} onClick={simulate}>
                Bắt đầu chạy thử
              </Button>
            </div>
            <div className="graph-test-events">
              {run ? (
                <>
                  <div className="row-between">
                    <strong>
                      {{
                        "waiting-approval": "Chờ phê duyệt",
                        "waiting-event": "Chờ sự kiện",
                        "waiting-data": "Chờ điều kiện dữ liệu",
                        "waiting-workorder": "Chờ work order",
                        "waiting-linked-workorders":
                          "Chờ các nhánh / công việc",
                        completed: "Đã hoàn tất quy trình",
                        error: "Lỗi",
                        rejected: "Từ chối",
                        cancelled: "Đã hủy",
                      }[run.status] || run.status}
                    </strong>
                    <span className={`badge ${preview.tickets[0].status}`}>
                      {preview.tickets[0].status}
                    </span>
                  </div>
                  {run.error && <p className="error-text">{run.error}</p>}
                  {Object.entries(run.approvals)
                    .filter(([, a]) => a.status === "pending")
                    .map(([nodeId]) => (
                      <div className="test-event" key={nodeId}>
                        <span>
                          {
                            run.workflow.nodes.find((n) => n.id === nodeId)
                              .title
                          }
                        </span>
                        <Button
                          onClick={() =>
                            simulateCommand("REJECT", {
                              runId: run.id,
                              nodeId,
                              reason: "Từ chối trong chạy thử",
                            })
                          }
                        >
                          Từ chối
                        </Button>
                        <Button
                          primary
                          onClick={() =>
                            simulateCommand("APPROVE", {
                              runId: run.id,
                              nodeId,
                            })
                          }
                        >
                          Phê duyệt
                        </Button>
                      </div>
                    ))}
                  {preview.workOrders
                    .filter((w) => !["completed", "closed"].includes(w.status))
                    .map((wo) => (
                      <div className="test-event" key={wo.id}>
                        <span>
                          {wo.title}
                          <small>
                            {wo.id.split("-").slice(0, 2).join("-")}
                          </small>
                        </span>
                        <Button icon={Check} onClick={() => finishPreview(wo)}>
                          Hoàn tất công việc
                        </Button>
                      </div>
                    ))}
                  {!advanced && (
                    <SignalTester run={run} send={simulateCommand} />
                  )}
                  {advanced && (
                    <details className="sandbox-event">
                      <summary>Phát sự kiện tùy chỉnh</summary>
                      <Field label="Tên sự kiện chạy thử">
                        <input
                          value={eventName}
                          onChange={(e) => setEventName(e.target.value)}
                        />
                      </Field>
                      <Field label="Payload sự kiện JSON">
                        <textarea
                          rows={4}
                          value={eventPayload}
                          onChange={(e) => setEventPayload(e.target.value)}
                        />
                      </Field>
                      <Button
                        onClick={() => {
                          try {
                            simulateCommand("EMIT_EVENT", {
                              name: eventName,
                              payload: JSON.parse(eventPayload),
                            });
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        Phát sự kiện
                      </Button>
                      <pre>
                        {JSON.stringify(preview.events?.slice(-3), null, 2)}
                      </pre>
                    </details>
                  )}
                  <small>
                    {
                      Object.values(run.nodeStates).filter(
                        (n) => n.status === "completed",
                      ).length
                    }{" "}
                    bước hoàn tất ·{" "}
                    {
                      Object.values(run.nodeStates).filter(
                        (n) => n.status === "skipped",
                      ).length
                    }{" "}
                    bước bỏ qua · {preview.notifications.length} thông báo thử
                  </small>
                  {advanced && (
                    <details>
                      <summary>Chi tiết kỹ thuật của lần chạy</summary>
                      <pre>{JSON.stringify(run.trace, null, 2)}</pre>
                    </details>
                  )}
                </>
              ) : (
                <div className="graph-inspector-note">
                  Chạy thử bằng một yêu cầu mẫu. Bạn có thể phê duyệt và hoàn
                  tất công việc trong khu vực này để xem quy trình đi tiếp.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="graph-footnote">
        <Info size={13} /> Các bước có thể dùng thông tin từ yêu cầu ban đầu
        hoặc kết quả của bước trước. Lưu nháp để tiếp tục chỉnh; xuất bản để áp
        dụng cho yêu cầu mới.
      </div>
    </div>
  );
}
function TransitionPanel({ draft, edge, patch, connect, select }) {
  const [source, setSource] = useState(TRIGGER_ID),
    [target, setTarget] = useState(draft.nodes[0]?.id || ""),
    [port, setPort] = useState("success");
  const sourceNode =
      source === TRIGGER_ID
        ? { type: "trigger" }
        : draft.nodes.find((n) => n.id === source),
    options = ports(sourceNode || { type: "trigger" });
  const name = (nodeId) =>
    nodeId === TRIGGER_ID
      ? "Trigger"
      : draft.nodes.find((n) => n.id === nodeId)?.title || "Node đã xóa";
  return (
    <>
      <div className="graph-inspector-note">
        <Cable size={17} />
        <p>
          Kéo dây trên canvas hoặc tạo transition dưới đây. Điều kiện chuyển
          nhánh nằm ở cổng output của node.
        </p>
      </div>
      {edge && (
        <div className="selected-transition">
          <strong>Transition đang chọn</strong>
          <p>
            {name(edge.source)} <ArrowRight size={12} /> {name(edge.target)}
          </p>
          <Field label="Nhãn transition">
            <input
              value={edge.label || ""}
              placeholder={portName(edge.sourceHandle)}
              onChange={(e) =>
                patch({
                  transitions: draft.transitions.map((t) =>
                    t.id === edge.id ? { ...t, label: e.target.value } : t,
                  ),
                })
              }
            />
          </Field>
          <span className="badge">{portName(edge.sourceHandle)}</span>
          <Button
            icon={Trash2}
            onClick={() => {
              patch({
                transitions: draft.transitions.filter((t) => t.id !== edge.id),
              });
              select("");
            }}
          >
            Xóa đường nối
          </Button>
        </div>
      )}
      <h3>Nối hai bước</h3>
      <Field label="Từ bước">
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPort(
              ports(
                e.target.value === TRIGGER_ID
                  ? { type: "trigger" }
                  : draft.nodes.find((n) => n.id === e.target.value),
              )[0],
            );
          }}
        >
          <option value={TRIGGER_ID}>Bắt đầu</option>
          {draft.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Đi theo nhánh">
        <select
          value={options.includes(port) ? port : options[0]}
          onChange={(e) => setPort(e.target.value)}
        >
          {options.map((p) => (
            <option key={p} value={p}>
              {portName(p)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Đến bước">
        <select
          value={draft.nodes.some((n) => n.id === target) ? target : ""}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="" disabled>
            Chọn bước tiếp theo
          </option>
          {draft.nodes
            .filter((n) => n.id !== source)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
        </select>
      </Field>
      <Button
        icon={Plus}
        onClick={() =>
          connect({
            source,
            target,
            sourceHandle: options.includes(port) ? port : options[0],
          })
        }
      >
        Thêm đường nối
      </Button>
      <h3>Các đường nối ({draft.transitions.length})</h3>
      <div className="transition-list">
        {draft.transitions.map((e) => (
          <button
            key={e.id}
            className={edge?.id === e.id ? "selected" : ""}
            onClick={() => select(e.id)}
          >
            <span>
              {name(e.source)} <ChevronRight size={10} /> {name(e.target)}
            </span>
            <small>{e.label || portName(e.sourceHandle)}</small>
          </button>
        ))}
      </div>
    </>
  );
}

function NextStepControl({ draft, source, onAdd }) {
  const openPorts = ports(source).filter(
    (p) =>
      !draft.transitions.some(
        (e) => e.source === source.id && e.sourceHandle === p,
      ),
  );
  const [type, setType] = useState("notify"),
    [selectedPort, setSelectedPort] = useState("");
  const branch = openPorts.includes(selectedPort) ? selectedPort : openPorts[0];
  return (
    <section className="next-step-control">
      <h3>Bước tiếp theo</h3>
      {openPorts.length ? (
        <>
          <p>Thêm một bước mới và tự nối với bước đang chọn.</p>
          {ports(source).length > 1 && (
            <FormField label="Thêm sau nhánh">
              <select
                value={branch}
                onChange={(e) => setSelectedPort(e.target.value)}
              >
                {openPorts.map((p) => (
                  <option key={p} value={p}>
                    {portName(p)}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Loại bước tiếp theo">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(definitions)
                .filter(([id]) => id !== "trigger")
                .map(([id, def]) => (
                  <option key={id} value={id}>
                    {def.title}
                  </option>
                ))}
            </select>
          </FormField>
          <Button icon={Plus} onClick={() => onAdd(type, source.id, branch)}>
            Thêm bước tiếp theo
          </Button>
        </>
      ) : (
        <p>
          Bước này đã nối với bước tiếp theo. Chọn đường nối trong mục Đường đi
          nếu muốn thay đổi.
        </p>
      )}
    </section>
  );
}
