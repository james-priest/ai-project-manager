import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

const getBoard = async (page: Page) => {
  const response = await page.request.get("/api/board");
  expect(response.ok()).toBeTruthy();
  return response.json();
};

const openAssistant = async (page: Page) => {
  await page.getByRole("button", { name: "Open workspace assistant" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

test("asks the assistant and renders a no-op response", async ({ page }) => {
  await signIn(page);
  const board = await getBoard(page);

  await page.route("**/api/ai/chat", async (route) => {
    const requestBody = route.request().postDataJSON();
    expect(requestBody.question).toBe("What should we prioritize next?");
    expect(requestBody.history).toEqual([]);
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

  await expect(sidebar.getByText("The review queue is the next priority.")).toBeVisible();
  await expect(sidebar.getByText("What should we prioritize next?")).toBeVisible();
  await expect(page.getByTestId("card-card-1")).toContainText("Align roadmap themes");
});

test("applies assistant create, edit, and move changes and keeps them after reload", async ({
  page,
}) => {
  await signIn(page);

  const resetCardResponse = await page.request.post(
    "/api/board/cards/card-1/move",
    { data: { target_column_id: "col-backlog", position: 0 } }
  );
  expect(resetCardResponse.ok()).toBeTruthy();
  const resetEditResponse = await page.request.patch("/api/board/cards/card-1", {
    data: {
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
    },
  });
  expect(resetEditResponse.ok()).toBeTruthy();

  let createdCardId: string | undefined;
  await page.route("**/api/ai/chat", async (route) => {
    const requestBody = route.request().postDataJSON();
    expect(requestBody.question).toBe("Update the roadmap for launch.");

    const editResponse = await page.request.patch("/api/board/cards/card-1", {
      data: {
        title: "Align launch themes",
        details: "Tie each theme to a launch outcome.",
      },
    });
    expect(editResponse.ok()).toBeTruthy();
    const moveResponse = await page.request.post(
      "/api/board/cards/card-1/move",
      { data: { target_column_id: "col-review", position: 1 } }
    );
    expect(moveResponse.ok()).toBeTruthy();
    const createResponse = await page.request.post("/api/board/cards", {
      data: {
        column_id: "col-done",
        title: "Publish launch summary",
        details: "Share the completed launch work.",
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    createdCardId = (await createResponse.json()).id;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response: "I updated the roadmap, moved the theme to review, and added the summary.",
        board: await getBoard(page),
        updated: true,
      }),
    });
  });

  try {
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
    await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toContainText(
      "Align launch themes"
    );
    await expect(page.getByText("Publish launch summary")).toBeVisible();

    await page.reload();
    await expect(
      page.getByTestId("column-col-review").getByTestId("card-card-1")
    ).toContainText("Align launch themes");
    await expect(page.getByText("Publish launch summary")).toBeVisible();
  } finally {
    if (createdCardId) {
      const deleteResponse = await page.request.delete(
        `/api/board/cards/${createdCardId}`
      );
      expect(deleteResponse.ok()).toBeTruthy();
    }
    const restoreMoveResponse = await page.request.post(
      "/api/board/cards/card-1/move",
      { data: { target_column_id: "col-backlog", position: 0 } }
    );
    expect(restoreMoveResponse.ok()).toBeTruthy();
    const restoreEditResponse = await page.request.patch(
      "/api/board/cards/card-1",
      {
        data: {
          title: "Align roadmap themes",
          details: "Draft quarterly themes with impact statements and metrics.",
        },
      }
    );
    expect(restoreEditResponse.ok()).toBeTruthy();
  }
});

test("shows an application error when the assistant is unavailable", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "AI service is unavailable." }),
    });
  });

  await openAssistant(page);
  const sidebar = page.getByTestId("ai-chat-sidebar");
  await sidebar.getByRole("textbox", { name: "Your question" }).fill("Can you help?");
  await sidebar.getByRole("button", { name: "Send message" }).click();

  await expect(sidebar.getByRole("alert")).toHaveText("AI service is unavailable.");
});

test("keeps the assistant fixed while scrolling and supports drag and resize", async ({
  page,
}) => {
  await signIn(page);
  await openAssistant(page);

  const dialog = page.getByRole("dialog");
  const initialBox = await dialog.boundingBox();
  if (!initialBox) {
    throw new Error("Unable to resolve assistant position.");
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(
    await page.evaluate(() => window.innerHeight)
  );

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
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
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
  expect(resizedBox.x + resizedBox.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  expect(resizedBox.y + resizedBox.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
});
