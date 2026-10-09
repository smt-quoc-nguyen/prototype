import { Check, Clock3, Circle, AlertCircle, RotateCcw, X } from "lucide-react";
import {
  businessRunSteps,
  businessStepStatus,
  STATUS_LABELS,
} from "./maintenance-workflow.js";
import "./step-workflow.css";
export default function GraphRunDetails({ run, retry, busy }) {
  function stepLabel(step, status) {
    const result = run.outputs?.[step.id]?.result;
    const completed =
      step.type === "workorder" && step.waitForCompletion === false
        ? "Đã giao việc · quy trình tiếp tục"
        : "Hoàn tất";
    const waiting =
      step.type === "parallel"
        ? "Chờ tất cả nhánh và công việc trong nhóm hoàn tất"
        : step.type === "condition"
          ? step.mode === "wait" &&
            run.nodeStates?.[`${step.id}-status-wait`]?.status === "waiting"
            ? `Chờ trạng thái ${STATUS_LABELS[step.resource]?.[step.status] || step.status}`
            : step.mode === "wait"
              ? "Đang thực hiện các bước sau khi đạt trạng thái"
              : `Đang thực hiện nhánh ${result ? "Đúng" : "Không đúng"}`
          : step.type === "workorder"
            ? "Chờ Maintainer hoàn thành công việc và checklist"
            : step.type === "approval"
              ? "Chờ PMS phê duyệt"
              : "Đang chờ xử lý";
    return {
      completed,
      waiting,
      pending: "Chưa đến bước này",
      skipped: "Bỏ qua",
      stopped: "Đã dừng",
      rejected: "PMS đã từ chối yêu cầu",
      error: "Cần kiểm tra lỗi trước khi tiếp tục",
    }[status];
  }
  function renderSteps(steps) {
    return steps.map((step) => {
      const status = businessStepStatus(run, step);
      return (
        <div
          className={`workflow-run-step ${step.branches?.length ? "has-branches" : ""}`}
          key={step.id}
        >
          <div
            className={`workflow-business-step ${status}`}
            data-testid="run-business-step"
          >
            <span>
              {status === "completed" ? (
                <Check size={18} />
              ) : status === "waiting" ? (
                <Clock3 size={18} />
              ) : ["stopped", "skipped", "rejected"].includes(status) ? (
                <X size={18} />
              ) : (
                <Circle size={18} />
              )}
            </span>
            <div>
              <strong>{step.title}</strong>
              <small>{stepLabel(step, status)}</small>
            </div>
          </div>
          {step.branches?.length > 0 && (
            <div className="workflow-run-branches">
              {step.branches.map((branch) => (
                <section key={branch.id} className="workflow-run-branch">
                  <strong className="workflow-run-branch-title">
                    {branch.title}
                  </strong>
                  {branch.steps.length ? (
                    renderSteps(branch.steps)
                  ) : (
                    <p className="step-empty-branch">
                      Không có bước thực hiện.
                    </p>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      );
    });
  }
  return (
    <div className="graph-run-details">
      {run.error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{run.error}</span>
          <button className="btn" disabled={busy} onClick={retry}>
            <RotateCcw size={14} />
            Thử lại bước xử lý
          </button>
        </div>
      )}
      <div className="workflow-business-progress">
        {renderSteps(businessRunSteps(run))}
      </div>
    </div>
  );
}
