// System notifications are originated by browser commands, not remote Push.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { role = "pms", ticketId, workOrderId } = event.notification.data || {};
  const url = new URL("/", self.location.origin);
  url.searchParams.set("app", role);
  url.searchParams.set(
    "view",
    !ticketId && !workOrderId
      ? "notifications"
      : role === "maintainer" || (workOrderId && role === "pms")
        ? "orders"
        : "tickets",
  );
  if (ticketId) url.searchParams.set("ticket", ticketId);
  if (workOrderId) url.searchParams.set("order", workOrderId);
  event.waitUntil(self.clients.openWindow(url.href));
});
