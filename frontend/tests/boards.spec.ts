import { expect, test, type Page } from "@playwright/test";

// Each run registers its own account, so these journeys never collide with the
// seeded demo board or with each other.
const uniqueUsername = () =>
  `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

const registerAccount = async (page: Page) => {
  const username = uniqueUsername();
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("hunter2pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "My board" })).toBeVisible();
  return username;
};

const boardTab = (page: Page, title: string) =>
  page
    .getByRole("navigation", { name: "Boards" })
    .getByRole("button", { name: new RegExp(`^${title}`) });

test("registers an account and opens an empty starter board", async ({ page }) => {
  await registerAccount(page);

  await expect(page.getByTestId(/^column-/)).toHaveCount(5);
  await expect(page.getByTestId(/^card-/)).toHaveCount(0);
  await expect(boardTab(page, "My board")).toHaveAttribute("aria-current", "true");
});

test("rejects a username that is already taken", async ({ page }) => {
  const username = await registerAccount(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Kanban Studio" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("hunter2pass");
  await page.getByRole("button", { name: "Create account" }).click();

  // Next renders an always-present empty route announcer with role=alert, so
  // assert on the message itself.
  await expect(page.getByText("That username is already taken.")).toBeVisible();
});

test("signs back in and sees the same boards", async ({ page }) => {
  const username = await registerAccount(page);
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Launch plan");
  await page.getByRole("button", { name: "Add board" }).click();
  await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Kanban Studio" })
  ).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("hunter2pass");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(boardTab(page, "My board")).toBeVisible();
  await expect(boardTab(page, "Launch plan")).toBeVisible();
});

test("keeps cards separate per board", async ({ page }) => {
  await registerAccount(page);

  const backlog = page.getByTestId(/^column-/).first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("First board task");
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards") &&
      response.request().method() === "POST"
  );
  await backlog.getByRole("button", { name: /add card/i }).click();
  await created;

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Launch plan");
  await page.getByRole("button", { name: "Add board" }).click();

  await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();
  await expect(page.getByText("First board task")).toHaveCount(0);

  await boardTab(page, "My board").click();
  await expect(page.getByText("First board task")).toBeVisible();

  await page.reload();
  await expect(page.getByText("First board task")).toBeVisible();
});

test("renames and deletes a board", async ({ page }) => {
  await registerAccount(page);

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Temporary");
  await page.getByRole("button", { name: "Add board" }).click();
  await expect(page.getByRole("heading", { name: "Temporary" })).toBeVisible();

  await page.getByRole("button", { name: "Rename Temporary" }).click();
  const renameInput = page.getByLabel("New name for Temporary");
  await renameInput.fill("Hiring");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Hiring" })).toBeVisible();

  await page.getByRole("button", { name: "Delete Hiring" }).click();
  await page.getByRole("button", { name: "Confirm delete Hiring" }).click();

  await expect(page.getByRole("heading", { name: "My board" })).toBeVisible();
  await expect(boardTab(page, "Hiring")).toHaveCount(0);
});

test("the last board cannot be deleted", async ({ page }) => {
  await registerAccount(page);

  await expect(
    page.getByRole("button", { name: "Delete My board" })
  ).toHaveCount(0);
});

test("labels, due dates, assignees, and filtering", async ({ page }) => {
  await registerAccount(page);

  // Relative to today so the card reads as upcoming rather than overdue.
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const dueDate = nextYear.toISOString().slice(0, 10);

  // Add two cards to filter between.
  const backlog = page.getByTestId(/^column-/).first();
  for (const title of ["Ship release", "Write docs"]) {
    await backlog.getByRole("button", { name: /add a card/i }).click();
    await backlog.getByPlaceholder("Card title").fill(title);
    const created = page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/cards") &&
        response.request().method() === "POST"
    );
    await backlog.getByRole("button", { name: /add card/i }).click();
    await created;
  }

  // Create a label from the toolbar.
  await page.getByRole("button", { name: "Labels" }).click();
  await page.getByLabel("New label name").fill("Urgent");
  await page.getByLabel("New label color").selectOption("purple");
  const labelCreated = page.waitForResponse(
    (response) =>
      response.url().includes("/labels") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Add label" }).click();
  await labelCreated;

  // Tag one card and give it a due date and assignee.
  // Pin the card by test id: while editing, its title lives in an input value
  // rather than in text, so a hasText locator would stop matching.
  const shipCardId = await page
    .locator('[data-testid^="card-"]', { hasText: "Ship release" })
    .getAttribute("data-testid");
  const shipCard = page.getByTestId(shipCardId ?? "");
  await shipCard.getByRole("button", { name: "Edit Ship release" }).click();
  await shipCard.getByLabel("Due date for Ship release").fill(dueDate);
  await shipCard.getByLabel("Assignee for Ship release").fill("Ada");
  await shipCard.getByLabel("Urgent label for Ship release").check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards/") &&
      response.request().method() === "PATCH"
  );
  await shipCard.getByRole("button", { name: "Save" }).click();
  await saved;

  await expect(shipCard.getByText("Urgent")).toBeVisible();
  await expect(shipCard.getByText("Ada")).toBeVisible();
  await expect(shipCard.getByText(`Due ${dueDate}`)).toBeVisible();

  // Everything survives a reload.
  await page.reload();
  await expect(
    page.locator('[data-testid^="card-"]', { hasText: "Ship release" })
  ).toContainText("Ada");

  // Filter by text, then by label.
  await page.getByLabel("Search cards").fill("docs");
  await expect(page.getByText("Write docs")).toBeVisible();
  await expect(page.getByText("Ship release")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByLabel("Board filters")
    .getByRole("button", { name: "Urgent" })
    .click();
  await expect(page.getByText("Ship release")).toBeVisible();
  await expect(page.getByText("Write docs")).toHaveCount(0);
  await expect(page.getByText("1 of 2 cards")).toBeVisible();
});

test("marks a past due date as overdue", async ({ page }) => {
  await registerAccount(page);

  const backlog = page.getByTestId(/^column-/).first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Late task");
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards") &&
      response.request().method() === "POST"
  );
  await backlog.getByRole("button", { name: /add card/i }).click();
  await created;

  const cardId = await page
    .locator('[data-testid^="card-"]', { hasText: "Late task" })
    .getAttribute("data-testid");
  const card = page.getByTestId(cardId ?? "");
  await card.getByRole("button", { name: "Edit Late task" }).click();
  await card.getByLabel("Due date for Late task").fill("2020-01-01");
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards/") &&
      response.request().method() === "PATCH"
  );
  await card.getByRole("button", { name: "Save" }).click();
  await saved;

  await expect(card.getByText("Overdue 2020-01-01")).toBeVisible();
});
