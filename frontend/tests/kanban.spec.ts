import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  // The session cookie set by login can lag slightly behind the UI update,
  // so wait for it before issuing any page.request calls that need it.
  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "session_id"
      )
    )
    .toBe(true);
};

const renameColumn = async (page: Page, title: string) => {
  const input = page
    .getByTestId("column-col-backlog")
    .getByLabel("Column title");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/columns/col-backlog") &&
      response.request().method() === "PATCH"
  );
  await input.fill(title);
  await input.press("Enter");
  await responsePromise;
};

const dragCardToColumn = async (
  page: Page,
  cardId: string,
  columnId: string
) => {
  const card = page.getByTestId(`card-${cardId}`);
  const targetColumn = page.getByTestId(`column-${columnId}`);
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/board/cards/${cardId}/move`) &&
      response.request().method() === "POST"
  );
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await responsePromise;
};

const dragCardAfterLastCard = async (
  page: Page,
  cardId: string,
  columnId: string
) => {
  const card = page.getByTestId(`card-${cardId}`);
  const targetColumn = page.getByTestId(`column-${columnId}`);
  const lastCard = targetColumn.locator('[data-testid^="card-"]').last();
  const cardBox = await card.boundingBox();
  const lastCardBox = await lastCard.boundingBox();
  if (!cardBox || !lastCardBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/board/cards/${cardId}/move`) &&
      response.request().method() === "POST"
  );
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    lastCardBox.x + lastCardBox.width / 2,
    lastCardBox.y + lastCardBox.height * 0.95,
    { steps: 12 }
  );
  await page.mouse.up();
  await responsePromise;
};

test("loads the kanban board", async ({ page }) => {
  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const title = `Playwright card ${Date.now()}`;
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(title);
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(title)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  const reloadedColumn = page.getByTestId("column-col-backlog");
  await expect(reloadedColumn.getByText(title)).toBeVisible();
  const reloadedCard = reloadedColumn
    .getByText(title)
    .locator("xpath=ancestor::article");
  const deleteResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards/") &&
      response.request().method() === "DELETE"
  );
  await reloadedCard.getByRole("button", { name: `Delete ${title}` }).click();
  await reloadedCard
    .getByRole("button", { name: `Confirm delete ${title}` })
    .click();
  await deleteResponse;
  await expect(reloadedColumn.getByText(title)).not.toBeVisible();
});

test("persists a column rename after reload", async ({ page }) => {
  await signIn(page);
  await renameColumn(page, "Playwright Queue");
  await page.reload();
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title:")
  ).toHaveValue("Playwright Queue");
  await renameColumn(page, "Backlog");
});

test("persists a card edit after reload", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: "Edit Align roadmap themes" }).click();
  await card
    .getByLabel("Title for Align roadmap themes")
    .fill("Updated roadmap themes");
  await card
    .getByLabel("Details for Align roadmap themes")
    .fill("Updated through the browser.");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/board/cards/card-1") &&
      response.request().method() === "PATCH"
  );
  await card.getByRole("button", { name: "Save" }).click();
  await responsePromise;
  await expect(card.getByText("Updated roadmap themes")).toBeVisible();

  await page.reload();
  const reloadedCard = page.getByTestId("card-card-1");
  await expect(reloadedCard.getByText("Updated roadmap themes")).toBeVisible();
  await reloadedCard.getByRole("button", { name: "Edit Updated roadmap themes" }).click();
  await reloadedCard
    .getByLabel("Title for Updated roadmap themes")
    .fill("Align roadmap themes");
  await reloadedCard
    .getByLabel("Details for Updated roadmap themes")
    .fill("Draft quarterly themes with impact statements and metrics.");
  const restoreResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/board/cards/card-1") &&
      response.request().method() === "PATCH"
  );
  await reloadedCard.getByRole("button", { name: "Save" }).click();
  await restoreResponse;
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const targetColumn = page.getByTestId("column-col-review");
  await dragCardToColumn(page, "card-1", "col-review");
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-1")
  ).toBeVisible();
  await dragCardToColumn(page, "card-1", "col-backlog");
});

test("moves a card to the last position of another column", async ({ page }) => {
  await signIn(page);

  const resetResponse = await page.request.post(
    "/api/board/cards/card-1/move",
    { data: { target_column_id: "col-backlog", position: 0 } }
  );
  expect(resetResponse.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  try {
    const targetColumn = page.getByTestId("column-col-review");
    await dragCardAfterLastCard(page, "card-1", "col-review");

    await expect(targetColumn.locator('[data-testid^="card-"]').last()).toHaveAttribute(
      "data-testid",
      "card-card-1"
    );
    await page.reload();
    const reloadedTargetColumn = page.getByTestId("column-col-review");
    await expect(
      reloadedTargetColumn.locator('[data-testid^="card-"]').last()
    ).toHaveAttribute("data-testid", "card-card-1");
  } finally {
    const cleanupResponse = await page.request.post(
      "/api/board/cards/card-1/move",
      { data: { target_column_id: "col-backlog", position: 0 } }
    );
    expect(cleanupResponse.ok()).toBeTruthy();
  }
});

test("moves a card into an empty column", async ({ page }) => {
  await signIn(page);

  const emptyColumnResponse = await page.request.post(
    "/api/board/cards/card-6/move",
    { data: { target_column_id: "col-backlog", position: 0 } }
  );
  expect(emptyColumnResponse.ok()).toBeTruthy();
  const resetCardResponse = await page.request.post(
    "/api/board/cards/card-1/move",
    { data: { target_column_id: "col-backlog", position: 0 } }
  );
  expect(resetCardResponse.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  try {
    const targetColumn = page.getByTestId("column-col-review");
    await expect(targetColumn.getByText("Drop a card here")).toBeVisible();
    await dragCardToColumn(page, "card-1", "col-review");
    await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
    await page.reload();
    await expect(
      page.getByTestId("column-col-review").getByTestId("card-card-1")
    ).toBeVisible();
  } finally {
    const restoreCardResponse = await page.request.post(
      "/api/board/cards/card-1/move",
      { data: { target_column_id: "col-backlog", position: 0 } }
    );
    expect(restoreCardResponse.ok()).toBeTruthy();
    const restoreEmptyColumnResponse = await page.request.post(
      "/api/board/cards/card-6/move",
      { data: { target_column_id: "col-review", position: 0 } }
    );
    expect(restoreEmptyColumnResponse.ok()).toBeTruthy();
  }
});

test("moves cards with the keyboard", async ({ page }) => {
  await signIn(page);

  // Put the three cards this test steps through in known places.
  const seedLayout = async () => {
    // Each move inserts at position 0, so the last one ends up on top:
    // backlog [card-1, card-2] and discovery [card-3, ...].
    for (const [cardId, columnId] of [
      ["card-3", "col-discovery"],
      ["card-2", "col-backlog"],
      ["card-1", "col-backlog"],
    ] as const) {
      const response = await page.request.post(
        `/api/board/cards/${cardId}/move`,
        { data: { target_column_id: columnId, position: 0 } }
      );
      expect(response.ok()).toBeTruthy();
    }
  };
  await seedLayout();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  const moveWithKeyboard = async (key: "ArrowDown" | "ArrowRight") => {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/cards/card-1/move") &&
        response.request().method() === "POST"
    );
    const card = page.getByTestId("card-card-1");
    await card.focus();
    await page.keyboard.press("Space");
    // Once the drag is live, dnd-kit announces the card as over itself.
    const liveRegion = page.getByRole("status");
    const selfText = "was moved over droppable area card-1.";
    await expect(liveRegion).toContainText(selfText);
    // dnd-kit attaches its keydown listener on a timer after pickup, so an
    // early arrow press can be lost. Press again only while the card is still
    // announced over itself, which means no press has registered yet.
    await expect(async () => {
      if ((await liveRegion.textContent())?.includes(selfText)) {
        await page.keyboard.press(key);
      }
      await expect(liveRegion).not.toContainText(selfText, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await page.keyboard.press("Space");
    await responsePromise;
  };
  const backlogCards = page
    .getByTestId("column-col-backlog")
    .locator('[data-testid^="card-"]');

  try {
    await moveWithKeyboard("ArrowDown");
    await expect(backlogCards.last()).toHaveAttribute("data-testid", "card-card-1");

    await moveWithKeyboard("ArrowRight");
    await expect(
      page.getByTestId("column-col-discovery").getByTestId("card-card-1")
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByTestId("column-col-discovery").getByTestId("card-card-1")
    ).toBeVisible();
  } finally {
    await seedLayout();
  }
});
