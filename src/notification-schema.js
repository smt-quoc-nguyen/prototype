// Channel descriptors are shared by the builder, validator and browser adapter.
export const NOTIFICATION_CHANNELS = [
  {
    id: "in-app",
    label: "Hộp thông báo trong ứng dụng",
    description: "Lưu để người nhận xem lại bất cứ lúc nào.",
  },
  {
    id: "browser",
    label: "Thông báo của trình duyệt",
    description: "Hiển thị khi người nhận đã cấp quyền thông báo.",
  },
];
export const NOTIFICATION_KINDS = {
  info: "Thông tin",
  reminder: "Nhắc nhở",
  alert: "Cần chú ý",
};
const legacyUsers = {
  tenant: "tenant-01",
  maintainer: "tech-01",
  pms: "pms-01",
};
const L = (value) => ({ kind: "literal", value });
export function normalizeNotification(node) {
  if (node.type !== "notify" || node.inputs?.recipients) return node;
  const inputs = {
    ...node.inputs,
    recipients: L(
      (node.recipients || []).map((role) => legacyUsers[role] || role),
    ),
    subject: L(node.title),
    contextResource: L(
      node.inputs?.workOrderId?.kind === "reference" ||
        node.inputs?.workOrderId?.value
        ? "workorder"
        : "",
    ),
    contextId: node.inputs?.workOrderId || L(""),
  };
  return {
    ...node,
    channels: node.channels || ["in-app", "browser"],
    notificationKind: "info",
    legacyNotification: true,
    inputs,
  };
}
