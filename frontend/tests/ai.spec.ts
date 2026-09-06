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

  const sidebar = page.getByTestId("ai-chat-sidebar");
  await sidebar.getByRole("textbox", { name: "Your question" }).fill("Can you help?");
  await sidebar.getByRole("button", { name: "Send message" }).click();

  await expect(sidebar.getByRole("alert")).toHaveText("AI service is unavailable.");
});
