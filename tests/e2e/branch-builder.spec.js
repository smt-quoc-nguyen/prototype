import { test, expect } from "@playwright/test";

const rootSteps = page => page.locator(".step-sequence > [data-testid=workflow-step]");
const rootAdd = page => page.locator(".step-add");
async function open(card) {
  const title = card.locator(":scope > .step-card-header .step-title-button");
  if (await title.getAttribute("aria-expanded") !== "true") await title.click();
  return card;
}
async function setup(page, name) {
  await page.goto("/?app=pms&view=workflows");
  await page.getByRole("button", { name: "Tạo quy trình", exact: true }).click();
  await page.getByRole("textbox", { name: "Tên quy trình", exact: true }).fill(name);
  await page.getByRole("combobox", { name: /^Loại ticket áp dụng/ }).selectOption("General request");
  await page.getByLabel("PMS duyệt trước khi giao việc", { exact: true }).uncheck();
}
async function job(card, title) {
  await open(card);
  await card.getByRole("combobox", { name: /^Mẫu công việc/ }).selectOption("");
  await card.getByRole("textbox", { name: "Tên công việc", exact: true }).fill(title);
  await card.getByRole("textbox", { name: "Checklist (mỗi dòng một mục)", exact: true }).fill("Kiểm tra\nBàn giao");
}
async function notice(branch, subject) {
  await branch.locator(":scope > .step-branch-add").getByRole("button", { name: "Thêm thông báo", exact: true }).click();
  const card = branch.locator(":scope > [data-testid=workflow-step]").last();
  await open(card);
  await card.getByRole("textbox", { name: "Tiêu đề thông báo", exact: true }).fill(subject);
  await card.getByRole("textbox", { name: "Nội dung thông báo", exact: true }).fill("Nội dung " + subject);
}
async function state(page) {
  return page.evaluate(async () => { const store = await import("/src/browser-store.js"); await store.refresh(); return store.getSnapshot(); });
}
function sandboxJob(sandbox, title) { return sandbox.locator(".sandbox-work").filter({ hasText: title }); }
async function completeReal(page, title) {
  const card = page.locator(".order-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(card.getByRole("button", { name: "Hoàn thành", exact: true })).toBeDisabled();
  for (const check of await card.getByRole("checkbox").all()) await check.check();
  await card.getByRole("button", { name: "Hoàn thành", exact: true }).click();
}

test("nested parallel editor persists, sandbox joins all jobs, and real apps resume without duplicate work", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await setup(page, "Kiểm tra đa chuyên môn");
  await rootSteps(page).first().getByRole("button", { name: "Xóa bước 1", exact: true }).click();
  await rootAdd(page).getByRole("button", { name: "Thêm nhóm song song", exact: true }).click();
  const outer = await open(rootSteps(page).first());
  await outer.getByRole("textbox", { name: "Tên nhóm song song", exact: true }).fill("Kiểm tra cùng lúc");
  const left = outer.locator(":scope > .step-card-form > .step-branches > [data-testid=workflow-branch]").nth(0);
  const right = outer.locator(":scope > .step-card-form > .step-branches > [data-testid=workflow-branch]").nth(1);
  await job(left.locator(":scope > [data-testid=workflow-step]").first(), "Kiểm tra điện");
  await right.locator(":scope > [data-testid=workflow-step]").first().getByRole("button", { name: /^Xóa bước/ }).click();
  await right.locator(":scope > .step-branch-add").getByRole("button", { name: "Thêm nhóm song song", exact: true }).click();
  const inner = await open(right.locator(":scope > [data-testid=workflow-step]").first());
  await inner.getByRole("textbox", { name: "Tên nhóm song song", exact: true }).fill("Kiểm tra nước và máy lạnh");
  const innerBranches = inner.locator(":scope > .step-card-form > .step-branches > [data-testid=workflow-branch]");
  await job(innerBranches.nth(0).locator(":scope > [data-testid=workflow-step]").first(), "Kiểm tra nước");
  await job(innerBranches.nth(1).locator(":scope > [data-testid=workflow-step]").first(), "Kiểm tra máy lạnh");
  await rootAdd(page).getByRole("button", { name: "Thêm thông báo", exact: true }).click();
  const finalNotice = await open(rootSteps(page).last());
  await finalNotice.getByRole("textbox", { name: "Tiêu đề thông báo", exact: true }).fill("Đã kiểm tra tất cả chuyên môn");
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await expect(page.getByText("Đã lưu bản nháp", { exact: true })).toBeVisible();
  await page.reload();
  await expect(rootSteps(page)).toHaveCount(2);
  await open(rootSteps(page).first());
  await open(rootSteps(page).first().locator(":scope > .step-card-form > .step-branches > [data-testid=workflow-branch]").nth(1).locator(":scope > [data-testid=workflow-step]").first());
  await page.screenshot({ path: test.info().outputPath("workflow-parallel-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("workflow-parallel-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Chạy thử quy trình", exact: true }).click();
  const sandbox = page.getByTestId("workflow-sandbox");
  await expect(sandbox.locator(".sandbox-work")).toHaveCount(3);
  await sandboxJob(sandbox, "Kiểm tra điện").getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox.locator(".sandbox-notices")).not.toContainText("Đã kiểm tra tất cả chuyên môn");
  await sandboxJob(sandbox, "Kiểm tra nước").getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox.locator(".sandbox-notices")).not.toContainText("Đã kiểm tra tất cả chuyên môn");
  await sandboxJob(sandbox, "Kiểm tra máy lạnh").getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox).toContainText("Quy trình hoàn tất. Tenant và PMS đã nhận kết quả.");
  expect((await state(page)).tickets).toHaveLength(0);
  await page.getByRole("button", { name: "Đóng chạy thử", exact: true }).click();
  await page.getByRole("button", { name: "Xuất bản quy trình", exact: true }).click();
  await expect(page.getByText("Quy trình đã được xuất bản", { exact: true })).toBeVisible();
  const tenant = await context.newPage(), maintainer = await context.newPage();
  await Promise.all([tenant.goto("/?app=tenant"), maintainer.goto("/?app=maintainer&view=orders")]);
  await tenant.getByRole("button", { name: "Tạo yêu cầu", exact: true }).first().click();
  await tenant.getByRole("textbox", { name: "Tên yêu cầu", exact: true }).fill("Cần kiểm tra ba chuyên môn");
  await tenant.getByRole("combobox", { name: "Loại yêu cầu", exact: true }).selectOption("General request");
  await tenant.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(maintainer.locator(".order-card")).toHaveCount(3);
  await completeReal(maintainer, "Kiểm tra điện");
  await completeReal(maintainer, "Kiểm tra nước");
  await maintainer.reload();
  let saved = await state(page);
  expect(saved.workOrders).toHaveLength(3);
  expect(saved.notifications.filter(n => n.title === "Đã kiểm tra tất cả chuyên môn")).toHaveLength(0);
  await completeReal(maintainer, "Kiểm tra máy lạnh");
  await tenant.goto("/?app=tenant&view=tickets");
  await expect(tenant.locator("tbody .badge.resolved")).toHaveText("Hoàn tất");
  saved = await state(page);
  expect(saved.workOrders).toHaveLength(3);
  expect(saved.notifications.filter(n => n.title === "Đã kiểm tra tất cả chuyên môn")).toHaveLength(1);
  await page.goto("/?app=pms&view=runs");
  await expect(page.locator(".run-card .badge.completed")).toBeVisible();
  await expect(page.locator(".workflow-business-step.waiting")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("workflow-parallel-run.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("status UI offers both waiting and immediate checks, uses live state, and skips the false branch", async ({ page }) => {
  await setup(page, "Theo dõi trạng thái công việc");
  const source = rootSteps(page).first();
  await job(source, "Kiểm tra theo trạng thái");
  await source.getByLabel("Chờ hoàn thành trước khi tiếp tục", { exact: true }).uncheck();
  const sourceId = await source.getAttribute("data-step-id");
  await rootAdd(page).getByRole("button", { name: "Thêm điều kiện", exact: true }).click();
  const waiting = await open(rootSteps(page).nth(1));
  await waiting.getByRole("textbox", { name: "Tên bước điều kiện", exact: true }).fill("Chờ kỹ thuật viên bắt đầu");
  await waiting.getByRole("combobox", { name: "Cách kiểm tra", exact: true }).selectOption("wait");
  await waiting.getByRole("combobox", { name: "Kiểm tra trạng thái của", exact: true }).selectOption("workorder");
  await waiting.getByRole("combobox", { name: /^Công việc cần kiểm tra/ }).selectOption(sourceId);
  await waiting.getByRole("combobox", { name: "Trạng thái cần đạt", exact: true }).selectOption("in-progress");
  await notice(waiting.getByTestId("workflow-branch").first(), "Kỹ thuật viên đã bắt đầu");
  await rootAdd(page).getByRole("button", { name: "Thêm điều kiện", exact: true }).click();
  const checking = await open(rootSteps(page).nth(2));
  await checking.getByRole("textbox", { name: "Tên bước điều kiện", exact: true }).fill("Kiểm tra trạng thái hiện tại");
  await checking.getByRole("combobox", { name: "Kiểm tra trạng thái của", exact: true }).selectOption("workorder");
  await checking.getByRole("combobox", { name: /^Công việc cần kiểm tra/ }).selectOption(sourceId);
  await checking.getByRole("combobox", { name: "Trạng thái cần đạt", exact: true }).selectOption("in-progress");
  await notice(checking.getByTestId("workflow-branch").nth(0), "Trạng thái hiện tại đúng");
  const falseBranch = checking.getByTestId("workflow-branch").nth(1);
  await falseBranch.locator(":scope > .step-branch-add").getByRole("button", { name: "Thêm công việc", exact: true }).click();
  await job(falseBranch.locator(":scope > [data-testid=workflow-step]").first(), "Công việc nhánh bị bỏ qua");
  await page.screenshot({ path: test.info().outputPath("workflow-status-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Chạy thử quy trình", exact: true }).click();
  const sandbox = page.getByTestId("workflow-sandbox");
  await expect(sandbox.locator(".sandbox-work")).toHaveCount(1);
  await expect(sandbox.locator(".sandbox-notices")).not.toContainText("Kỹ thuật viên đã bắt đầu");
  await sandboxJob(sandbox, "Kiểm tra theo trạng thái").getByRole("button", { name: "Maintainer: Bắt đầu công việc", exact: true }).click();
  await expect(sandbox.locator(".sandbox-notices")).toContainText("Kỹ thuật viên đã bắt đầu");
  await expect(sandbox.locator(".sandbox-notices")).toContainText("Trạng thái hiện tại đúng");
  await expect(sandbox.locator(".sandbox-work")).toHaveCount(1);
  await expect(sandbox).not.toContainText("Quy trình hoàn tất. Tenant và PMS đã nhận kết quả.");
  await sandboxJob(sandbox, "Kiểm tra theo trạng thái").getByRole("button", { name: "Maintainer: Tạm dừng công việc", exact: true }).click();
  await sandboxJob(sandbox, "Kiểm tra theo trạng thái").getByRole("button", { name: "Maintainer: Tiếp tục công việc", exact: true }).click();
  await expect(sandbox.locator(".sandbox-notices p").filter({ hasText: "Kỹ thuật viên đã bắt đầu" })).toHaveCount(1);
  await sandboxJob(sandbox, "Kiểm tra theo trạng thái").getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox).toContainText("Quy trình hoàn tất. Tenant và PMS đã nhận kết quả.");
  expect((await state(page)).workOrders).toHaveLength(0);
});

test("sandbox can wait for closing a completed job and skips waiting when the status already matches", async ({ page }) => {
  await setup(page, "Kiểm tra trạng thái kết thúc công việc");
  const source = rootSteps(page).first();
  await job(source, "Công việc cần đóng");
  const sourceId = await source.getAttribute("data-step-id");
  await rootAdd(page).getByRole("button", { name: "Thêm điều kiện", exact: true }).click();
  const waiting = await open(rootSteps(page).nth(1));
  await waiting.getByRole("combobox", { name: "Cách kiểm tra", exact: true }).selectOption("wait");
  await waiting.getByRole("combobox", { name: "Kiểm tra trạng thái của", exact: true }).selectOption("workorder");
  await waiting.getByRole("combobox", { name: /^Công việc cần kiểm tra/ }).selectOption(sourceId);
  await waiting.getByRole("combobox", { name: "Trạng thái cần đạt", exact: true }).selectOption("closed");
  await notice(waiting.getByTestId("workflow-branch").first(), "Sau khi đạt trạng thái kết thúc");
  await page.getByRole("button", { name: "Chạy thử quy trình", exact: true }).click();
  const sandbox = page.getByTestId("workflow-sandbox");
  await sandboxJob(sandbox, "Công việc cần đóng").getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox.locator(".sandbox-notices")).not.toContainText("Sau khi đạt trạng thái kết thúc");
  await sandboxJob(sandbox, "Công việc cần đóng").getByRole("button", { name: "Maintainer: Đóng công việc", exact: true }).click();
  await expect(sandbox.locator(".sandbox-notices")).toContainText("Sau khi đạt trạng thái kết thúc");
  await expect(sandbox).toContainText("Quy trình hoàn tất. Tenant và PMS đã nhận kết quả.");
  await waiting.getByRole("combobox", { name: "Trạng thái cần đạt", exact: true }).selectOption("completed");
  await page.getByRole("button", { name: "Chạy thử quy trình", exact: true }).click();
  await sandboxJob(sandbox, "Công việc cần đóng").getByRole("button", { name: "Maintainer: Hoàn thành công việc", exact: true }).click();
  await expect(sandbox).toContainText("Quy trình hoàn tất. Tenant và PMS đã nhận kết quả.");
  expect((await state(page)).notifications).toHaveLength(0);
});
