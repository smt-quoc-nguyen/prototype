import { test, expect } from "@playwright/test";

const steps = page => page.getByTestId("workflow-step");
async function openStep(page, index) {
  const card = steps(page).nth(index);
  const title = card.locator(".step-title-button");
  if (await title.getAttribute("aria-expanded") !== "true") await title.click();
  return card;
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const store = await import("/src/browser-store.js");
    await store.refresh();
    return store.getSnapshot();
  });
}
async function newWorkflow(page, name, type = "General request") {
  await page.goto("/?app=pms&view=workflows");
  await page.getByRole("button", { name: "Tạo quy trình", exact: true }).click();
  await page.getByLabel("Tên quy trình", { exact: true }).fill(name);
  await page.getByLabel(/^Loại ticket áp dụng/).selectOption(type);
}
async function customizeWork(page, index, title, checklist) {
  const card = await openStep(page, index);
  await card.getByLabel(/^Mẫu công việc/).selectOption("");
  await card.getByLabel("Tên công việc", { exact: true }).fill(title);
  await card.getByRole("textbox", { name: "Checklist (mỗi dòng một mục)", exact: true }).fill(checklist);
  return card;
}
async function createTicket(page, title, type = "General request") {
  await page.getByRole("button", { name: "Tạo yêu cầu", exact: true }).first().click();
  await page.getByLabel("Tên yêu cầu", { exact: true }).fill(title);
  await page.getByRole("combobox", { name: "Loại yêu cầu", exact: true }).selectOption(type);
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Tạo yêu cầu bảo trì" })).toBeHidden();
}
async function finishWork(page, title) {
  const card = page.locator(".order-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(card.getByRole("button", { name: "Hoàn thành", exact: true })).toBeDisabled();
  for (const box of await card.getByRole("checkbox").all()) await box.check();
  await card.getByRole("button", { name: "Hoàn thành", exact: true }).click();
}

test("nontechnical builder supports custom steps, reorder, draft reload and an isolated full sandbox", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await newWorkflow(page, "Quy trình phòng họp");
  await expect(page.getByRole("heading", { name: "Quy trình xử lý ticket", exact: true })).toBeVisible();
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await expect(page.getByLabel("Trigger input JSON")).toHaveCount(0);
  const first = await customizeWork(page, 0, "Kiểm tra phòng họp", "Kiểm tra thiết bị\nGhi nhận nguyên nhân");
  await first.getByLabel("Thời hạn phản hồi (phút)").fill("15");
  await first.getByLabel("Thời hạn hoàn thành (phút)").fill("45");
  await page.getByRole("button", { name: "Thêm thông báo", exact: true }).click();
  const notice = await openStep(page, 1);
  await notice.getByLabel("PMS · Quản lý", { exact: true }).check();
  await notice.getByLabel("Tiêu đề thông báo", { exact: true }).fill("Đã kiểm tra phòng họp");
  await notice.getByRole("textbox", { name: "Nội dung thông báo", exact: true }).fill("Đã tìm thấy nguyên nhân, sẽ xử lý tiếp.");
  await page.getByRole("button", { name: "Thêm công việc", exact: true }).click();
  await customizeWork(page, 2, "Sửa chữa và bàn giao", "Sửa chữa\nBàn giao");
  await page.getByRole("button", { name: "Đưa bước 3 lên", exact: true }).click();
  await expect(steps(page).nth(1)).toContainText("Sửa chữa và bàn giao");
  await page.getByRole("button", { name: "Đưa bước 2 xuống", exact: true }).click();
  await expect(steps(page).nth(1)).toContainText("Đã kiểm tra phòng họp");
  await page.getByRole("button", { name: "Thêm thông báo", exact: true }).click();
  await page.getByRole("button", { name: "Xóa bước 4", exact: true }).click();
  await expect(steps(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(page.getByText("Đã lưu bản nháp", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /Quy trình phòng họp.*Bản nháp/ }).click();
  await expect(steps(page)).toHaveCount(3);
  await expect((await openStep(page, 0)).getByRole("textbox", { name: "Checklist (mỗi dòng một mục)", exact: true })).toHaveValue("Kiểm tra thiết bị\nGhi nhận nguyên nhân");
  await expect((await openStep(page, 1)).getByRole("textbox", { name: "Nội dung thông báo", exact: true })).toHaveValue("Đã tìm thấy nguyên nhân, sẽ xử lý tiếp.");
  await page.getByRole("button", { name: "Chạy thử quy trình", exact: true }).click();
  const sandbox = page.getByTestId("workflow-sandbox");
  await sandbox.getByRole("button", { name: "PMS: Duyệt yêu cầu", exact: true }).click();
  await expect(sandbox.locator(".sandbox-work")).toContainText("Kiểm tra thiết bị");
  await sandbox.getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox.locator(".sandbox-work")).toContainText("Sửa chữa và bàn giao");
  await expect(sandbox.locator(".sandbox-notices")).toContainText("Đã kiểm tra phòng họp");
  await sandbox.getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox).toContainText("Quy trình hoàn tất. Tenant và PMS đã nhận kết quả.");
  const state = await snapshot(page);
  expect({ tickets: state.tickets.length, orders: state.workOrders.length, notifications: state.notifications.length, runs: state.runs.length }).toEqual({ tickets: 0, orders: 0, notifications: 0, runs: 0 });
  await page.screenshot({ path: test.info().outputPath("workflow-simple-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Đóng chạy thử", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("workflow-simple-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test("published custom workflow runs across Tenant, PMS and Maintainer with exact recipient messages", async ({ page, context }) => {
  await newWorkflow(page, "Xử lý yêu cầu phòng họp");
  await customizeWork(page, 0, "Kiểm tra phòng họp", "Ghi nhận lỗi\nKiểm tra thiết bị");
  await page.getByRole("button", { name: "Thêm thông báo", exact: true }).click();
  const notice = await openStep(page, 1);
  await notice.getByLabel("PMS · Quản lý", { exact: true }).check();
  await notice.getByLabel("Tiêu đề thông báo", { exact: true }).fill("Kết quả kiểm tra phòng họp");
  await notice.getByRole("textbox", { name: "Nội dung thông báo", exact: true }).fill("Thiết bị đã được kiểm tra. Bắt đầu sửa chữa.");
  await page.getByRole("button", { name: "Thêm công việc", exact: true }).click();
  await customizeWork(page, 2, "Sửa chữa phòng họp", "Sửa thiết bị\nBàn giao kết quả");
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByText("Quy trình đã được xuất bản", { exact: true })).toBeVisible();
  const tenant = await context.newPage(), maintainer = await context.newPage();
  await Promise.all([tenant.goto("/?app=tenant"), maintainer.goto("/?app=maintainer&view=orders"), page.goto("/?app=pms&view=notifications")]);
  await createTicket(tenant, "Cần hỗ trợ phòng họp");
  await expect(maintainer.locator(".order-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Phê duyệt", exact: true }).click();
  await expect(maintainer.getByRole("heading", { name: "Sửa chữa phòng họp", exact: true })).toHaveCount(0);
  await finishWork(maintainer, "Kiểm tra phòng họp");
  await expect(maintainer.getByRole("heading", { name: "Sửa chữa phòng họp", exact: true })).toBeVisible();
  await tenant.goto("/?app=tenant&view=notifications");
  const tenantNotice = tenant.locator(".notification-row").filter({ hasText: "Kết quả kiểm tra phòng họp" });
  await expect(tenantNotice.locator(".notification-body-text")).toHaveText("Thiết bị đã được kiểm tra. Bắt đầu sửa chữa.");
  await expect(page.locator(".notifications-list")).toContainText("Kết quả kiểm tra phòng họp");
  await maintainer.goto("/?app=maintainer&view=notifications");
  await expect(maintainer.locator(".notifications-list")).not.toContainText("Kết quả kiểm tra phòng họp");
  await maintainer.goto("/?app=maintainer&view=orders");
  await maintainer.reload();
  await finishWork(maintainer, "Sửa chữa phòng họp");
  await tenant.goto("/?app=tenant&view=tickets");
  await expect(tenant.locator("tbody .badge.resolved")).toHaveText("Hoàn tất");
  await expect(page.locator(".notifications-list")).toContainText("Yêu cầu đã hoàn tất");
  await page.goto("/?app=pms&view=runs");
  await expect(page.locator(".run-card .badge.completed")).toBeVisible();
  await expect(page.locator(".run-card")).toContainText("Kiểm tra phòng họp");
  await expect(page.locator(".run-card pre:visible")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("workflow-simple-run.png"), fullPage: true });
});

test("editing a live draft keeps the published trigger active until explicit publication", async ({ page, context }) => {
  await page.goto("/?app=pms&view=workflows");
  await page.getByLabel("Tên quy trình", { exact: true }).fill("Quy trình nước bản mới");
  await page.getByLabel(/^Loại ticket áp dụng/).selectOption("Plumbing");
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(page.getByText("Đã lưu bản nháp. Ticket mới tiếp tục dùng bản đang áp dụng.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Tên quy trình", { exact: true })).toHaveValue("Quy trình nước bản mới");
  await expect(page.getByLabel(/^Loại ticket áp dụng/)).toHaveValue("Plumbing");
  const tenant = await context.newPage();
  await tenant.goto("/?app=tenant");
  await createTicket(tenant, "Ticket vẫn theo quy trình live", "Equipment malfunction");
  await createTicket(tenant, "Ticket nước chưa xuất bản", "Plumbing");
  let state = await snapshot(page);
  expect(state.runs).toHaveLength(1);
  expect(state.runs[0].workflow.version).toBe(1);
  expect(state.runs[0].workflow.name).toBe("Xử lý sự cố điều hoà");
  expect(state.workflows[0].published).toBe(true);
  expect(state.workflows[0].version).toBe(1);
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByText("Quy trình đã được xuất bản", { exact: true })).toBeVisible();
  await createTicket(tenant, "Ticket nước sau xuất bản", "Plumbing");
  state = await snapshot(page);
  expect(state.runs).toHaveLength(2);
  expect(state.runs[0].workflow.version).toBe(2);
  expect(state.runs[0].workflow.name).toBe("Quy trình nước bản mới");
  expect(state.runs[1].workflow.name).toBe("Xử lý sự cố điều hoà");
});

test("publish validates required business details and prevents conflicting live workflows", async ({ page }) => {
  await newWorkflow(page, "Quy trình chưa đủ thông tin");
  const work = await openStep(page, 0);
  await work.getByRole("textbox", { name: "Checklist (mỗi dòng một mục)", exact: true }).fill("");
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("checklist");
  await work.getByRole("textbox", { name: "Checklist (mỗi dòng một mục)", exact: true }).fill("Kiểm tra");
  await page.getByRole("button", { name: "Thêm thông báo", exact: true }).click();
  const notice = await openStep(page, 1);
  await notice.getByLabel("Tenant · Người gửi ticket", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("người nhận");
  await notice.getByLabel("Tenant · Người gửi ticket", { exact: true }).check();
  await page.getByLabel(/^Loại ticket áp dụng/).selectOption("Equipment malfunction");
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("đang dùng");
  expect((await snapshot(page)).workflows).toHaveLength(1);
});

test("opening a custom legacy graph preserves all saved data and offers a read-only explanation", async ({ page }) => {
  await page.goto("/?app=pms&view=workflows");
  const before = await page.evaluate(async () => {
    const store = await import("/src/browser-store.js");
    const custom = structuredClone(store.getSnapshot().workflows[0]);
    custom.nodes[0].title = "Phê duyệt theo quy định riêng";
    custom.variables = [{ name: "customNote", type: "string", value: "Giữ lại dữ liệu" }];
    await store.dispatch({ type: "SAVE_WORKFLOW", role: "pms", payload: custom });
    return structuredClone(store.getSnapshot().workflows[0]);
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Quy trình cũ được giữ nguyên", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu bản nháp", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Xuất bản quy trình", exact: true })).toHaveCount(0);
  await expect(page.locator(".legacy-step-list")).toContainText("Phê duyệt theo quy định riêng");
  expect((await snapshot(page)).workflows[0]).toEqual(before);
});

test("concurrent editors reject stale publication and can reload the saved version", async ({ page, context }) => {
  await page.goto("/?app=pms&view=workflows");
  const other = await context.newPage();
  await other.goto("/?app=pms&view=workflows");
  await page.getByLabel("Tên quy trình", { exact: true }).fill("Nội dung chưa lưu từ tab A");
  await other.getByLabel("Tên quy trình", { exact: true }).fill("Quy trình đã xuất bản từ tab B");
  await other.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(other.getByText("Quy trình đã được xuất bản", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Quy trình đã được cập nhật. Bản bạn đang sửa được giữ lại; hãy tải bản mới trước khi lưu.");
  await expect(page.getByLabel("Tên quy trình", { exact: true })).toHaveValue("Nội dung chưa lưu từ tab A");
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cập nhật ở tab khác");
  expect((await snapshot(page)).workflows[0].name).toBe("Quy trình đã xuất bản từ tab B");
  await page.getByRole("button", { name: "Tải bản đã lưu", exact: true }).click();
  await expect(page.getByLabel("Tên quy trình", { exact: true })).toHaveValue("Quy trình đã xuất bản từ tab B");
  await page.getByLabel("Tên quy trình", { exact: true }).fill("Quy trình sau khi tải lại");
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByText("Quy trình đã được xuất bản", { exact: true })).toBeVisible();
  expect((await snapshot(page)).workflows[0].version).toBe(3);
});

test("cancelling an automatically assigned ticket closes its job and shows stopped progress", async ({ page, context }) => {
  await newWorkflow(page, "Xử lý điện không chờ duyệt", "Electrical");
  await page.getByLabel("PMS duyệt trước khi giao việc", { exact: true }).uncheck();
  await customizeWork(page, 0, "Kiểm tra hệ thống điện", "Kiểm tra nguồn điện");
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByText("Quy trình đã được xuất bản", { exact: true })).toBeVisible();
  const tenant = await context.newPage(), maintainer = await context.newPage();
  await tenant.goto("/?app=tenant");
  await maintainer.goto("/?app=maintainer&view=orders");
  await createTicket(tenant, "Ticket điện cần hủy", "Electrical");
  await expect(maintainer.getByRole("heading", { name: "Kiểm tra hệ thống điện", exact: true })).toBeVisible();
  await maintainer.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await tenant.getByRole("button", { name: "Ticket điện cần hủy", exact: true }).click();
  await tenant.getByRole("button", { name: "Hủy yêu cầu", exact: true }).click();
  await tenant.getByRole("button", { name: "Xác nhận hủy", exact: true }).click();
  await expect(maintainer.locator(".order-card .badge.closed")).toBeVisible();
  await expect(maintainer.getByRole("button", { name: "Hoàn thành", exact: true })).toHaveCount(0);
  await page.goto("/?app=pms&view=runs");
  const run = page.locator(".run-card").filter({ hasText: "Ticket điện cần hủy" });
  await expect(run.locator(".badge.cancelled")).toBeVisible();
  await expect(run.locator(".workflow-business-step.waiting")).toHaveCount(0);
  await expect(run).toContainText("Đã dừng");
});
