import GraphRunDetails from "./GraphRunDetails.jsx";
import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Save,
  Send,
  Wrench,
  Bell,
  ShieldCheck,
  ArrowDown,
  ArrowUp,
  Trash2,
  Check,
  Ticket,
  Play,
  X,
  CheckCircle2,
  ChevronDown,
  GitFork,
  GitBranch,
} from "lucide-react";
import {
  id,
  defaultWorkflow,
  initialState,
  reduceCommand,
  USERS,
  validateWorkflow,
} from "./engine.js";
import {
  TYPE_LABELS,
  ROLE_LABELS,
  NOTICE_PRESETS,
  newBusinessWorkflow,
  newBusinessStep,
  editableBusinessWorkflow,
  compileBusinessWorkflow,
  validateBusinessWorkflow,
  STATUS_LABELS,
  flattenBusinessSteps,
  transformBusinessSteps,
  availableWorkSources,
} from "./maintenance-workflow.js";
import "./step-workflow.css";
const copy = (value) => structuredClone(value);
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Btn({ children, icon: Icon, primary, ...props }) {
  return (
    <button className={`btn ${primary ? "primary" : ""}`} {...props}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}
function getEditable(source, templates) {
  if (!source) return null;
  const editable = editableBusinessWorkflow(
    source.draft || source,
    templates,
    defaultWorkflow(),
  );
  return editable
    ? {
        ...editable,
        baseVersion: source.version,
        baseDraftRevision: source.draft?.draftRevision || 0,
      }
    : null;
}
function stepPathMap(steps, prefix = "") {
  const labels = {};
  (steps || []).forEach((step, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    labels[step.id] = number;
    const branches =
      step.type === "parallel"
        ? step.branches.map((branch) => branch.steps)
        : step.type === "condition"
          ? [step.matchedSteps, step.unmatchedSteps]
          : [];
    branches.forEach((branch, branchIndex) =>
      Object.assign(
        labels,
        stepPathMap(branch, `${number}.${branchIndex + 1}`),
      ),
    );
  });
  return labels;
}
export default function StepWorkflowBuilder({ s, busy, save }) {
  const [selectedId, setSelectedId] = useState(s.workflows[0]?.id || null);
  const source = s.workflows.find((w) => w.id === selectedId);
  const [form, setForm] = useState(() => getEditable(source, s.templates));
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pendingSwitch, setPendingSwitch] = useState(null);
  const [sandbox, setSandbox] = useState(null),
    [sandboxError, setSandboxError] = useState("");
  const [expandedIds, setExpandedIds] = useState([]);
  const setExpanded = (value) =>
    setExpandedIds((previous) =>
      value === null
        ? []
        : previous.includes(value)
          ? previous
          : [...previous, value],
    );
  const toggleExpanded = (value) =>
    setExpandedIds((previous) =>
      previous.includes(value)
        ? previous.filter((id) => id !== value)
        : [...previous, value],
    );
  useEffect(() => {
    if (!source) return;
    setForm(getEditable(source, s.templates));
    setDirty(false);
    setError("");
    setNotice("");
    setExpanded(null);
    setSandbox(null);
  }, [selectedId]);
  useEffect(() => {
    if (!source) return;
    if (!dirty) setForm(getEditable(source, s.templates));
    else
      setNotice(
        "Quy trình đã được cập nhật. Bản bạn đang sửa được giữ lại; hãy tải bản mới trước khi lưu.",
      );
  }, [source?.version, source?.draft?.draftRevision]);
  const conflict =
    form &&
    s.workflows.find(
      (w) =>
        w.id !== form.id && w.published && w.triggerType === form.triggerType,
    );
  const edit = (patch) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setError("");
    setNotice("");
    setSandbox(null);
  };
  const changeStep = (stepId, patch) =>
    edit({
      business: {
        ...form.business,
        steps: transformBusinessSteps(form.business.steps, (steps) =>
          steps.map((step) =>
            step.id === stepId ? { ...step, ...patch } : step,
          ),
        ),
      },
    });
  const removeStep = (stepId) =>
    edit({
      business: {
        ...form.business,
        steps: transformBusinessSteps(form.business.steps, (steps) =>
          steps.filter((step) => step.id !== stepId),
        ),
      },
    });
  function switchTo(nextId) {
    if (dirty) {
      setPendingSwitch({ id: nextId });
      return;
    }
    if (nextId === selectedId) {
      setForm(getEditable(source, s.templates));
      setNotice("");
      setError("");
      setSandbox(null);
    }
    setSelectedId(nextId);
  }
  function createWorkflow() {
    if (dirty) {
      setPendingSwitch({ create: true });
      return;
    }
    const next = newBusinessWorkflow(s.templates, id("wf"), id("job"));
    const freeType = Object.keys(TYPE_LABELS).find(
      (type) => !s.workflows.some((w) => w.published && w.triggerType === type),
    );
    if (freeType) next.triggerType = freeType;
    setSelectedId(next.id);
    setForm(next);
    setDirty(true);
    setExpanded(next.business.steps[0].id);
    setError("");
    setNotice("");
    setSandbox(null);
  }
  const validMessage = useMemo(() => {
    if (!form) return "";
    try {
      validateBusinessWorkflow(form, s.templates);
      validateWorkflow(compileBusinessWorkflow(form), s.templates);
      return "";
    } catch (e) {
      return e.message;
    }
  }, [form, s.templates]);
  async function persist(published) {
    setError("");
    setNotice("");
    if (published && (validMessage || conflict)) {
      setError(
        validMessage ||
          `Loại ticket này đang dùng “${conflict.name}”. Hãy chọn quy trình đó để sửa, hoặc đổi loại ticket.`,
      );
      return;
    }
    if (!form.name.trim()) {
      setError("Nhập tên quy trình trước khi lưu.");
      return;
    }
    let next;
    try {
      next = compileBusinessWorkflow({ ...form, published });
    } catch (e) {
      setError(e.message);
      return;
    }
    next.expectedVersion = form.baseVersion ?? source?.version ?? 0;
    next.expectedDraftRevision = form.baseDraftRevision ?? 0;
    setDirty(false);
    const ok = await save(next);
    if (!ok) {
      setDirty(true);
      setNotice(
        "Chưa lưu được thay đổi. Bạn có thể tải bản đã lưu để tiếp tục.",
      );
      return;
    }
    setForm((previous) => ({
      ...previous,
      published,
      baseVersion:
        next.expectedVersion + (published || !source?.published ? 1 : 0),
      baseDraftRevision:
        published || !source?.published ? 0 : next.expectedDraftRevision + 1,
    }));
    setNotice(
      published
        ? "Đã xuất bản. Ticket mới sẽ dùng quy trình này; ticket đang xử lý giữ nguyên các bước cũ."
        : source?.published
          ? "Đã lưu bản nháp. Ticket mới tiếp tục dùng bản đang áp dụng."
          : "Đã lưu bản nháp. Xuất bản khi bạn sẵn sàng áp dụng cho ticket mới.",
    );
  }
  function addStep(type, groupId = null, branchKey = null) {
    const step = newBusinessStep(
      type,
      s.templates,
      id(type === "notify" ? "notice" : type === "workorder" ? "job" : type),
    );
    if (!groupId)
      edit({
        business: { ...form.business, steps: [...form.business.steps, step] },
      });
    else {
      const group = flattenBusinessSteps(form.business.steps).find(
        (item) => item.id === groupId,
      );
      if (group.type === "parallel")
        changeStep(groupId, {
          branches: group.branches.map((branch) =>
            branch.id === branchKey
              ? { ...branch, steps: [...branch.steps, step] }
              : branch,
          ),
        });
      else changeStep(groupId, { [branchKey]: [...group[branchKey], step] });
    }
    setExpanded(step.id);
  }
  function moveStep(stepId, delta) {
    edit({
      business: {
        ...form.business,
        steps: transformBusinessSteps(form.business.steps, (items) => {
          const index = items.findIndex((step) => step.id === stepId);
          if (index < 0 || index + delta < 0 || index + delta >= items.length)
            return items;
          const result = [...items];
          [result[index], result[index + delta]] = [
            result[index + delta],
            result[index],
          ];
          return result;
        }),
      },
    });
  }
  function startSandbox() {
    setSandboxError("");
    if (validMessage) {
      setError(validMessage);
      return;
    }
    const state = initialState();
    state.templates = copy(s.templates);
    state.workflows = [compileBusinessWorkflow({ ...form, published: true })];
    try {
      setSandbox(
        reduceCommand(state, {
          type: "CREATE_TICKET",
          role: "tenant",
          payload: {
            title: "Ticket chạy thử · " + form.name,
            type: form.triggerType,
            priority: "medium",
            location: "Phòng mẫu",
            area: "Khu vực mẫu",
          },
        }),
      );
    } catch (e) {
      setSandboxError(e.message);
    }
  }
  function sandboxCommand(type, payload, role = "pms") {
    try {
      setSandbox(reduceCommand(sandbox, { type, payload, role }));
      setSandboxError("");
    } catch (e) {
      setSandboxError(e.message);
    }
  }
  function completeSandboxWork(wo) {
    try {
      let next =
        wo.status === "in-progress"
          ? sandbox
          : reduceCommand(sandbox, {
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
      setSandbox(
        reduceCommand(next, {
          type: "WO_STATUS",
          role: "maintainer",
          payload: { workOrderId: wo.id, status: "completed" },
        }),
      );
      setSandboxError("");
    } catch (e) {
      setSandboxError(e.message);
    }
  }
  const stepCount = form ? flattenBusinessSteps(form.business.steps).length : 0;
  const stepPaths = form ? stepPathMap(form.business.steps) : {};
  function renderSteps(steps, prefix = "", depth = 0) {
    return steps.map((step, index) => {
      const open = expandedIds.includes(step.id);
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      const grouped = ["parallel", "condition"].includes(step.type);
      const kind = {
        workorder: "Công việc",
        notify: "Thông báo",
        parallel: "Làm song song",
        condition: "Điều kiện trạng thái",
      }[step.type];
      const sources =
        step.type === "condition"
          ? availableWorkSources(form.business.steps, step.id) || []
          : [];
      return (
        <article
          className={`step-card ${grouped ? "step-group" : ""} ${open ? "expanded" : ""}`}
          key={step.id}
          data-testid="workflow-step"
          data-step-id={step.id}
        >
          <div className="step-card-header">
            <span
              className={`step-marker ${step.type === "notify" ? "peach" : "blue"}`}
            >
              {step.type === "notify" ? (
                <Bell size={19} />
              ) : step.type === "parallel" ? (
                <GitFork size={19} />
              ) : step.type === "condition" ? (
                <GitBranch size={19} />
              ) : (
                <Wrench size={19} />
              )}
            </span>
            <button
              className="step-title-button"
              onClick={() => toggleExpanded(step.id)}
              aria-expanded={open}
            >
              <small>
                Bước {number} · {kind}
              </small>
              <strong>{step.title || "Chưa đặt tên"}</strong>
              <span>
                {step.type === "notify"
                  ? (step.recipients || [])
                      .map((role) => ROLE_LABELS[role]?.split(" · ")[0])
                      .join(", ") || "Chưa chọn người nhận"
                  : step.type === "parallel"
                    ? `${step.branches.length} nhánh chạy cùng lúc · Chờ tất cả nhánh`
                    : step.type === "condition"
                      ? `${step.mode === "wait" ? "Chờ đến khi" : "Kiểm tra ngay"}: ${STATUS_LABELS[step.resource]?.[step.status] || "Chưa chọn trạng thái"}`
                      : step.waitForCompletion === false
                        ? "Trần Hoàng Nam · Đi tiếp sau khi giao việc"
                        : "Trần Hoàng Nam · Chờ hoàn thành rồi đi tiếp"}
              </span>
              <span className="step-edit-label">
                {open ? "Thu gọn" : "Chỉnh bước"}
                <ChevronDown size={14} />
              </span>
            </button>
            <div className="step-tools">
              <button
                className="icon-btn"
                aria-label={`Đưa bước ${number} lên`}
                disabled={index === 0 || busy}
                onClick={() => moveStep(step.id, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-btn"
                aria-label={`Đưa bước ${number} xuống`}
                disabled={index === steps.length - 1 || busy}
                onClick={() => moveStep(step.id, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="icon-btn"
                aria-label={`Xóa bước ${number}`}
                disabled={busy}
                onClick={() => removeStep(step.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          {open && (
            <div className="step-card-form">
              {step.type === "workorder" ? (
                <>
                  <div className="step-fields">
                    <Field
                      label="Mẫu công việc"
                      hint="Chọn mẫu để điền nhanh, sau đó chỉnh checklist theo nhu cầu."
                    >
                      <select
                        value={step.templateId || ""}
                        onChange={(e) => {
                          const template = s.templates.find(
                            (t) => t.id === e.target.value,
                          );
                          changeStep(
                            step.id,
                            template
                              ? {
                                  templateId: template.id,
                                  title: template.name,
                                  checklist: [...template.checklist],
                                  responseTimeSLA: template.responseTimeSLA,
                                  processTimeSLA: template.processTimeSLA,
                                }
                              : { templateId: "" },
                          );
                        }}
                      >
                        <option value="">Tự tạo công việc</option>
                        {s.templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tên công việc">
                      <input
                        value={step.title}
                        onChange={(e) =>
                          changeStep(step.id, {
                            title: e.target.value,
                          })
                        }
                        maxLength={160}
                      />
                    </Field>
                  </div>
                  <Field
                    label="Người nhận việc"
                    hint="Prototype hiện có một kỹ thuật viên để kiểm tra luồng xử lý."
                  >
                    <select
                      value={step.assignee}
                      onChange={(e) =>
                        changeStep(step.id, {
                          assignee: e.target.value,
                        })
                      }
                    >
                      <option value={USERS.maintainer.id}>
                        Trần Hoàng Nam · Maintainer
                      </option>
                    </select>
                  </Field>
                  <Field label="Checklist (mỗi dòng một mục)">
                    <textarea
                      rows={4}
                      value={(step.checklist || []).join("\n")}
                      onChange={(e) =>
                        changeStep(step.id, {
                          checklist: e.target.value.split("\n"),
                        })
                      }
                    />
                  </Field>
                  <div className="step-fields">
                    <Field label="Thời hạn phản hồi (phút)">
                      <input
                        type="number"
                        min="1"
                        value={step.responseTimeSLA}
                        onChange={(e) =>
                          changeStep(step.id, {
                            responseTimeSLA:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Thời hạn hoàn thành (phút)">
                      <input
                        type="number"
                        min="1"
                        value={step.processTimeSLA}
                        onChange={(e) =>
                          changeStep(step.id, {
                            processTimeSLA:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Hướng dẫn cho kỹ thuật viên">
                    <textarea
                      rows={2}
                      value={step.note || ""}
                      onChange={(e) =>
                        changeStep(step.id, {
                          note: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <label className="step-check">
                    <input
                      type="checkbox"
                      checked={step.waitForCompletion !== false}
                      onChange={(event) =>
                        changeStep(step.id, {
                          waitForCompletion: event.target.checked,
                        })
                      }
                    />
                    Chờ hoàn thành trước khi tiếp tục
                  </label>
                  <p className="step-explanation">
                    <Check size={16} />
                    {step.waitForCompletion !== false
                      ? "Tự báo cho Tenant và người nhận việc. Hoàn tất công việc rồi chuyển sang bước tiếp theo."
                      : "Đi tiếp ngay sau khi giao việc. Bạn có thể thêm điều kiện chờ trạng thái ở bước sau; ticket vẫn chờ tất cả công việc hoàn tất."}
                  </p>
                </>
              ) : grouped ? (
                <>
                  <Field
                    label={
                      step.type === "parallel"
                        ? "Tên nhóm song song"
                        : "Tên bước điều kiện"
                    }
                  >
                    <input
                      value={step.title}
                      onChange={(event) =>
                        changeStep(step.id, { title: event.target.value })
                      }
                      maxLength={160}
                    />
                  </Field>
                  {step.type === "condition" && (
                    <>
                      <div className="step-fields">
                        <Field label="Cách kiểm tra">
                          <select
                            value={step.mode}
                            onChange={(event) => {
                              if (
                                event.target.value === "wait" &&
                                step.unmatchedSteps.length
                              ) {
                                setError(
                                  "Nhánh Không đúng đang có bước. Xóa hoặc chuyển các bước đó trước khi chọn chế độ chờ.",
                                );
                                return;
                              }
                              changeStep(step.id, { mode: event.target.value });
                            }}
                          >
                            <option value="check">
                              Kiểm tra ngay khi đến bước
                            </option>
                            <option value="wait">
                              Chờ đến khi đạt trạng thái
                            </option>
                          </select>
                        </Field>
                        <Field label="Kiểm tra trạng thái của">
                          <select
                            value={step.resource}
                            onChange={(event) => {
                              const resource = event.target.value;
                              changeStep(step.id, {
                                resource,
                                workStepId:
                                  resource === "workorder"
                                    ? sources[0]?.id || ""
                                    : "",
                                status:
                                  resource === "workorder"
                                    ? "completed"
                                    : "inprogress",
                              });
                            }}
                          >
                            <option value="ticket">Ticket đang xử lý</option>
                            <option value="workorder">
                              Công việc ở bước trước
                            </option>
                          </select>
                        </Field>
                      </div>
                      {step.resource === "workorder" && (
                        <Field
                          label="Công việc cần kiểm tra"
                          hint="Chỉ chọn công việc chắc chắn đã được tạo. Các việc ở nhánh khác hoặc nhánh có thể bị bỏ qua không có trong danh sách."
                        >
                          <select
                            value={step.workStepId || ""}
                            onChange={(event) =>
                              changeStep(step.id, {
                                workStepId: event.target.value,
                              })
                            }
                          >
                            <option value="">Chọn công việc</option>
                            {sources.map((source) => (
                              <option key={source.id} value={source.id}>
                                Bước {stepPaths[source.id]} · {source.title}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <Field label="Trạng thái cần đạt">
                        <select
                          value={step.status}
                          onChange={(event) =>
                            changeStep(step.id, { status: event.target.value })
                          }
                        >
                          {Object.entries(
                            STATUS_LABELS[step.resource] || {},
                          ).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <p className="step-explanation">
                        {step.mode === "wait"
                          ? "Nếu đã đúng trạng thái: làm ngay. Nếu chưa đúng: dừng tại đây và chờ thay đổi mới của đúng ticket hoặc công việc đã chọn."
                          : "Đọc trạng thái hiện tại khi đến bước này. Chỉ thực hiện một nhánh Đúng hoặc Không đúng; nhánh còn lại được bỏ qua."}{" "}
                        Ticket đã hủy sẽ dừng quy trình.
                      </p>
                      {step.mode === "wait" &&
                        step.resource === "workorder" &&
                        sources.find((source) => source.id === step.workStepId)
                          ?.completed &&
                        !["completed", "closed"].includes(step.status) && (
                          <p className="step-message warning">
                            Công việc nguồn đã chờ hoàn thành. Muốn chờ Cần
                            làm/Đang làm/Tạm dừng, hãy tắt “Chờ hoàn thành trước
                            khi tiếp tục” ở bước nguồn.
                          </p>
                        )}
                    </>
                  )}
                  <div className="step-branches">
                    {(step.type === "parallel"
                      ? step.branches.map((branch) => ({
                          ...branch,
                          key: branch.id,
                        }))
                      : [
                          {
                            id: `${step.id}-matched`,
                            key: "matchedSteps",
                            title:
                              step.mode === "wait"
                                ? "Khi đạt trạng thái"
                                : "Đúng",
                            steps: step.matchedSteps,
                          },
                          ...(step.mode === "check"
                            ? [
                                {
                                  id: `${step.id}-unmatched`,
                                  key: "unmatchedSteps",
                                  title: "Không đúng",
                                  steps: step.unmatchedSteps,
                                },
                              ]
                            : []),
                        ]
                    ).map((branch, branchIndex) => (
                      <section
                        className="step-branch"
                        data-testid="workflow-branch"
                        key={branch.id}
                        aria-label={branch.title}
                      >
                        <div className="step-branch-heading">
                          {step.type === "parallel" ? (
                            <Field label={`Tên nhánh ${branchIndex + 1}`}>
                              <input
                                value={branch.title}
                                onChange={(event) =>
                                  changeStep(step.id, {
                                    branches: step.branches.map((item) =>
                                      item.id === branch.id
                                        ? { ...item, title: event.target.value }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </Field>
                          ) : (
                            <strong>{branch.title}</strong>
                          )}
                          {step.type === "parallel" && (
                            <button
                              className="icon-btn"
                              aria-label={`Xóa nhánh ${branchIndex + 1}`}
                              disabled={step.branches.length <= 2 || busy}
                              onClick={() =>
                                changeStep(step.id, {
                                  branches: step.branches.filter(
                                    (item) => item.id !== branch.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                        {branch.steps.length ? (
                          renderSteps(
                            branch.steps,
                            `${number}.${branchIndex + 1}`,
                            depth + 1,
                          )
                        ) : (
                          <p className="step-empty-branch">
                            {step.type === "condition"
                              ? "Không có bước: đi tiếp và không gửi thêm thông báo."
                              : "Thêm ít nhất một bước cho nhánh này."}
                          </p>
                        )}
                        <div className="step-branch-add">
                          <Btn
                            icon={Wrench}
                            disabled={busy || stepCount >= 18}
                            onClick={() =>
                              addStep("workorder", step.id, branch.key)
                            }
                          >
                            Thêm công việc
                          </Btn>
                          <Btn
                            icon={Bell}
                            disabled={busy || stepCount >= 18}
                            onClick={() =>
                              addStep("notify", step.id, branch.key)
                            }
                          >
                            Thêm thông báo
                          </Btn>
                          {depth < 1 && (
                            <>
                              <Btn
                                icon={GitFork}
                                disabled={busy || stepCount > 15}
                                onClick={() =>
                                  addStep("parallel", step.id, branch.key)
                                }
                              >
                                Thêm nhóm song song
                              </Btn>
                              <Btn
                                icon={GitBranch}
                                disabled={busy || stepCount >= 18}
                                onClick={() =>
                                  addStep("condition", step.id, branch.key)
                                }
                              >
                                Thêm điều kiện
                              </Btn>
                            </>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                  {step.type === "parallel" && (
                    <>
                      <Btn
                        icon={Plus}
                        disabled={
                          busy || step.branches.length >= 6 || stepCount >= 18
                        }
                        onClick={() =>
                          changeStep(step.id, {
                            branches: [
                              ...step.branches,
                              {
                                id: id("branch"),
                                title: `Nhánh ${step.branches.length + 1}`,
                                steps: [],
                              },
                            ],
                          })
                        }
                      >
                        Thêm nhánh song song
                      </Btn>
                      <p className="step-explanation">
                        Các nhánh bắt đầu cùng lúc. Chờ mọi công việc trong nhóm
                        hoàn thành và các nhánh kết thúc trước khi đi tiếp.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Field label="Mẫu thông báo">
                    <select
                      value={step.preset || "custom"}
                      onChange={(e) => {
                        const preset = NOTICE_PRESETS[e.target.value];
                        changeStep(
                          step.id,
                          preset
                            ? {
                                preset: e.target.value,
                                title: preset.label,
                                subject: preset.subject,
                                message: preset.message,
                              }
                            : { preset: "custom" },
                        );
                      }}
                    >
                      {Object.entries(NOTICE_PRESETS).map(([key, preset]) => (
                        <option value={key} key={key}>
                          {preset.label}
                        </option>
                      ))}
                      <option value="custom">Tự viết nội dung</option>
                    </select>
                  </Field>
                  <fieldset className="step-recipients">
                    <legend>Người nhận thông báo</legend>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <label className="step-check" key={role}>
                        <input
                          type="checkbox"
                          checked={step.recipients?.includes(role) || false}
                          onChange={(e) =>
                            changeStep(step.id, {
                              recipients: e.target.checked
                                ? [...step.recipients, role]
                                : step.recipients.filter((r) => r !== role),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Tiêu đề thông báo">
                    <input
                      value={step.subject}
                      onChange={(e) =>
                        changeStep(step.id, {
                          subject: e.target.value,
                          title: e.target.value,
                          preset: "custom",
                        })
                      }
                      maxLength={160}
                    />
                  </Field>
                  <Field label="Nội dung thông báo">
                    <textarea
                      rows={3}
                      value={step.message}
                      onChange={(e) =>
                        changeStep(step.id, {
                          message: e.target.value,
                          preset: "custom",
                        })
                      }
                    />
                  </Field>
                  <p className="step-explanation">
                    Luôn gửi trong ứng dụng. Thông báo được gửi khi quy trình
                    đến bước này.
                  </p>
                  <label className="step-check">
                    <input
                      type="checkbox"
                      checked={step.channels?.includes("browser") || false}
                      onChange={(e) =>
                        changeStep(step.id, {
                          channels: e.target.checked
                            ? ["in-app", "browser"]
                            : ["in-app"],
                        })
                      }
                    />
                    Gửi thêm thông báo trình duyệt (khi đã cấp quyền)
                  </label>
                  <div className="step-notification-preview">
                    <small>
                      Xem trước ·{" "}
                      {(step.recipients || [])
                        .map((role) => ROLE_LABELS[role]?.split(" · ")[0])
                        .join(", ") || "Chưa chọn người nhận"}
                    </small>
                    <strong>{step.subject || "Chưa có tiêu đề"}</strong>
                    <p>{step.message || "Chưa có nội dung"}</p>
                  </div>
                </>
              )}
              <button
                className="text-button"
                onClick={() => toggleExpanded(step.id)}
              >
                Xong, thu gọn bước
              </button>
            </div>
          )}
        </article>
      );
    });
  }
  return (
    <div className="step-workflow" data-testid="step-workflow-builder">
      <div className="step-builder-heading">
        <div>
          <span className="overline">TICKET → CÔNG VIỆC → THÔNG BÁO</span>
          <h2>Quy trình xử lý ticket</h2>
          <p>
            Sắp xếp các bước theo cách đội ngũ của bạn làm việc. Hệ thống tự
            giao việc, chờ hoàn thành và cập nhật ticket.
          </p>
        </div>
        <Btn icon={Plus} onClick={createWorkflow} disabled={busy}>
          Tạo quy trình
        </Btn>
      </div>
      {pendingSwitch && (
        <div className="step-message warning" role="alert">
          <span>
            Bạn có thay đổi chưa lưu. Lưu bản nháp trước khi chuyển, hoặc bỏ các
            thay đổi này.
          </span>
          <Btn onClick={() => setPendingSwitch(null)}>Tiếp tục sửa</Btn>
          <Btn
            onClick={() => {
              const pending = pendingSwitch;
              setPendingSwitch(null);
              setDirty(false);
              if (pending.create) {
                const next = newBusinessWorkflow(
                  s.templates,
                  id("wf"),
                  id("job"),
                );
                setSelectedId(next.id);
                setForm(next);
                setDirty(true);
              } else {
                if (pending.id === selectedId) {
                  setForm(getEditable(source, s.templates));
                  setNotice("");
                  setError("");
                  setSandbox(null);
                }
                setSelectedId(pending.id);
              }
            }}
          >
            Bỏ thay đổi và chuyển
          </Btn>
        </div>
      )}
      <div className="step-builder-layout">
        <aside className="step-workflow-list" aria-label="Danh sách quy trình">
          <h3>Quy trình của bạn</h3>
          {s.workflows.map((w) => (
            <button
              key={w.id}
              onClick={() => switchTo(w.id)}
              className={`step-workflow-choice ${selectedId === w.id ? "selected" : ""}`}
            >
              <strong>{w.name}</strong>
              <small>{TYPE_LABELS[w.triggerType]}</small>
              <span className={`step-state ${w.published ? "live" : ""}`}>
                {w.published ? `Đang áp dụng · v${w.version}` : "Bản nháp"}
                {w.draft ? " · Có bản nháp" : ""}
              </span>
            </button>
          ))}
          {form && !source && (
            <div className="step-workflow-choice selected">
              <strong>{form.name}</strong>
              <span className="step-state">Chưa lưu</span>
            </div>
          )}
          <div className="step-role-guide">
            <strong>Ai làm gì?</strong>
            <p>
              <b>Tenant</b> gửi ticket và nhận cập nhật.
            </p>
            <p>
              <b>PMS</b> duyệt và theo dõi xử lý.
            </p>
            <p>
              <b>Maintainer</b> thực hiện công việc và checklist.
            </p>
          </div>
        </aside>
        <div className="step-editor">
          {!form ? (
            <section className="card step-legacy-card">
              <h3>Quy trình cũ được giữ nguyên</h3>
              <p>
                Quy trình này có nhánh hoặc cấu hình nâng cao, chưa thể chuyển
                thành danh sách bước. Bản đang áp dụng và ticket đang xử lý tiếp
                tục hoạt động.
              </p>
              <p>
                Tạo quy trình mới cho loại ticket chưa có quy trình. Cần giữ cấu
                hình cũ khi chuyển đổi loại đang áp dụng.
              </p>
              <Btn icon={Plus} onClick={createWorkflow}>
                Tạo quy trình mới
              </Btn>
              {source && (
                <ol className="legacy-step-list">
                  {source.nodes.map((n) => (
                    <li key={n.id}>{n.title}</li>
                  ))}
                </ol>
              )}
            </section>
          ) : (
            <>
              <section className="card step-settings">
                <div className="section-heading">
                  <h3>Thiết lập chung</h3>
                  <span
                    className={`step-state ${source?.published ? "live" : ""}`}
                  >
                    {dirty
                      ? "Có thay đổi chưa lưu"
                      : source?.draft
                        ? "Đang sửa bản nháp"
                        : source?.published
                          ? `Đang áp dụng · v${source.version}`
                          : "Bản nháp"}
                  </span>
                </div>
                <div className="step-fields">
                  <Field label="Tên quy trình">
                    <input
                      value={form.name}
                      maxLength={120}
                      onChange={(e) => edit({ name: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Loại ticket áp dụng"
                    hint="Mỗi loại ticket dùng một quy trình đã xuất bản."
                  >
                    <select
                      value={form.triggerType}
                      onChange={(e) => edit({ triggerType: e.target.value })}
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {source?.published && (
                  <p className="step-live-note">
                    <CheckCircle2 size={16} />
                    Bản v{source.version} đang xử lý ticket mới. Bản nháp chỉ áp
                    dụng sau khi xuất bản.
                  </p>
                )}
                {source && !source.business && (
                  <p className="step-message">
                    Quy trình mẫu vẫn giữ cách gửi thông báo trước đây. Các
                    thông báo tự động mô tả bên dưới sẽ áp dụng sau khi bạn xuất
                    bản quy trình bằng giao diện mới.
                  </p>
                )}
                {conflict && (
                  <p className="step-message warning">
                    Loại này đang dùng “{conflict.name}”. Chọn quy trình đó để
                    sửa hoặc đổi loại ticket.
                  </p>
                )}
              </section>
              <div className="step-sequence">
                <section className="step-fixed">
                  <span className="step-marker">
                    <Ticket size={20} />
                  </span>
                  <div>
                    <span className="overline">BẮT ĐẦU</span>
                    <h3>Tenant gửi ticket</h3>
                    <p>
                      Áp dụng cho {TYPE_LABELS[form.triggerType]?.toLowerCase()}
                      . Tenant và PMS nhận thông báo đã tiếp nhận.
                    </p>
                  </div>
                </section>
                <section
                  className={`step-fixed step-approval ${form.business.approval ? "" : "optional"}`}
                >
                  <span className="step-marker amber">
                    <ShieldCheck size={20} />
                  </span>
                  <div>
                    <label className="step-check">
                      <input
                        type="checkbox"
                        checked={form.business.approval}
                        onChange={(e) =>
                          edit({
                            business: {
                              ...form.business,
                              approval: e.target.checked,
                            },
                          })
                        }
                      />
                      PMS duyệt trước khi giao việc
                    </label>
                    <p>
                      {form.business.approval
                        ? "Được duyệt: tiếp tục các bước bên dưới. Từ chối: hủy ticket và báo lý do cho Tenant."
                        : "Ticket được giao xử lý ngay, không chờ PMS phê duyệt."}
                    </p>
                  </div>
                </section>
                {renderSteps(form.business.steps)}
                <div className="step-add">
                  <Btn
                    icon={Wrench}
                    onClick={() => addStep("workorder")}
                    disabled={busy || stepCount >= 18}
                  >
                    Thêm công việc
                  </Btn>
                  <Btn
                    icon={Bell}
                    onClick={() => addStep("notify")}
                    disabled={busy || stepCount >= 18}
                  >
                    Thêm thông báo
                  </Btn>
                  <Btn
                    icon={GitFork}
                    onClick={() => addStep("parallel")}
                    disabled={busy || stepCount > 15}
                  >
                    Thêm nhóm song song
                  </Btn>
                  <Btn
                    icon={GitBranch}
                    onClick={() => addStep("condition")}
                    disabled={busy || stepCount >= 18}
                  >
                    Thêm điều kiện
                  </Btn>
                  <small>
                    Các bước chạy từ trên xuống. Dùng mũi tên để đổi thứ tự.
                  </small>
                </div>
                <section className="step-fixed step-finish">
                  <span className="step-marker green">
                    <CheckCircle2 size={20} />
                  </span>
                  <div>
                    <span className="overline">KẾT THÚC</span>
                    <h3>Hoàn tất ticket</h3>
                    <p>
                      Chờ tất cả công việc liên quan hoàn tất, cập nhật ticket
                      và gửi kết quả cho Tenant, PMS.
                    </p>
                  </div>
                </section>
              </div>
              {(error || notice) && (
                <div
                  className={`step-message ${error ? "error" : ""}`}
                  role={error ? "alert" : "status"}
                >
                  {error || notice}
                  {notice && source && dirty && (
                    <Btn
                      onClick={() => {
                        setForm(getEditable(source, s.templates));
                        setDirty(false);
                        setNotice("Đã tải bản đã lưu.");
                      }}
                    >
                      Tải bản đã lưu
                    </Btn>
                  )}
                </div>
              )}
              <div className="step-save-bar">
                <div>
                  <strong>
                    {validMessage
                      ? "Cần bổ sung trước khi xuất bản"
                      : "Các bước đã sẵn sàng"}
                  </strong>
                  <small>
                    {validMessage ||
                      "Ticket đang xử lý giữ nguyên quy trình của lần tạo."}
                  </small>
                </div>
                <div className="step-save-actions">
                  <Btn icon={Play} disabled={busy} onClick={startSandbox}>
                    Chạy thử quy trình
                  </Btn>
                  <Btn
                    icon={Save}
                    disabled={busy}
                    onClick={() => persist(false)}
                  >
                    Lưu bản nháp
                  </Btn>
                  <Btn
                    icon={Send}
                    primary
                    disabled={busy}
                    onClick={() => persist(true)}
                  >
                    Xuất bản quy trình
                  </Btn>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {sandbox && (
        <section className="card step-sandbox" data-testid="workflow-sandbox">
          <div className="section-heading">
            <div>
              <span className="overline">BẢN CHẠY THỬ RIÊNG</span>
              <h3>Chạy thử từ Tenant đến Maintainer</h3>
              <p>
                Không tạo ticket, công việc hoặc thông báo trong dữ liệu thật.
              </p>
            </div>
            <button
              className="icon-btn"
              aria-label="Đóng chạy thử"
              onClick={() => setSandbox(null)}
            >
              <X size={18} />
            </button>
          </div>
          {sandboxError && (
            <p className="error-banner" role="alert">
              {sandboxError}
            </p>
          )}
          <div className="step-sandbox-grid">
            <div>
              <GraphRunDetails
                run={sandbox.runs[0]}
                busy={false}
                retry={() =>
                  sandboxCommand("RETRY_RUN", { runId: sandbox.runs[0].id })
                }
              />
            </div>
            <div className="sandbox-actions">
              <strong>
                Ticket:{" "}
                {
                  {
                    submitted:
                      sandbox.runs[0].status === "waiting-approval"
                        ? "Chờ duyệt"
                        : "Đã tiếp nhận",
                    approved: "Đã duyệt",
                    inprogress: "Đang xử lý",
                    resolved: "Hoàn tất",
                    cancelled: "Đã hủy",
                  }[sandbox.tickets[0].status]
                }
              </strong>
              {sandbox.runs[0].status === "waiting-approval" && (
                <>
                  <p>PMS kiểm tra yêu cầu trước khi giao việc.</p>
                  <Btn
                    primary
                    onClick={() =>
                      sandboxCommand("APPROVE", { runId: sandbox.runs[0].id })
                    }
                  >
                    PMS: Duyệt yêu cầu
                  </Btn>
                  <Btn
                    onClick={() =>
                      sandboxCommand("REJECT", {
                        runId: sandbox.runs[0].id,
                        reason: "Từ chối trong bản chạy thử",
                      })
                    }
                  >
                    PMS: Từ chối yêu cầu
                  </Btn>
                </>
              )}
              {sandbox.workOrders
                .filter(
                  (wo) =>
                    wo.status !== "closed" &&
                    (wo.status !== "completed" ||
                      flattenBusinessSteps(
                        sandbox.runs[0].workflow.business.steps,
                      ).some(
                        (step) =>
                          step.type === "condition" &&
                          step.mode === "wait" &&
                          step.resource === "workorder" &&
                          step.status === "closed" &&
                          sandbox.runs[0].outputs?.[step.workStepId]
                            ?.workOrderId === wo.id &&
                          sandbox.runs[0].nodeStates?.[`${step.id}-status-wait`]
                            ?.status === "waiting",
                      )),
                )
                .map((wo) => (
                  <div
                    className="sandbox-work"
                    key={wo.id}
                    data-testid="sandbox-work-order"
                  >
                    <h4>{wo.title}</h4>
                    <ul>
                      {wo.checklist.map((item, index) => (
                        <li key={index}>{item.text}</li>
                      ))}
                    </ul>
                    <p>Trạng thái: {STATUS_LABELS.workorder[wo.status]}</p>
                    <div className="sandbox-work-actions">
                      {wo.status === "todo" && (
                        <Btn
                          onClick={() =>
                            sandboxCommand(
                              "WO_STATUS",
                              { workOrderId: wo.id, status: "in-progress" },
                              "maintainer",
                            )
                          }
                        >
                          Maintainer: Bắt đầu công việc
                        </Btn>
                      )}
                      {wo.status === "in-progress" && (
                        <Btn
                          onClick={() =>
                            sandboxCommand(
                              "WO_STATUS",
                              { workOrderId: wo.id, status: "pause" },
                              "maintainer",
                            )
                          }
                        >
                          Maintainer: Tạm dừng công việc
                        </Btn>
                      )}
                      {wo.status === "pause" && (
                        <Btn
                          onClick={() =>
                            sandboxCommand(
                              "WO_STATUS",
                              { workOrderId: wo.id, status: "in-progress" },
                              "maintainer",
                            )
                          }
                        >
                          Maintainer: Tiếp tục công việc
                        </Btn>
                      )}
                      {wo.status === "completed" ? (
                        <Btn
                          onClick={() =>
                            sandboxCommand(
                              "WO_STATUS",
                              { workOrderId: wo.id, status: "closed" },
                              "maintainer",
                            )
                          }
                        >
                          Maintainer: Đóng công việc
                        </Btn>
                      ) : (
                        <Btn primary onClick={() => completeSandboxWork(wo)}>
                          Maintainer: Hoàn thành công việc
                        </Btn>
                      )}
                    </div>
                  </div>
                ))}
              {sandbox.runs[0].status === "completed" && (
                <p className="step-message">
                  Quy trình hoàn tất. Tenant và PMS đã nhận kết quả.
                </p>
              )}
              <div className="sandbox-notices">
                <strong>
                  Thông báo được gửi ({sandbox.notifications.length})
                </strong>
                {sandbox.notifications.map((n) => (
                  <p key={n.id}>
                    <b>{ROLE_LABELS[n.role]?.split(" · ")[0]}</b> · {n.title}
                    {n.body && (
                      <>
                        <br />
                        {n.body}
                      </>
                    )}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
