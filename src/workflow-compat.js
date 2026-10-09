// Import adapter for saved prototypes. Domain-specific operations never enter the new catalog.
const L = (value) => ({ kind: "literal", value });
const ticketId = { kind: "reference", scope: "trigger", path: "id" };
export function migrateAutomation(node) {
  if (node.type !== "automation") return node;
  const legacy = node.action;
  if (legacy === "wait-workorder")
    return {
      ...node,
      action: "wait-event",
      legacyAction: legacy,
      filters: [
        { id: "resource", path: "resource", operator: "equals" },
        { id: "id", path: "recordId", operator: "equals" },
        { id: "status", path: "record.status", operator: "one-of" },
      ],
      outputPaths: ["resource", "recordId", "record.status"],
      inputs: {
        eventName: L("record.updated"),
        filter_resource: L("workorder"),
        filter_id: node.inputs?.workOrderId,
        filter_status: L(["completed", "closed"]),
      },
    };
  const field = {
    "update-note": "note",
    "update-priority": "priority",
    "resolve-ticket": "status",
    "cancel-ticket": "status",
  }[legacy];
  if (field)
    return {
      ...node,
      action: "update-record",
      legacyAction: legacy,
      outputPaths: [field],
      inputs: {
        resource: L("ticket"),
        recordId: ticketId,
        field: L(field),
        value:
          legacy === "resolve-ticket"
            ? L("resolved")
            : legacy === "cancel-ticket"
              ? L("cancelled")
              : node.inputs?.value,
      },
    };
  return node;
}

// Aliases are confined to old snapshots; the generic operation schemas stay clean.
export function legacyOutputFields(node) {
  return node.legacyAction === "wait-workorder"
    ? ["workOrderId", "status"]
    : node.legacyAction
      ? ["ticketId", "status"]
      : [];
}
export function legacyOutput(node, output) {
  if (node.legacyAction === "wait-workorder")
    return {
      ...output,
      workOrderId: output.payload.recordId,
      status: output.payload.record.status,
    };
  if (node.legacyAction && output.record)
    return {
      ...output,
      ticketId: output.recordId,
      status: output.record.status,
    };
  return output;
}
export function maintenanceWaitSummary(run) {
  run.waitingWorkOrderIds = run.workflow.nodes
    .filter(
      (n) =>
        n.action === "wait-event" && run.nodeStates[n.id].status === "waiting",
    )
    .flatMap((n) => {
      const filters = n.filters || [],
        inputs = run.nodeStates[n.id].inputs;
      const id = filters.find(
        (f) => f.path === "recordId" && f.operator === "equals",
      );
      const resource = filters.find(
        (f) => f.path === "resource" && f.operator === "equals",
      );
      return id && resource && inputs[`filter_${resource.id}`] === "workorder"
        ? [inputs[`filter_${id.id}`]]
        : [];
    });
  run.waitingWorkOrderId = run.waitingWorkOrderIds[0] || null;
}
