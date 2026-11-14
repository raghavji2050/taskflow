import { expect, test } from "@playwright/test";

test.describe("public landing and help center", () => {
  test("landing shows pricing, FAQ and footer links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^Simple pricing$/ })).toBeVisible();
    await expect(page.getByTestId("pricing-free")).toContainText("₹0");
    await expect(page.getByTestId("pricing-pro")).toContainText("₹299");
    await expect(page.getByTestId("pricing-business")).toContainText("₹999");
    await page.getByText("Is there a free plan?").click();
    await expect(page.getByText(/up to 5 members and 5 projects/).first()).toBeVisible();
    await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "Help center" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("help center lists guides with working anchors", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { level: 1, name: "Help center" })).toBeVisible();
    await page.getByRole("navigation", { name: "Help topics" }).getByRole("link", { name: /Plans and billing/ }).click();
    await expect(page).toHaveURL(/#billing$/);
    await expect(page.locator("#billing")).toContainText("Stripe Checkout");
  });
});
