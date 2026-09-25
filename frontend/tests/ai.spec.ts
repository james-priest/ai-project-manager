import { expect, test, type Page } from "@playwright/test";
import {
  cardTestId,
  columnTestId,
  createCard,
  getBoard,
  registerWorkspace,
  type Workspace,
} from "./support/workspace";

const openAssistant = async (page: Page) => {
  await page.getByRole("button", { name: "Open workspace assistant" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

// Each test gets its own account and cards, so the assistant journeys never
// depend on the seeded demo board or on each other.
const setUpBoard = async (page: Page): Promise<Workspace & { cardId: string }> => {
  const workspace = await registerWorkspace(page, "ai");
  const cardId = await createCard(
    page,
    workspace.columnIds[0],
    "Align roadmap themes",
    "Draft quarterly themes with impact statements and metrics."
  );
  await page.reload();
  await expect(page.getByTestId(cardTestId(cardId))).toBeVisible();
  return { ...workspace, cardId };
};

test("asks the assistant and renders a no-op response", async ({ page }) => {
  const { boardId, cardId } = await setUpBoard(page);
  const board = await getBoard(page, boardId);

  await page.route("**/api/ai/chat", async (route) => {
    const requestBody = route.request().postDataJSON();
    expect(requestBody.question).toBe("What should we prioritize next?");
    expect(requestBody.history).toEqual([]);
    expect(requestBody.board_id).toBe(boardId);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response: "The review queue is the next priority.",
        board,
        updated: false,
      }),
    });
  });

  await openAssistant(page);
  const sidebar = page.getByTestId("ai-chat-sidebar");
  await expect(sidebar).toBeVisible();
  await sidebar
    .getByRole("textbox", { name: "Your question" })
    .fill("What should we prioritize next?");
  await sidebar.getByRole("button", { name: "Send message" }).click();

  await expect(
    sidebar.getByText("The review queue is the next priority.")
  ).toBeVisible();
  await expect(
    sidebar.getByText("What should we prioritize next?")
  ).toBeVisible();
  await expect(page.getByTestId(cardTestId(cardId))).toContainText(
    "Align roadmap themes"
  );
});

test("applies assistant create, edit, and move changes and keeps them after reload", async ({
  page,
}) => {
  const { boardId, columnIds, cardId } = await setUpBoard(page);
  const reviewColumn = columnIds[3];
  const doneColumn = columnIds[4];

  await page.route("**/api/ai/chat", async (route) => {
    const requestBody = route.request().postDataJSON();
    expect(requestBody.question).toBe("Update the roadmap for launch.");

    // Stand in for the model by applying real changes through the API.
    const editResponse = await page.request.patch(
      `/api/board/cards/${cardId}`,
      {
        data: {
          title: "Align launch themes",
          details: "Tie each theme to a launch outcome.",
        },
      }
    );
    expect(editResponse.ok()).toBeTruthy();
    const moveResponse = await page.request.post(
      `/api/board/cards/${cardId}/move`,
      { data: { target_column_id: reviewColumn, position: 0 } }
    );
    expect(moveResponse.ok()).toBeTruthy();
    await createCard(
      page,
      doneColumn,
      "Publish launch summary",
      "Share the completed launch work."
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response:
          "I updated the roadmap, moved the theme to review, and added the summary.",
        board: await getBoard(page, boardId),
        updated: true,
      }),
    });
  });

  await openAssistant(page);
  const sidebar = page.getByTestId("ai-chat-sidebar");
  await sidebar
    .getByRole("textbox", { name: "Your question" })
    .fill("Update the roadmap for launch.");
  await sidebar.getByRole("button", { name: "Send message" }).click();

  await expect(
    sidebar.getByText(
      "I updated the roadmap, moved the theme to review, and added the summary."
    )
  ).toBeVisible();
  await expect(
    page.getByTestId(columnTestId(reviewColumn)).getByTestId(cardTestId(cardId))
  ).toContainText("Align launch themes");
  await expect(page.getByText("Publish launch summary")).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId(columnTestId(reviewColumn)).getByTestId(cardTestId(cardId))
  ).toContainText("Align launch themes");
  await expect(page.getByText("Publish launch summary")).toBeVisible();
});

test("shows an application error when the assistant is unavailable", async ({
  page,
}) => {
  await registerWorkspace(page, "ai");
  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "AI service is unavailable." }),
    });
  });

  await openAssistant(page);
  const sidebar = page.getByTestId("ai-chat-sidebar");
  await sidebar
    .getByRole("textbox", { name: "Your question" })
    .fill("Can you help?");
  await sidebar.getByRole("button", { name: "Send message" }).click();

  await expect(sidebar.getByRole("alert")).toHaveText(
    "AI service is unavailable."
  );
});

test("keeps the assistant fixed while scrolling and supports drag and resize", async ({
  page,
}) => {
  const workspace = await registerWorkspace(page, "ai");
  // Enough cards to make the page scroll.
  for (const title of ["One", "Two", "Three", "Four", "Five", "Six"]) {
    await createCard(page, workspace.columnIds[0], title);
  }
  await page.reload();
  await expect(page.getByText("Six")).toBeVisible();

  await openAssistant(page);

  const dialog = page.getByRole("dialog");
  const initialBox = await dialog.boundingBox();
  if (!initialBox) {
    throw new Error("Unable to resolve assistant position.");
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight)
  ).toBeGreaterThan(await page.evaluate(() => window.innerHeight));

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const scrolledBox = await dialog.boundingBox();
  if (!scrolledBox) {
    throw new Error("Unable to resolve assistant position after scrolling.");
  }
  expect(scrolledBox.x).toBeCloseTo(initialBox.x, 0);
  expect(scrolledBox.y).toBeCloseTo(initialBox.y, 0);

  const dragHandle = page.getByTestId("ai-chat-drag-handle");
  const dragBox = await dragHandle.boundingBox();
  if (!dragBox) {
    throw new Error("Unable to resolve assistant drag handle.");
  }
  await page.mouse.move(
    dragBox.x + dragBox.width / 2,
    dragBox.y + dragBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(dragBox.x - 80, dragBox.y - 60, { steps: 8 });
  await page.mouse.up();
  const movedBox = await dialog.boundingBox();
  if (!movedBox) {
    throw new Error("Unable to resolve assistant position after dragging.");
  }
  expect(movedBox.x).toBeLessThan(scrolledBox.x);
  expect(movedBox.y).toBeLessThan(scrolledBox.y);

  const resizeHandle = page.getByTestId("ai-chat-resize-handle");
  const resizeBox = await resizeHandle.boundingBox();
  if (!resizeBox) {
    throw new Error("Unable to resolve assistant resize handle.");
  }
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2,
    resizeBox.y + resizeBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 50, resizeBox.y + 40, { steps: 8 });
  await page.mouse.up();
  const resizedBox = await dialog.boundingBox();
  if (!resizedBox) {
    throw new Error("Unable to resolve assistant after resizing.");
  }
  expect(resizedBox.width).toBeGreaterThan(movedBox.width);
  expect(resizedBox.height).toBeGreaterThan(movedBox.height);
  expect(resizedBox.x).toBeGreaterThanOrEqual(0);
  expect(resizedBox.y).toBeGreaterThanOrEqual(0);
  expect(resizedBox.x + resizedBox.width).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth)
  );
  expect(resizedBox.y + resizedBox.height).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight)
  );
});
