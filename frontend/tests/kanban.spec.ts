import { expect, test, type Page } from "@playwright/test";
import {
  cardTestId,
  columnTestId,
  createCard,
  registerWorkspace,
  type Workspace,
} from "./support/workspace";

/**
 * Board journeys. Each test registers its own account and seeds only the cards
 * it needs, so no test depends on another's leftovers.
 */

type Board = Workspace & { cardIds: string[] };

const setUpBoard = async (page: Page, titles: string[][]): Promise<Board> => {
  const workspace = await registerWorkspace(page, "board");
  const cardIds: string[] = [];
  for (const [columnIndex, columnTitles] of titles.entries()) {
    for (const title of columnTitles) {
      cardIds.push(
        await createCard(page, workspace.columnIds[columnIndex], title)
      );
    }
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "My board" })).toBeVisible();
  return { ...workspace, cardIds };
};

const renameColumn = async (page: Page, columnId: string, title: string) => {
  const input = page
    .getByTestId(columnTestId(columnId))
    .getByLabel("Column title");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/board/columns/${columnId}`) &&
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
  const card = page.getByTestId(cardTestId(cardId));
  const targetColumn = page.getByTestId(columnTestId(columnId));
  // Boxes are viewport-relative, so make sure both ends are on screen before
  // measuring; the drop point is clamped to stay inside the column.
  await card.scrollIntoViewIfNeeded();
  await targetColumn.scrollIntoViewIfNeeded();
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
    columnBox.y + Math.min(120, columnBox.height / 2),
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
  const card = page.getByTestId(cardTestId(cardId));
  const targetColumn = page.getByTestId(columnTestId(columnId));
  const lastCard = targetColumn.locator('[data-testid^="card-"]').last();
  await card.scrollIntoViewIfNeeded();
  await lastCard.scrollIntoViewIfNeeded();
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
  await registerWorkspace(page, "board");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  const { columnIds } = await setUpBoard(page, []);
  const firstColumn = page.getByTestId(columnTestId(columnIds[0]));
  const title = "Playwright card";

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(title);
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(title)).toBeVisible();

  await page.reload();
  const reloadedColumn = page.getByTestId(columnTestId(columnIds[0]));
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
  const { columnIds } = await setUpBoard(page, []);

  await renameColumn(page, columnIds[0], "Playwright Queue");
  await page.reload();

  await expect(
    page.getByTestId(columnTestId(columnIds[0])).getByLabel("Column title:")
  ).toHaveValue("Playwright Queue");
});

test("persists a card edit after reload", async ({ page }) => {
  const { cardIds } = await setUpBoard(page, [["Align roadmap themes"]]);
  const cardId = cardIds[0];
  const card = page.getByTestId(cardTestId(cardId));

  await card.getByRole("button", { name: "Open Align roadmap themes" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Edit card" }).click();
  await dialog
    .getByLabel("Title for Align roadmap themes")
    .fill("Updated roadmap themes");
  await dialog
    .getByLabel("Details for Align roadmap themes")
    .fill("Updated through the browser.");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/board/cards/${cardId}`) &&
      response.request().method() === "PATCH"
  );
  await dialog.getByRole("button", { name: "Save" }).click();
  await responsePromise;
  await page.keyboard.press("Escape");
  await expect(card.getByText("Updated roadmap themes")).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId(cardTestId(cardId)).getByText("Updated roadmap themes")
  ).toBeVisible();
  await expect(
    page
      .getByTestId(cardTestId(cardId))
      .getByText("Updated through the browser.")
  ).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  const { columnIds, cardIds } = await setUpBoard(page, [["Roadmap themes"]]);
  const reviewColumn = page.getByTestId(columnTestId(columnIds[3]));

  await dragCardToColumn(page, cardIds[0], columnIds[3]);
  await expect(reviewColumn.getByTestId(cardTestId(cardIds[0]))).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByTestId(columnTestId(columnIds[3]))
      .getByTestId(cardTestId(cardIds[0]))
  ).toBeVisible();
});

test("moves a card to the last position of another column", async ({ page }) => {
  const { columnIds, cardIds } = await setUpBoard(page, [
    ["Roadmap themes"],
    [],
    [],
    ["Already in review"],
  ]);
  const targetColumn = page.getByTestId(columnTestId(columnIds[3]));

  await dragCardAfterLastCard(page, cardIds[0], columnIds[3]);

  await expect(
    targetColumn.locator('[data-testid^="card-"]').last()
  ).toHaveAttribute("data-testid", cardTestId(cardIds[0]));

  await page.reload();
  await expect(
    page
      .getByTestId(columnTestId(columnIds[3]))
      .locator('[data-testid^="card-"]')
      .last()
  ).toHaveAttribute("data-testid", cardTestId(cardIds[0]));
});

test("moves a card into an empty column", async ({ page }) => {
  const { columnIds, cardIds } = await setUpBoard(page, [["Roadmap themes"]]);
  const targetColumn = page.getByTestId(columnTestId(columnIds[3]));

  await expect(targetColumn.getByText("Drop a card here")).toBeVisible();
  await dragCardToColumn(page, cardIds[0], columnIds[3]);
  await expect(targetColumn.getByTestId(cardTestId(cardIds[0]))).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByTestId(columnTestId(columnIds[3]))
      .getByTestId(cardTestId(cardIds[0]))
  ).toBeVisible();
});

test("moves cards with the keyboard", async ({ page }) => {
  const { columnIds, cardIds } = await setUpBoard(page, [
    ["First card", "Second card"],
    ["Discovery card"],
  ]);
  const [firstCardId] = cardIds;

  const moveWithKeyboard = async (key: "ArrowDown" | "ArrowRight") => {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/board/cards/${firstCardId}/move`) &&
        response.request().method() === "POST"
    );
    const card = page.getByTestId(cardTestId(firstCardId));
    await card.focus();
    await page.keyboard.press("Space");
    // Once the drag is live, dnd-kit announces the card as over itself.
    const liveRegion = page.getByRole("status");
    const selfText = `was moved over droppable area ${firstCardId}.`;
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
    .getByTestId(columnTestId(columnIds[0]))
    .locator('[data-testid^="card-"]');

  await moveWithKeyboard("ArrowDown");
  await expect(backlogCards.last()).toHaveAttribute(
    "data-testid",
    cardTestId(firstCardId)
  );

  await moveWithKeyboard("ArrowRight");
  await expect(
    page
      .getByTestId(columnTestId(columnIds[1]))
      .getByTestId(cardTestId(firstCardId))
  ).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByTestId(columnTestId(columnIds[1]))
      .getByTestId(cardTestId(firstCardId))
  ).toBeVisible();
});
