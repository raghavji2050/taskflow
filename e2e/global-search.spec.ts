import { test, expect, type Page } from "@playwright/test";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
test.use({ extraHTTPHeaders: { "x-test-client-ip": ip() } });

// Runs against a throwaway MySQL database (CI service container). Never prod.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("Cmd-K searches tasks, projects and docs and opens results", async ({ page, browser }) => {
  const word = `Zephyr${stamp}`;
  await register(page, "Search Owner", `search-${stamp}@example.com`);

  const ws = await page.request.post("/api/workspaces", { data: { name: `Search WS ${stamp}` } });
  expect(ws.status()).toBe(201);
  const workspaceId = (await ws.json()).workspace.id as string;
  const proj = await page.request.post(`/api/workspaces/${workspaceId}/projects`, { data: { name: `${word} Launch` } });
  expect(proj.ok(), await proj.text()).toBeTruthy();
  const projectId = (await proj.json()).project.id as string;
  const task = await page.request.post("/api/tasks", {
    data: { title: `${word} pricing page`, priority: "MEDIUM", status: "PENDING", workspaceId, projectId },
  });
  expect(task.status(), await task.text()).toBe(201);
  const personal = await page.request.post("/api/tasks", {
    data: { title: `Call vendor`, description: `about ${word} invoice`, priority: "LOW", status: "PENDING" },
  });
  expect(personal.status()).toBe(201);
  const doc = await page.request.post("/api/documents", { data: { title: `${word} spec`, workspaceId } });
  expect(doc.ok(), await doc.text()).toBeTruthy();

  // API: grouped results, title matches before description matches.
  const res = await page.request.get(`/api/search?q=${word}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.tasks.map((t: { title: string }) => t.title)).toEqual([`${word} pricing page`, "Call vendor"]);
  expect(body.projects[0]).toMatchObject({ title: `${word} Launch`, href: `/dashboard/projects/${projectId}` });
  expect(body.documents[0].title).toBe(`${word} spec`);
  expect((await (await page.request.get("/api/search?q=a")).json()).tasks).toEqual([]);

  // Another user sees nothing of it.
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-test-client-ip": ip() } });
  const other = await ctx.newPage();
  await register(other, "Search Stranger", `search-other-${stamp}@example.com`);
  const strangerBody = await (await other.request.get(`/api/search?q=${word}`)).json();
  expect([...strangerBody.tasks, ...strangerBody.projects, ...strangerBody.documents]).toEqual([]);
  await ctx.close();

  // UI: Ctrl+K opens the palette, Enter opens the task.
  await page.goto("/dashboard");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search everything" });
  await expect(input).toBeVisible();
  await input.fill(word);
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog.getByRole("option", { name: new RegExp(`^${word} pricing page`) })).toBeVisible();
  await expect(dialog.getByRole("option", { name: new RegExp(`^${word} Launch`) })).toBeVisible();
  await expect(dialog.getByRole("option", { name: new RegExp(`^${word} spec`) })).toBeVisible();
  await input.press("Enter");
  await expect(dialog).toBeHidden();
  const editor = page.getByRole("dialog", { name: "Edit Task" });
  await expect(editor.getByRole("textbox", { name: "Title" })).toHaveValue(`${word} pricing page`, { timeout: 15_000 });
  await page.keyboard.press("Escape");

  // Picking a project navigates to it; page shortcuts work too.
  await page.getByRole("button", { name: "Search everything" }).first().click();
  await input.fill(`${word} Launch`);
  await dialog.getByRole("option", { name: new RegExp(`^${word} Launch`) }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${projectId}`));

  await page.keyboard.press("Control+k");
  await input.fill("insights");
  await dialog.getByRole("option", { name: /^Insights/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/reports\/insights/);
});
