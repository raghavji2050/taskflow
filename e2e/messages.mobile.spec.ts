import { test, expect, type Browser, type Page } from "@playwright/test";

// Mobile Messages layout (<640px). Runs against the throwaway CI MySQL only.
// Matched by the iphone-13 / android-small projects (file name ends in mobile.spec.ts).
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const me = { name: "Msg Mobile E2E", email: `msg-mobile-${stamp}@example.com`, password: "e2e-password-123" };
const peer = { name: "Msg Peer E2E", email: `msg-peer-${stamp}@example.com`, password: "e2e-password-123" };
let conversationId = "";

async function register(browser: Browser, u: typeof me) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const page = await ctx.newPage();
  await page.goto("/register");
  await page.getByLabel("Name").fill(u.name);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  return { ctx, page };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(me.email);
  await page.getByLabel("Password", { exact: true }).fill(me.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function noHorizontalScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

async function minTap(page: Page, name: string) {
  const box = await page.getByRole("button", { name, exact: true }).first().boundingBox();
  expect(box, name).not.toBeNull();
  expect(box!.height, name).toBeGreaterThanOrEqual(44);
  expect(box!.width, name).toBeGreaterThanOrEqual(44);
}

test.beforeAll(async ({ browser }) => {
  const p = await register(browser, peer);
  const peerId = (await (await p.page.request.get("/api/auth/session")).json()).user.id as string;
  const m = await register(browser, me);
  const res = await m.page.request.post("/api/conversations", { data: { type: "DIRECT", userId: peerId } });
  expect(res.ok()).toBeTruthy();
  conversationId = (await res.json()).conversation.id;
  const sent = await m.page.request.post(`/api/conversations/${conversationId}/messages`, {
    data: { body: "A long message to check wrapping: https://taskflow-vault.vercel.app/dashboard/board?view=a-very-long-query-string-without-spaces" },
  });
  expect(sent.ok(), await sent.text()).toBeTruthy();
  await p.ctx.close();
  await m.ctx.close();
});

test.afterAll(async ({ browser }) => {
  if (!conversationId) return;
  const page = await browser.newPage();
  await login(page);
  await page.request.delete(`/api/conversations/${conversationId}`);
  await page.close();
});

test("messages: list -> thread -> back, composer visible, no horizontal scroll", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard/messages");
  const list = page.getByTestId("messages-list-pane");
  const thread = page.getByTestId("messages-thread-pane");
  await expect(list).toBeVisible();
  await expect(thread).toBeHidden();
  await noHorizontalScroll(page);
  for (const name of ["Search messages", "New group", "New message"]) await minTap(page, name);

  await list.getByText(peer.name).first().click();
  await expect(thread).toBeVisible();
  await expect(list).toBeHidden();
  await expect(thread.getByText("A long message to check wrapping")).toBeVisible();
  await noHorizontalScroll(page);

  const composer = page.getByTestId("chat-composer");
  await expect(composer).toBeVisible();
  const vp = page.viewportSize()!;
  const cbox = await composer.boundingBox();
  expect(cbox!.y + cbox!.height).toBeLessThanOrEqual(vp.height + 1);
  expect(cbox!.y + cbox!.height).toBeGreaterThan(vp.height - 40);
  for (const name of ["Back to conversations", "Search messages", "Chat options", "More options", "Send message"]) await minTap(page, name);

  const header = await page.getByTestId("chat-thread-header").boundingBox();
  expect(header!.height).toBeLessThanOrEqual(64);

  // Send a message from the composer.
  const text = `hello from phone ${stamp}`;
  await composer.locator('[contenteditable="true"], textarea').first().click();
  await page.keyboard.type(text);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(thread.getByText(text)).toBeVisible();
  await noHorizontalScroll(page);

  await page.getByRole("button", { name: "Back to conversations" }).click();
  await expect(list).toBeVisible();
  await expect(thread).toBeHidden();
  await noHorizontalScroll(page);
});

test("messages: action sheet opens, actions visible in viewport, no overflow, closes", async ({ page }, info) => {
  await login(page);
  await page.goto("/dashboard/messages");
  const thread = page.getByTestId("messages-thread-pane");
  await page.getByTestId("messages-list-pane").getByText(peer.name).first().click();
  const msg = thread.getByText("A long message to check wrapping").first();
  await expect(msg).toBeVisible();
  await thread.getByRole("button", { name: "More actions" }).first().click();

  const shot = process.env.MSGSHEET_SHOT;
  if (shot) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shot}-${info.project.name}.png` });
  }

  const sheet = page.getByTestId("message-actions-sheet");
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(350);
  const vp = page.viewportSize()!;
  for (const name of ["Copy", "Reply", "Forward", "Pin", "Edit", "Delete", "Cancel"]) {
    const b = sheet.getByRole("menuitem", { name, exact: true });
    await expect(b, name).toBeVisible();
    const box = (await b.boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(48);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  }
  await expect(sheet.getByRole("button", { name: "React 👍" })).toBeVisible();
  await expect(sheet.getByTestId("message-actions-preview")).toContainText("A long message");
  const { sw, sh, cw, ch } = await sheet.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
  expect(sw).toBeLessThanOrEqual(cw);
  expect(sh).toBeLessThanOrEqual(ch + 1);
  await noHorizontalScroll(page);

  await sheet.getByRole("menuitem", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await thread.getByRole("button", { name: "More actions" }).first().click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(vp.width / 2, 20);
  await expect(sheet).toBeHidden();
});
