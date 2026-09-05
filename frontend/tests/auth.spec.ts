import { expect, test } from "@playwright/test";

test("requires valid credentials before showing the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid username or password." })
  ).toHaveText("Invalid username or password.");

  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("logs out and blocks access until signing in again", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});
