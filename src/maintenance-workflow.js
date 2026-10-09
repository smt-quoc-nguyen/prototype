import { toGraph, literal, reference, TRIGGER_ID } from "./graph.js";

export const TYPE_LABELS = {
  "Equipment malfunction": "Sự cố thiết bị",
  Plumbing: "Hệ thống nước",
  Electrical: "Hệ thống điện",
  "General request": "Yêu cầu khác",
};
export const ROLE_LABELS = {
  tenant: "Tenant · Người gửi ticket",
  maintainer: "Maintainer · Người nhận việc",
  pms: "PMS · Quản lý",
};
const USER_IDS = { tenant: "tenant-01", maintainer: "tech-01", pms: "pms-01" };
export const NOTICE_PRESETS = {
  progress: {
    label: "Cập nhật tiến độ",
    subject: "Cập nhật yêu cầu của bạn",
    message:
      "Bước xử lý trước đã hoàn tất. Chúng tôi đang tiếp tục xử lý yêu cầu.",
  },
  appointment: {
    label: "Hẹn kiểm tra",
    subject: "Hẹn kiểm tra và xử lý",
    message:
      "Kỹ thuật viên sẽ liên hệ với bạn để sắp xếp thời gian kiểm tra và xử lý.",
  },
  handover: {
    label: "Hướng dẫn bàn giao",
    subject: "Hướng dẫn sau khi xử lý",
    message:
      "Công việc đã được xử lý. Vui lòng kiểm tra kết quả và liên hệ quản lý nếu cần hỗ trợ thêm.",
  },
};
export function newBusinessStep(type, templates, stepId) {
  if (type === "parallel")
    return {
      id: stepId,
      type,
      title: "Làm song song",
      branches: [1, 2].map((index) => ({
        id: `${stepId}-branch-${index}`,
        title: `Nhánh ${index}`,
        steps: [
          newBusinessStep("workorder", templates, `${stepId}-job-${index}`),
        ],
      })),
    };
  if (type === "condition")
    return {
      id: stepId,
      type,
      title: "Kiểm tra trạng thái",
      resource: "ticket",
      workStepId: "",
      status: "inprogress",
      mode: "check",
      matchedSteps: [],
      unmatchedSteps: [],
    };
  if (type === "notify")
    return {
      id: stepId,
      type,
      title: "Cập nhật tiến độ",
      recipients: ["tenant"],
      channels: ["in-app"],
      ...NOTICE_PRESETS.progress,
      preset: "progress",
    };
  const template = templates[0];
  return {
    id: stepId,
    type: "workorder",
    title: template?.name || "Xử lý yêu cầu",
    templateId: template?.id || "",
    assignee: USER_IDS.maintainer,
    checklist: [
      ...(template?.checklist || [
        "Kiểm tra và ghi nhận nguyên nhân",
        "Xử lý và bàn giao kết quả",
      ]),
    ],
    responseTimeSLA: template?.responseTimeSLA || 60,
    processTimeSLA: template?.processTimeSLA || 240,
    note: "",
    waitForCompletion: true,
  };
}
export function newBusinessWorkflow(templates, workflowId, stepId) {
  return {
    id: workflowId,
    name: "Quy trình xử lý yêu cầu",
    triggerType: "General request",
    version: 0,
    published: false,
    business: {
      version: 1,
      approval: true,
      steps: [newBusinessStep("workorder", templates, stepId)],
    },
  };
}
export const STATUS_LABELS = {
  ticket: {
    submitted: "Đã gửi",
    approved: "Đã duyệt",
    inprogress: "Đang xử lý",
  },
  workorder: {
    todo: "Cần làm",
    "in-progress": "Đang làm",
    pause: "Tạm dừng",
    completed: "Hoàn thành",
    closed: "Đã đóng",
  },
};
export function flattenBusinessSteps(steps) {
  return (steps || []).flatMap((step) => [
    step,
    ...(step.type === "parallel"
      ? step.branches.flatMap((branch) => flattenBusinessSteps(branch.steps))
      : step.type === "condition"
        ? [
            ...flattenBusinessSteps(step.matchedSteps),
            ...flattenBusinessSteps(step.unmatchedSteps),
          ]
        : []),
  ]);
}
export function transformBusinessSteps(steps, updater) {
  return updater(
    (steps || []).map((step) =>
      step.type === "parallel"
        ? {
            ...step,
            branches: step.branches.map((branch) => ({
              ...branch,
              steps: transformBusinessSteps(branch.steps, updater),
            })),
          }
        : step.type === "condition"
          ? {
              ...step,
              matchedSteps: transformBusinessSteps(step.matchedSteps, updater),
              unmatchedSteps: transformBusinessSteps(
                step.unmatchedSteps,
                updater,
              ),
            }
          : step,
    ),
  );
}
// Return only jobs that are guaranteed to have been created when this step is reached.
export function availableWorkSources(steps, targetId, inherited = []) {
  let available = [...inherited];
  for (const step of steps || []) {
    if (step.id === targetId) return available;
    if (step.type === "parallel") {
      for (const branch of step.branches) {
        const found = availableWorkSources(branch.steps, targetId, available);
        if (found) return found;
      }
      for (const branch of step.branches)
        available.push(
          ...guaranteedWorkSources(branch.steps).map((source) => ({
            ...source,
            completed: true,
          })),
        );
    } else if (step.type === "condition") {
      for (const branch of [step.matchedSteps, step.unmatchedSteps]) {
        const found = availableWorkSources(branch, targetId, available);
        if (found) return found;
      }
    } else if (step.type === "workorder")
      available.push({
        id: step.id,
        title: step.title,
        completed: step.waitForCompletion !== false,
      });
  }
  return null;
}
function guaranteedWorkSources(steps) {
  return (steps || []).flatMap((step) =>
    step.type === "workorder"
      ? [
          {
            id: step.id,
            title: step.title,
            completed: step.waitForCompletion !== false,
          },
        ]
      : step.type === "parallel"
        ? step.branches
            .flatMap((branch) => guaranteedWorkSources(branch.steps))
            .map((source) => ({ ...source, completed: true }))
        : [],
  );
}
export function validateBusinessWorkflow(workflow, templates) {
  const business = workflow.business;
  if (!workflow.name?.trim()) throw Error("Nhập tên quy trình.");
  if (!TYPE_LABELS[workflow.triggerType])
    throw Error("Chọn loại ticket áp dụng.");
  if (
    business?.version !== 1 ||
    typeof business.approval !== "boolean" ||
    !Array.isArray(business.steps)
  )
    throw Error("Cấu hình quy trình không hợp lệ.");
  const all = flattenBusinessSteps(business.steps);
  if (!all.some((step) => step.type === "workorder"))
    throw Error("Thêm ít nhất một công việc trước khi hoàn tất ticket.");
  if (all.length > 18)
    throw Error("Một quy trình tối đa 18 bước, tính cả các bước trong nhóm.");
  const ids = all.flatMap((step) => [
    step.id,
    ...(step.type === "parallel"
      ? step.branches.map((branch) => branch.id)
      : []),
  ]);
  if (
    new Set(ids).size !== ids.length ||
    ids.some(
      (value) =>
        !value || !/^[\w-]+$/.test(value) || value.startsWith("system-"),
    )
  )
    throw Error(
      "Mã bước hoặc nhánh không hợp lệ, trùng nhau hoặc dùng tên hệ thống.",
    );
  function validateSequence(steps, depth = 0) {
    for (const step of steps) {
      const prefix = `Bước “${step.title || "chưa đặt tên"}”: `;
      if (!step.title?.trim()) throw Error(prefix + "nhập tên bước.");
      if (["parallel", "condition"].includes(step.type) && depth >= 2)
        throw Error(prefix + "chỉ lồng tối đa hai tầng nhóm để dễ theo dõi.");
      if (step.type === "workorder") {
        if (step.assignee !== USER_IDS.maintainer)
          throw Error(prefix + "chọn kỹ thuật viên nhận việc.");
        if (step.templateId && !templates.some((t) => t.id === step.templateId))
          throw Error(prefix + "mẫu công việc không còn tồn tại.");
        if (
          !Array.isArray(step.checklist) ||
          !step.checklist.length ||
          !step.checklist.every(
            (text) => typeof text === "string" && text.trim(),
          )
        )
          throw Error(
            prefix +
              "nhập ít nhất một mục checklist; mỗi dòng cần có nội dung.",
          );
        if (
          ![step.responseTimeSLA, step.processTimeSLA].every(
            (value) => Number.isFinite(value) && value > 0,
          )
        )
          throw Error(prefix + "thời hạn phải lớn hơn 0 phút.");
        if (
          step.waitForCompletion !== undefined &&
          typeof step.waitForCompletion !== "boolean"
        )
          throw Error(prefix + "chọn cách chuyển sang bước tiếp theo.");
      } else if (step.type === "notify") {
        if (
          !step.recipients?.length ||
          new Set(step.recipients).size !== step.recipients.length ||
          step.recipients.some((role) => !ROLE_LABELS[role])
        )
          throw Error(prefix + "chọn ít nhất một người nhận hợp lệ.");
        if (!step.subject?.trim() || !step.message?.trim())
          throw Error(prefix + "nhập tiêu đề và nội dung thông báo.");
        if (
          !step.channels?.includes("in-app") ||
          step.channels.some((c) => !["in-app", "browser"].includes(c))
        )
          throw Error(prefix + "thông báo trong ứng dụng là bắt buộc.");
      } else if (step.type === "parallel") {
        if (
          !Array.isArray(step.branches) ||
          step.branches.length < 2 ||
          step.branches.length > 6
        )
          throw Error(prefix + "nhóm song song cần từ 2 đến 6 nhánh.");
        for (const branch of step.branches) {
          if (
            !branch.title?.trim() ||
            !Array.isArray(branch.steps) ||
            !branch.steps.length
          )
            throw Error(prefix + "mỗi nhánh cần có tên và ít nhất một bước.");
          validateSequence(branch.steps, depth + 1);
        }
      } else if (step.type === "condition") {
        if (
          !["check", "wait"].includes(step.mode) ||
          !STATUS_LABELS[step.resource]?.[step.status]
        )
          throw Error(
            prefix + "chọn cách kiểm tra, nguồn và trạng thái hợp lệ.",
          );
        if (
          !Array.isArray(step.matchedSteps) ||
          !Array.isArray(step.unmatchedSteps)
        )
          throw Error(prefix + "cấu hình nhánh không hợp lệ.");
        if (step.mode === "wait" && step.unmatchedSteps.length)
          throw Error(
            prefix +
              "chế độ chờ không dùng nhánh Không đúng; chuyển sang kiểm tra ngay để giữ nhánh này.",
          );
        if (step.mode === "wait" && step.resource === "ticket") {
          const priorWork = availableWorkSources(business.steps, step.id) || [];
          if (step.status === "approved" && !business.approval)
            throw Error(
              prefix +
                "quy trình không có bước PMS duyệt nên ticket không thể đạt trạng thái Đã duyệt.",
            );
          if (step.status === "submitted" && business.approval)
            throw Error(
              prefix +
                "PMS đã duyệt trước khi đến bước này; ticket không quay lại trạng thái Đã gửi.",
            );
          if (
            priorWork.some((source) => source.completed) &&
            ["submitted", "approved"].includes(step.status)
          )
            throw Error(
              prefix +
                "ticket đã xử lý công việc và không thể quay lại Đã gửi hoặc Đã duyệt.",
            );
        }
        if (step.resource === "workorder") {
          const source = availableWorkSources(business.steps, step.id)?.find(
            (item) => item.id === step.workStepId,
          );
          if (!source)
            throw Error(
              prefix +
                "chọn công việc chắc chắn được tạo ở bước trước; không dùng công việc ở nhánh khác hoặc nhánh có thể bị bỏ qua.",
            );
          if (
            step.mode === "wait" &&
            source.completed &&
            !["completed", "closed"].includes(step.status)
          )
            throw Error(
              prefix +
                "công việc nguồn đã chờ hoàn thành. Hãy chọn trạng thái Hoàn thành/Đã đóng hoặc tắt chờ hoàn thành ở bước nguồn.",
            );
        }
        validateSequence(step.matchedSteps, depth + 1);
        validateSequence(step.unmatchedSteps, depth + 1);
      } else throw Error(prefix + "loại bước không hợp lệ.");
    }
  }
  validateSequence(business.steps);
  if (compileBusinessWorkflow(workflow).nodes.length > 80)
    throw Error(
      "Quy trình có quá nhiều bước và nhánh. Hãy giảm bớt nhóm hoặc công việc trước khi xuất bản.",
    );
}
function notice(nodeId, title, message, roles, source, channels = ["in-app"]) {
  return {
    id: nodeId,
    type: "notify",
    title,
    notificationKind: "info",
    channels,
    inputs: {
      recipients: {
        kind: "list",
        items: roles.map((role) =>
          role === "tenant"
            ? reference("trigger", "customer")
            : literal(USER_IDS[role]),
        ),
      },
      subject: literal(title),
      message: literal(message),
      contextResource: literal(source ? "workorder" : "ticket"),
      contextId: source
        ? reference("node", "workOrderId", source)
        : reference("trigger", "id"),
    },
  };
}
// The UI owns business steps. Graph operations are an internal execution format.
export function compileBusinessWorkflow(workflow) {
  const business = structuredClone(workflow.business),
    nodes = [],
    edges = [];
  const add = (node, owner) => {
    nodes.push({
      ...node,
      businessStepId: owner || node.id,
      position: {
        x: 60 + (nodes.length % 4) * 260,
        y: 60 + Math.floor(nodes.length / 4) * 180,
      },
    });
    return node.id;
  };
  const connect = (source, target, port = "success") =>
    edges.push({
      id: `edge-${source}-${port}-${target}`,
      source,
      target,
      sourceHandle: port,
    });
  const append = (node, previous, owner, port = "success") => {
    add(node, owner);
    connect(previous, node.id, port);
    return node.id;
  };
  function waitJob(step, previous, suffix = "wait") {
    return append(
      {
        id: `${step.id}-${suffix}`,
        type: "automation",
        action: "wait-event",
        title: `Chờ hoàn thành: ${step.title}`,
        filters: [
          { id: "resource", path: "resource", operator: "equals" },
          { id: "id", path: "recordId", operator: "equals" },
          { id: "status", path: "record.status", operator: "one-of" },
        ],
        outputPaths: ["resource", "recordId", "record.status"],
        inputs: {
          eventName: literal("record.updated"),
          filter_resource: literal("workorder"),
          filter_id: reference("node", "workOrderId", step.id),
          filter_status: literal(["completed", "closed"]),
        },
      },
      previous,
      step.id,
    );
  }
  function sequence(
    steps,
    previous,
    available = [],
    finalize = false,
    firstPort = "success",
  ) {
    let tail = previous,
      port = firstPort,
      safe = [...available],
      outstanding = [];
    const push = (node, owner) => {
      tail = append(node, tail, owner, port);
      port = "success";
    };
    for (const step of steps || []) {
      if (step.type === "workorder") {
        push(
          {
            id: step.id,
            type: "workorder",
            title: step.title,
            templateId: step.templateId || null,
            assignee: step.assignee,
            checklist: [...(step.checklist || [])],
            responseTimeSLA: step.responseTimeSLA,
            processTimeSLA: step.processTimeSLA,
            inputs: {
              title: literal(step.title),
              priority: reference("trigger", "priority"),
              ticketId: reference("trigger", "id"),
              note: literal(step.note || ""),
            },
          },
          step.id,
        );
        push(
          notice(
            `${step.id}-assigned-tenant`,
            "Đã giao công việc",
            `Công việc “${step.title}” đã được giao cho kỹ thuật viên.`,
            ["tenant"],
          ),
          step.id,
        );
        push(
          notice(
            `${step.id}-assigned-maintainer`,
            "Bạn có công việc mới",
            `Vui lòng thực hiện công việc “${step.title}” và hoàn tất checklist.`,
            ["maintainer"],
            step.id,
          ),
          step.id,
        );
        if (step.waitForCompletion !== false) tail = waitJob(step, tail);
        else outstanding.push(step);
        safe.push(step);
      } else if (step.type === "notify") {
        const last = safe.at(-1);
        for (const role of step.recipients || [])
          push(
            notice(
              `${step.id}-${role}`,
              step.subject,
              step.message,
              [role],
              role === "maintainer" ? last?.id : null,
              step.channels,
            ),
            step.id,
          );
      } else if (step.type === "parallel") {
        push(
          {
            id: step.id,
            type: "parallel",
            mode: "split",
            title: step.title,
            branches: step.branches.map((_, index) => `branch-${index + 1}`),
          },
          step.id,
        );
        const tails = step.branches.map((branch, index) =>
          sequence(branch.steps, step.id, safe, true, `branch-${index + 1}`),
        );
        add(
          {
            id: `${step.id}-join`,
            type: "parallel",
            mode: "join",
            title: `Chờ tất cả nhánh: ${step.title}`,
          },
          step.id,
        );
        tails.forEach((branchTail) => connect(branchTail, `${step.id}-join`));
        tail = `${step.id}-join`;
        safe.push(
          ...step.branches.flatMap((branch) =>
            guaranteedWorkSources(branch.steps),
          ),
        );
      } else if (step.type === "condition") {
        const recordId =
          step.resource === "workorder"
            ? reference("node", "workOrderId", step.workStepId)
            : reference("trigger", "id");
        push(
          {
            id: `${step.id}-read`,
            type: "automation",
            action: "read-record",
            title: `Lấy trạng thái hiện tại: ${step.title}`,
            outputPaths: ["status"],
            inputs: { resource: literal(step.resource), recordId },
          },
          step.id,
        );
        push(
          {
            id: step.id,
            type: "condition",
            title: step.title,
            operator: "equals",
            inputs: {
              left: reference("node", "record.status", `${step.id}-read`),
              right: literal(step.status),
            },
          },
          step.id,
        );
        const joinId = `${step.id}-join`;
        if (step.mode === "wait") {
          const waitId = `${step.id}-status-wait`;
          add(
            {
              id: waitId,
              type: "automation",
              action: "wait-event",
              title: `Chờ trạng thái: ${STATUS_LABELS[step.resource]?.[step.status] || step.status}`,
              sinceActivation: true,
              statusWait: true,
              filters: [
                { id: "resource", path: "resource", operator: "equals" },
                { id: "id", path: "recordId", operator: "equals" },
                { id: "status", path: "record.status", operator: "equals" },
              ],
              outputPaths: ["resource", "recordId", "record.status"],
              inputs: {
                eventName: literal("record.updated"),
                filter_resource: literal(step.resource),
                filter_id: recordId,
                filter_status: literal(step.status),
              },
            },
            step.id,
          );
          connect(step.id, waitId, "false");
          add(
            {
              id: joinId,
              type: "parallel",
              mode: "join",
              title: `Đã đạt trạng thái: ${step.title}`,
            },
            step.id,
          );
          connect(step.id, joinId, "true");
          connect(waitId, joinId);
          tail = sequence(step.matchedSteps, joinId, safe, true);
        } else {
          const branchTails = [step.matchedSteps, step.unmatchedSteps].map(
            (branch, index) => {
              const branchPort = index === 0 ? "true" : "false";
              if (branch?.length)
                return sequence(branch, step.id, safe, true, branchPort);
              const emptyId = `${step.id}-${branchPort}-empty`;
              add(
                {
                  id: emptyId,
                  type: "automation",
                  action: "log",
                  title: "Không cần thực hiện thêm",
                  inputs: { value: literal("Bỏ qua nhánh không có bước") },
                },
                step.id,
              );
              connect(step.id, emptyId, branchPort);
              return emptyId;
            },
          );
          add(
            {
              id: joinId,
              type: "parallel",
              mode: "join",
              title: `Tiếp tục sau kiểm tra: ${step.title}`,
            },
            step.id,
          );
          branchTails.forEach((branchTail) => connect(branchTail, joinId));
          tail = joinId;
        }
      }
    }
    if (finalize)
      for (const step of outstanding) tail = waitJob(step, tail, "group-wait");
    return tail;
  }
  let previous = append(
    notice(
      "system-received",
      "Đã nhận yêu cầu",
      "Yêu cầu đã được ghi nhận và sẽ được xử lý theo quy trình.",
      ["tenant", "pms"],
    ),
    TRIGGER_ID,
  );
  if (business.approval)
    previous = append(
      { id: "system-approval", type: "approval", title: "PMS duyệt yêu cầu" },
      previous,
    );
  previous = sequence(
    business.steps,
    previous,
    [],
    false,
    business.approval ? "approved" : "success",
  );
  previous = append(
    {
      id: "system-resolve",
      type: "automation",
      action: "update-record",
      title: "Hoàn tất ticket",
      outputPaths: ["status"],
      inputs: {
        resource: literal("ticket"),
        recordId: reference("trigger", "id"),
        field: literal("status"),
        value: literal("resolved"),
      },
    },
    previous,
  );
  append(
    notice(
      "system-completed-pms",
      "Yêu cầu đã hoàn tất",
      "Tất cả công việc liên quan đã hoàn tất. Ticket đã được đóng.",
      ["pms"],
    ),
    previous,
  );
  const {
    draft,
    baseVersion,
    baseDraftRevision,
    expectedVersion,
    expectedDraftRevision,
    nodes: oldNodes,
    transitions,
    graphVersion,
    trigger,
    variables,
    ...base
  } = workflow;
  return toGraph({
    ...base,
    business,
    nodes,
    transitions: edges,
    variables: [],
    graphVersion: 2,
    trigger: {
      id: TRIGGER_ID,
      event: "ticket.created",
      position: { x: 0, y: 60 },
    },
  });
}
// Only the exact original maintenance example is imported automatically.
// Custom graphs stay intact and readable; a new simple workflow can be created separately.
export function editableBusinessWorkflow(workflow, templates, defaultGraph) {
  if (workflow.business?.version === 1) return structuredClone(workflow);
  const strip = (graph) => ({
    nodes: graph.nodes.map(({ position, ...node }) => node),
    transitions: graph.transitions,
    variables: graph.variables,
    trigger: (({ position, ...trigger }) => trigger)(graph.trigger),
  });
  if (
    !defaultGraph ||
    JSON.stringify(strip(toGraph(workflow))) !==
      JSON.stringify(strip(toGraph(defaultGraph)))
  )
    return null;
  const steps = workflow.nodes
    .filter((n) => n.type === "workorder")
    .map((node) => {
      const template = templates.find((t) => t.id === node.templateId);
      return {
        id: node.id,
        type: "workorder",
        title: node.title,
        templateId: node.templateId,
        assignee: node.assignee,
        checklist: [...(template?.checklist || [])],
        responseTimeSLA: template?.responseTimeSLA || 60,
        processTimeSLA: template?.processTimeSLA || 240,
        note: "",
      };
    });
  return {
    ...structuredClone(workflow),
    business: { version: 1, approval: true, steps },
  };
}
function businessRunStep(run, step) {
  const children =
    step.type === "parallel"
      ? step.branches.map((branch) => ({
          ...branch,
          steps: branch.steps.map((child) => businessRunStep(run, child)),
        }))
      : step.type === "condition"
        ? [
            {
              id: `${step.id}-matched`,
              title: step.mode === "wait" ? "Khi đạt trạng thái" : "Đúng",
              steps: step.matchedSteps.map((child) =>
                businessRunStep(run, child),
              ),
            },
            ...(step.mode === "check"
              ? [
                  {
                    id: `${step.id}-unmatched`,
                    title: "Không đúng",
                    steps: step.unmatchedSteps.map((child) =>
                      businessRunStep(run, child),
                    ),
                  },
                ]
              : []),
          ]
        : [];
  const owned = run.workflow.nodes
    .filter((node) => node.businessStepId === step.id)
    .map((node) => node.id);
  return {
    ...step,
    branches: children,
    nodeIds: owned.length
      ? [
          ...owned,
          ...children.flatMap((branch) =>
            branch.steps.flatMap((child) => child.nodeIds),
          ),
        ]
      : step.type === "workorder"
        ? [
            step.id,
            ...(step.waitForCompletion !== false ? [`${step.id}-wait`] : []),
          ]
        : (step.recipients || []).map((role) => `${step.id}-${role}`),
  };
}
export function businessRunSteps(run) {
  if (run.workflow.business?.version === 1) {
    const config = run.workflow.business;
    return [
      {
        id: "system-received",
        title: "Đã nhận ticket",
        nodeIds: ["system-received"],
      },
      ...(config.approval
        ? [
            {
              id: "system-approval",
              type: "approval",
              title: "PMS duyệt yêu cầu",
              nodeIds: ["system-approval"],
            },
          ]
        : []),
      ...config.steps.map((step) => businessRunStep(run, step)),
      {
        id: "system-resolve",
        title: "Hoàn tất ticket và thông báo kết quả",
        nodeIds: ["system-resolve", "system-completed-pms"],
      },
    ];
  }
  return run.workflow.nodes
    .filter(
      (n) =>
        !(n.type === "notify" && n.id.startsWith("notify-")) &&
        n.action !== "wait-event",
    )
    .map((node) => {
      const wait =
        node.type === "workorder" &&
        run.workflow.nodes.find(
          (n) =>
            n.action === "wait-event" &&
            Object.values(n.inputs || {}).some((b) => b?.nodeId === node.id),
        );
      return {
        ...node,
        title:
          node.action === "update-record" &&
          node.inputs?.field?.value === "status" &&
          node.inputs?.value?.value === "resolved"
            ? "Hoàn tất ticket"
            : node.title,
        nodeIds: [node.id, ...(wait ? [wait.id] : [])],
      };
    });
}
export function businessStepStatus(run, step) {
  if (
    step.nodeIds.some(
      (nodeId) => run.approvals?.[nodeId]?.status === "rejected",
    )
  )
    return "rejected";
  const states = step.nodeIds.map(
    (nodeId) => run.nodeStates?.[nodeId]?.status || "pending",
  );
  if (states.includes("error")) return "error";
  if (
    states.every((status) => ["completed", "skipped"].includes(status)) &&
    states.includes("completed")
  )
    return "completed";
  if (states.every((status) => status === "skipped")) return "skipped";
  if (["cancelled", "rejected"].includes(run.status)) return "stopped";
  if (states.includes("waiting") || states.includes("completed"))
    return "waiting";
  return "pending";
}
