import { test, expect } from "@playwright/test";
async function createTicket(page, title = "Máy lạnh phòng họp không mát") {
  await page
    .getByRole("button", { name: "Tạo yêu cầu", exact: true })
    .first()
    .click();
  await page.getByLabel("Tên yêu cầu").fill(title);
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Tạo yêu cầu bảo trì" }),
  ).toBeHidden();
}
async function finish(card) {
  await card.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  const boxes = card.getByRole("checkbox");
  const complete = card.getByRole("button", { name: "Hoàn thành", exact: true });
  if (await boxes.count()) await expect(complete).toBeDisabled();
  for (let i = 0; i < (await boxes.count()); i++) {
    await boxes.nth(i).check();
    if (i < (await boxes.count()) - 1) await expect(complete).toBeDisabled();
  }
  await expect(complete).toBeEnabled();
  await complete.click();
}
test("three apps: realtime approval, sequential work orders, reload persistence", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const pms = await context.newPage(),
    tenant = await context.newPage(),
    tech = await context.newPage();
  const errors = [];
  for (const page of [pms, tenant, tech])
    page.on("pageerror", (e) => errors.push(e.message));
  await Promise.all([
    pms.goto("/?app=pms"),
    tenant.goto("/?app=tenant"),
    tech.goto("/?app=maintainer&view=orders"),
  ]);
  await expect(pms.getByText("Đã đồng bộ", { exact: true })).toBeVisible();
  await createTicket(tenant);
  await expect(
    pms.getByText("Yêu cầu đang chờ phê duyệt", { exact: true }),
  ).toBeVisible();
  await pms.getByRole("button", { name: "Phê duyệt", exact: true }).click();
  await tenant.goto("/?app=tenant&view=notifications");
  await expect(tenant.locator(".notifications-list")).toContainText("Thông báo lịch kiểm tra");
  await expect(tenant.locator(".notifications-list")).not.toContainText("Cần phê duyệt");
  await tech.goto("/?app=maintainer&view=notifications");
  await expect(tech.locator(".notifications-list")).toContainText("Thông báo lịch kiểm tra");
  await expect(tech.locator(".notifications-list")).not.toContainText("Cần phê duyệt");
  await tech.goto("/?app=maintainer&view=orders");
  await expect(tech.getByRole("heading", { name: "Sửa chữa máy lạnh", exact: true })).toHaveCount(0);
  const inspect = tech.locator(".order-card").filter({
    has: tech.getByRole("heading", {
      name: "Kiểm tra điều hoà",
      exact: true,
    }),
  });
  await expect(inspect).toBeVisible();
  await tech.screenshot({
    path: "artifacts/maintainer-inspection.png",
    fullPage: true,
  });
  await finish(inspect);
  const repair = tech.locator(".order-card").filter({
    has: tech.getByRole("heading", {
      name: "Sửa chữa máy lạnh",
      exact: true,
    }),
  });
  await expect(repair).toBeVisible();
  await tech.reload();
  await expect(repair).toBeVisible();
  await finish(repair);
  await tenant
    .getByRole("button", { name: "Yêu cầu của tôi", exact: true })
    .click();
  await expect(tenant.locator("tbody .badge.resolved")).toHaveText("Hoàn tất");
  await pms
    .getByRole("button", { name: "Tiến độ & nhật ký", exact: true })
    .click();
  await expect(pms.locator(".run-card .badge.completed")).toBeVisible();
  await pms.screenshot({
    path: "artifacts/pms-run-completed.png",
    fullPage: true,
  });
  await pms
    .getByRole("button", { name: "Thông báo", exact: true })
    .first()
    .click();
  await expect(
    pms.getByRole("button", { name: /Bảo trì đã hoàn tất/ }),
  ).toBeVisible();
  await tenant.reload();
  await expect(tenant.locator("tbody .badge.resolved")).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
test("simultaneous commands serialize and duplicate approval creates one order", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const a = await context.newPage(),
    b = await context.newPage();
  await Promise.all([a.goto("/?app=pms"), b.goto("/?app=tenant")]);
  await expect(a.getByText("Đã đồng bộ", { exact: true })).toBeVisible();
  await Promise.all([
    a.evaluate(async () => {
      const { dispatch } = await import("/src/browser-store.js");
      await dispatch({
        type: "CREATE_TICKET",
        role: "tenant",
        payload: {
          title: "Concurrent A",
          type: "Equipment malfunction",
          priority: "high",
          area: "Workspace",
          location: "A-01",
        },
      });
    }),
    b.evaluate(async () => {
      const { dispatch } = await import("/src/browser-store.js");
      await dispatch({
        type: "CREATE_TICKET",
        role: "tenant",
        payload: {
          title: "Concurrent B",
          type: "Equipment malfunction",
          priority: "high",
          area: "Workspace",
          location: "B-01",
        },
      });
    }),
  ]);
  const rid = await a.evaluate(async () => {
    const st = await import("/src/browser-store.js");
    await st.refresh();
    return st.getSnapshot().runs[0].id;
  });
  const approve = (page) =>
    page.evaluate(async (rid) => {
      const st = await import("/src/browser-store.js");
      try {
        await st.dispatch({
          type: "APPROVE",
          role: "pms",
          payload: { runId: rid },
        });
        return "ok";
      } catch {
        return "rejected";
      }
    }, rid);
  const results = await Promise.all([approve(a), approve(b)]);
  expect(results.sort()).toEqual(["ok", "rejected"]);
  const data = await a.evaluate(async () => {
    const st = await import("/src/browser-store.js");
    await st.refresh();
    return st.getSnapshot();
  });
  expect(data.tickets.length).toBe(2);
  expect(data.workOrders.length).toBe(1);
  expect(data.revision).toBe(3);
  await context.close();
});
test("PMS templates, N-N work orders, grouping and responsive layout", async ({
  page,
}) => {
  await page.goto("/?app=pms");
  await page
    .getByRole("button", { name: "Mẫu công việc", exact: true })
    .click();
  await page.getByRole("button", { name: "Tạo template", exact: true }).click();
  await page.getByLabel("Tên template").fill("Thử nghiệm HVAC");
  await page
    .getByLabel("Checklist (mỗi dòng một bước)")
    .fill("Vệ sinh\nChạy thử");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Thử nghiệm HVAC", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  for (const title of ["Ticket A", "Ticket B"]) {
    await page.getByRole("button", { name: "Tạo ticket", exact: true }).click();
    await page.getByLabel("Tên yêu cầu").fill(title);
    await page.getByLabel("Loại yêu cầu").selectOption("Plumbing");
    await page
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  await page.getByLabel("Chọn Ticket A").check();
  await page.getByLabel("Chọn Ticket B").check();
  await page.getByRole("button", { name: "Gom nhóm (2)" }).click();
  await page.getByLabel("Tên nhóm").fill("Nhóm phòng họp");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  const group = page.locator("tbody[data-ticket-group]").filter({
    has: page.getByRole("button", { name: "Nhóm phòng họp 2 ticket", exact: true }),
  });
  await expect(group.locator(".ticket-child-row")).toHaveCount(2);
  await page.screenshot({ path: "artifacts/ticket-groups-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: "artifacts/ticket-groups-mobile.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const toggle = group.getByRole("button", { name: "Nhóm phòng họp 2 ticket", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(group.locator(".ticket-child-row")).toHaveCount(0);
  await toggle.click();
  await page.getByLabel("Tìm ticket").fill("Ticket A");
  await expect(page.locator(".ticket-group-toggle")).toContainText("1 / 2 ticket");
  await page.getByLabel("Chọn tất cả trong Nhóm phòng họp").check();
  await expect(page.getByRole("button", { name: "Gom nhóm (2)" })).toBeEnabled();
  await page.getByLabel("Chọn tất cả trong Nhóm phòng họp").uncheck();
  await page.getByLabel("Tìm ticket").fill("Nhóm phòng họp");
  await expect(group.locator(".ticket-child-row")).toHaveCount(2);
  await page.getByLabel("Tìm ticket").fill("");
  await page.getByRole("button", { name: "Đưa Ticket A khỏi nhóm", exact: true }).click();
  const ungrouped = page.locator('tbody[data-ticket-group="ungrouped"]');
  await expect(ungrouped.getByRole("button", { name: "Ticket A", exact: true })).toBeVisible();
  await page.reload();
  await expect(ungrouped.getByRole("button", { name: "Ticket A", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nhóm phòng họp 1 ticket", exact: true })).toBeVisible();
  const originalGroupId = await page.locator('tbody[data-ticket-group]').filter({
    has: page.getByRole("button", { name: "Nhóm phòng họp 1 ticket", exact: true }),
  }).getAttribute("data-ticket-group");
  await page.getByLabel("Chọn tất cả trong Nhóm phòng họp").check();
  await page.getByLabel("Chọn tất cả trong Chưa gom nhóm").check();
  await page.getByRole("button", { name: "Gom nhóm (2)" }).click();
  await expect(page.getByLabel("Gom vào nhóm")).toHaveValue(originalGroupId);
  await expect(page.getByLabel("Tên nhóm")).toHaveCount(0);
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.locator(`tbody[data-ticket-group="${originalGroupId}"] .ticket-child-row`)).toHaveCount(2);
  await expect(page.locator(".ticket-group-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(`tbody[data-ticket-group="${originalGroupId}"] .ticket-child-row`)).toHaveCount(2);
  await page.getByRole("button", { name: "Đưa Ticket A khỏi nhóm", exact: true }).click();
  await page.getByRole("button", { name: "Ticket B", exact: true }).click();
  await page.getByRole("dialog", { name: "Chi tiết ticket" }).getByRole("button", { name: "Đưa khỏi nhóm", exact: true }).click();
  await page.getByRole("button", { name: "Đóng chi tiết" }).click();
  await expect(ungrouped.locator(".ticket-child-row")).toHaveCount(2);
  await page.getByLabel("Chọn tất cả trong Chưa gom nhóm").check();
  await page.getByRole("button", { name: "Gom nhóm (2)" }).click();
  await page.getByLabel("Tên nhóm").fill("Nhóm mới");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await page.getByLabel("Chọn tất cả trong Nhóm mới").check();
  await page.getByRole("button", { name: "Đưa khỏi nhóm", exact: true }).click();
  await expect(ungrouped.locator(".ticket-child-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Nhóm mới 2 ticket", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Công việc", exact: true }).click();
  await page
    .getByRole("button", { name: "Tạo work order", exact: true })
    .click();
  await page.getByLabel("Tên công việc").fill("Công việc chung");
  const links = page.getByRole("dialog").getByRole("checkbox");
  for (let i = 0; i < (await links.count()); i++) await links.nth(i).check();
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.locator(".order-card .chip")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?app=tenant");
  await page.screenshot({
    path: "artifacts/tenant-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});
test("Service Worker shows browser notifications after explicit permission", async ({
  browser,
}) => {
  const context = await browser.newContext({ permissions: ["notifications"] });
  const page = await context.newPage();
  await page.goto("/?app=pms&view=notifications");
  await page
    .getByRole("button", { name: "Bật thông báo", exact: true })
    .click();
  await expect(
    page.getByText("Đã bật thông báo trình duyệt", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const st = await import("/src/browser-store.js");
    await st.dispatch({
      type: "CREATE_TICKET",
      role: "tenant",
      payload: {
        title: "Thông báo thử",
        type: "Equipment malfunction",
        priority: "high",
        area: "Living",
        location: "A-03",
      },
    });
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        const ns = await reg.getNotifications();
        return ns.map((n) => ({
          title: n.title,
          body: n.body,
          role: n.data.role,
        }));
      }),
    )
    .toEqual([
      {
        title: "SmartOS · PMS",
        body: "Cần phê duyệt: Thông báo thử · Phê duyệt yêu cầu",
        role: "pms",
      },
    ]);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (const n of await reg.getNotifications()) n.close();
  });
  await context.close();
});
test("storage-event fallback works with BroadcastChannel unavailable; reject and cancel UI", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    delete globalThis.BroadcastChannel;
  });
  const tenant = await context.newPage(),
    pms = await context.newPage();
  await Promise.all([
    tenant.goto("/?app=tenant"),
    pms.goto("/?app=pms&view=notifications"),
  ]);
  await createTicket(tenant, "Ticket bị từ chối");
  await pms.getByRole("button", { name: "Từ chối", exact: true }).click();
  await pms.getByLabel("Lý do từ chối").fill("Sai vị trí thiết bị");
  await pms
    .getByRole("button", { name: "Từ chối yêu cầu", exact: true })
    .click();
  await expect(pms.getByRole("dialog")).toBeHidden();
  const maintainer = await context.newPage();
  await maintainer.goto("/?app=maintainer&view=notifications");
  await expect(maintainer.getByText("Đã đồng bộ", { exact: true })).toBeVisible();
  await expect(maintainer.getByRole("heading", { name: "Hộp thư đang trống", exact: true })).toBeVisible();
  await tenant
    .getByRole("button", { name: "Yêu cầu của tôi", exact: true })
    .click();
  await expect(tenant.locator("tbody .badge.cancelled")).toBeVisible();
  await createTicket(tenant, "Ticket cần hủy");
  await tenant
    .getByRole("button", { name: "Ticket cần hủy", exact: true })
    .click();
  await tenant
    .getByRole("button", { name: "Hủy yêu cầu", exact: true })
    .click();
  await tenant
    .getByRole("button", { name: "Xác nhận hủy", exact: true })
    .click();
  await expect(tenant.locator(".drawer .badge.cancelled")).toBeVisible();
  await tenant.getByRole("button", { name: "Đóng chi tiết" }).click();
  await expect(tenant.locator("tbody .badge.cancelled")).toHaveCount(2);
  await expect(maintainer.locator(".notifications-list")).toContainText("Dừng xử lý ticket: Ticket cần hủy");
  await expect(maintainer.locator(".notifications-list")).not.toContainText("Ticket bị từ chối");
  await context.close();
});
