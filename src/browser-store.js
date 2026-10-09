import { initialState, reduceCommand } from "./engine.js";
const DB = "smartos-maintenance-v1",
  SIGNAL = "smartos-maintenance-revision";
let dbPromise,
  snapshot = initialState();
const listeners = new Set();
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DB) : null;
function database() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          Error(
            "Không mở được IndexedDB. Kiểm tra quyền lưu trữ của trình duyệt.",
          ),
        );
    });
  return dbPromise;
}
export async function refresh() {
  const db = await database();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readonly");
    const req = tx.objectStore("state").get("current");
    req.onsuccess = () => resolve(req.result || initialState());
    req.onerror = () => reject(req.error);
  });
  if (result.revision >= snapshot.revision) {
    snapshot = result;
    listeners.forEach((fn) => fn());
  }
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const getSnapshot = () => snapshot;
export async function dispatch(command) {
  const db = await database();
  const result = await new Promise((resolve, reject) => {
    // One readwrite transaction serializes concurrent commands from every tab.
    const tx = db.transaction("state", "readwrite"),
      store = tx.objectStore("state");
    let next,
      notices = [],
      domainError;
    const req = store.get("current");
    req.onsuccess = () => {
      try {
        const prev = req.result || initialState();
        next = reduceCommand(prev, command);
        const oldIds = new Set(prev.notifications.map((n) => n.id));
        notices = next.notifications.filter((n) => !oldIds.has(n.id));
        store.put(next, "current");
      } catch (error) {
        domainError = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve({ next, notices });
    tx.onabort = tx.onerror = () =>
      reject(
        domainError ||
          tx.error ||
          Error(
            "Không lưu được dữ liệu. Có thể dung lượng trình duyệt đã đầy.",
          ),
      );
  });
  if (result.next.revision >= snapshot.revision) {
    snapshot = result.next;
    listeners.forEach((fn) => fn());
  }
  channel?.postMessage({ revision: result.next.revision });
  try {
    localStorage.setItem(SIGNAL, `${result.next.revision}:${Date.now()}`);
  } catch {
    /* BroadcastChannel still works. */
  }
  void systemNotifications(result.notices);
  return result.next;
}
channel?.addEventListener("message", () => {
  void refresh().catch(console.error);
});
window.addEventListener("storage", (event) => {
  if (event.key === SIGNAL) void refresh().catch(console.error);
});
window.addEventListener("focus", () => {
  void refresh().catch(console.error);
});
export async function registerWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}
export async function enableNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator))
    throw Error(
      "Trình duyệt chưa hỗ trợ thông báo hệ thống. Thông báo trong app vẫn hoạt động.",
    );
  // Request within the explicit button click; permission must never be automatic.
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw Error("Chưa được cấp quyền. Bạn vẫn nhận được thông báo trong app.");
  await registerWorker();
  await navigator.serviceWorker.ready;
  return permission;
}
async function systemNotifications(notices) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  )
    return;
  try {
    const reg = await navigator.serviceWorker.ready;
    for (const n of notices.filter(
      (n) => !n.channels || n.channels.includes("browser"),
    ))
      await reg.showNotification(
        n.body ? n.title : `SmartOS · ${n.role.toUpperCase()}`,
        {
          body: n.body || n.title,
          tag: n.id,
          data: {
            role: n.role,
            ticketId: n.ticketId,
            workOrderId: n.workOrderId,
          },
          icon: "/icon.svg",
        },
      );
  } catch (err) {
    console.warn("Thông báo hệ thống chưa gửi được", err);
  }
}
