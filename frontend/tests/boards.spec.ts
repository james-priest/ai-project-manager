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
  await shipCard.getByRole("button", { name: "Open Ship release" }).click();
  const shipDialog = page.getByRole("dialog");
  await shipDialog.getByRole("button", { name: "Edit card" }).click();
  await shipDialog.getByLabel("Due date for Ship release").fill(dueDate);
  await shipDialog.getByLabel("Assignee for Ship release").fill("Ada");
  await shipDialog.getByLabel("Urgent label for Ship release").check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards/") &&
      response.request().method() === "PATCH"
  );
  await shipDialog.getByRole("button", { name: "Save" }).click();
  await saved;
  await page.keyboard.press("Escape");

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
  await card.getByRole("button", { name: "Open Late task" }).click();
  const lateDialog = page.getByRole("dialog");
  await lateDialog.getByRole("button", { name: "Edit card" }).click();
  await lateDialog.getByLabel("Due date for Late task").fill("2020-01-01");
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards/") &&
      response.request().method() === "PATCH"
  );
  await lateDialog.getByRole("button", { name: "Save" }).click();
  await saved;
  await page.keyboard.press("Escape");

  await expect(card.getByText("Overdue 2020-01-01")).toBeVisible();
});

test("adds, reorders, and deletes columns", async ({ page }) => {
  await registerAccount(page);
  const columnTitles = () =>
    page.getByTestId(/^column-/).evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          node.querySelector<HTMLInputElement>('input[aria-label^="Column title"]')
            ?.value ?? ""
      )
    );

  await expect.poll(columnTitles).toEqual([
    "Backlog",
    "Discovery",
    "In Progress",
    "Review",
    "Done",
  ]);

  // Add a column at the end.
  await page.getByRole("button", { name: "Add a column" }).click();
  await page.getByLabel("New column name").fill("Blocked");
  const added = page.waitForResponse(
    (response) =>
      response.url().includes("/columns") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Add column" }).click();
  await added;
  await expect.poll(columnTitles).toContain("Blocked");

  // Move it to the front.
  for (let step = 5; step > 0; step -= 1) {
    const moved = page.waitForResponse(
      (response) =>
        response.url().includes("/move") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Move Blocked left" }).click();
    await moved;
  }
  await expect.poll(columnTitles).toEqual([
    "Blocked",
    "Backlog",
    "Discovery",
    "In Progress",
    "Review",
    "Done",
  ]);

  // The order survives a reload, then delete the column.
  await page.reload();
  await expect.poll(columnTitles).toHaveLength(6);

  await page.getByRole("button", { name: "Delete Blocked" }).click();
  const deleted = page.waitForResponse(
    (response) =>
      response.url().includes("/columns/") &&
      response.request().method() === "DELETE"
  );
  await page.getByRole("button", { name: "Confirm delete Blocked" }).click();
  await deleted;

  await expect.poll(columnTitles).not.toContain("Blocked");
});

test("creates a board from the sprint template", async ({ page }) => {
  await registerAccount(page);

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Sprint 12");
  await page.getByLabel("Board template").selectOption("sprint");
  await page.getByRole("button", { name: "Add board" }).click();

  await expect(page.getByRole("heading", { name: "Sprint 12" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Column title: Sprint backlog" })
  ).toBeVisible();
  await expect(page.getByTestId(/^column-/)).toHaveCount(4);
});

test("archives a board and restores it", async ({ page }) => {
  await registerAccount(page);
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Old work");
  await page.getByRole("button", { name: "Add board" }).click();
  await expect(page.getByRole("heading", { name: "Old work" })).toBeVisible();

  const boards = page.getByRole("navigation", { name: "Boards" });
  await page.getByRole("button", { name: "Archive Old work" }).click();

  // The archived board drops out of the list and another opens.
  await expect(boards.getByRole("button", { name: /^Old work/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My board" })).toBeVisible();

  await page.getByLabel("Show archived").check();
  const archivedTab = boards.getByRole("button", { name: /^Old work/ });
  await expect(archivedTab).toBeVisible();
  await expect(archivedTab).toContainText("archived");

  await boards.getByRole("button", { name: /^Old work/ }).click();
  await page.getByRole("button", { name: "Restore Old work" }).click();
  await expect(page.getByRole("heading", { name: "Old work" })).toBeVisible();

  await page.getByLabel("Show archived").uncheck();
  await expect(boards.getByRole("button", { name: /^Old work/ })).toBeVisible();
});

test("search shortcut and empty states", async ({ page }) => {
  await registerAccount(page);

  // A fresh board has columns but no cards, so no filter message yet.
  await expect(page.getByText("No cards match these filters.")).toHaveCount(0);

  const backlog = page.getByTestId(/^column-/).first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Findable");
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards") &&
      response.request().method() === "POST"
  );
  await backlog.getByRole("button", { name: /add card/i }).click();
  await created;

  // "/" focuses search from anywhere on the board.
  await page.getByRole("heading", { name: "My board" }).click();
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search cards")).toBeFocused();

  await page.keyboard.type("nothing here");
  await expect(page.getByText("No cards match these filters.")).toBeVisible();

  // Escape clears the query from the search box.
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Search cards")).toHaveValue("");
  await expect(page.getByText("Findable")).toBeVisible();
});

test("a blank board asks for its first column", async ({ page }) => {
  await registerAccount(page);

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("From scratch");
  await page.getByLabel("Board template").selectOption("blank");
  await page.getByRole("button", { name: "Add board" }).click();

  await expect(
    page.getByText("This board has no columns yet. Add one to start planning.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Add a column" }).click();
  await page.getByLabel("New column name").fill("Ideas");
  const added = page.waitForResponse(
    (response) =>
      response.url().includes("/columns") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Add column" }).click();
  await added;

  await expect(
    page.getByRole("textbox", { name: "Column title: Ideas" })
  ).toBeVisible();
  await expect(
    page.getByText("This board has no columns yet. Add one to start planning.")
  ).toHaveCount(0);
});

test("filters cards by due date", async ({ page }) => {
  await registerAccount(page);

  const past = "2020-01-01";
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const soonDate = soon.toISOString().slice(0, 10);

  const backlog = page.getByTestId(/^column-/).first();
  const addCardWithDue = async (title: string, dueDate: string | null) => {
    await backlog.getByRole("button", { name: /add a card/i }).click();
    await backlog.getByPlaceholder("Card title").fill(title);
    const created = page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/cards") &&
        response.request().method() === "POST"
    );
    await backlog.getByRole("button", { name: /add card/i }).click();
    await created;

    if (!dueDate) {
      return;
    }
    const cardId = await page
      .locator('[data-testid^="card-"]', { hasText: title })
      .getAttribute("data-testid");
    const card = page.getByTestId(cardId ?? "");
    await card.getByRole("button", { name: `Open ${title}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit card" }).click();
    await dialog.getByLabel(`Due date for ${title}`).fill(dueDate);
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/cards/") &&
        response.request().method() === "PATCH"
    );
    await dialog.getByRole("button", { name: "Save" }).click();
    await saved;
    await page.keyboard.press("Escape");
  };

  await addCardWithDue("Late task", past);
  await addCardWithDue("Soon task", soonDate);
  await addCardWithDue("Someday task", null);

  const dueFilter = page.getByLabel("Due date filter");

  await dueFilter.selectOption("overdue");
  await expect(page.getByText("Late task")).toBeVisible();
  await expect(page.getByText("Soon task")).toHaveCount(0);
  await expect(page.getByText("1 of 3 cards")).toBeVisible();

  await dueFilter.selectOption("week");
  await expect(page.getByText("Late task")).toBeVisible();
  await expect(page.getByText("Soon task")).toBeVisible();
  await expect(page.getByText("Someday task")).toHaveCount(0);

  await dueFilter.selectOption("none");
  await expect(page.getByText("Someday task")).toBeVisible();
  await expect(page.getByText("Late task")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  // Columns carry their own "N cards" label, so read the toolbar's counter.
  await expect(page.getByLabel("Board filters").getByText("3 cards")).toBeVisible();
});
