import { expect, test } from "@playwright/test";
import { cardTestId, createCard, registerWorkspace } from "./support/workspace";

test("collects assigned cards from every board and opens one", async ({
  page,
}) => {
  const workspace = await registerWorkspace(page, "mywork");
  const username = workspace.username;

  // A second board, so the list has to reach across boards.
  const secondBoard = await page.request.post("/api/boards", {
    data: { title: "Launch plan", template: "kanban" },
  });
  expect(secondBoard.ok()).toBeTruthy();
  const secondBoardId = (await secondBoard.json()).id;
  const secondColumns = await page.request.get(`/api/boards/${secondBoardId}`);
  const secondColumnId = (await secondColumns.json()).columns[0].id;

  // One card assigned here, one on the other board, one for somebody else.
  const mineHere = await createCard(page, workspace.columnIds[0], "Write spec");
  await page.request.patch(`/api/board/cards/${mineHere}`, {
    data: {
      title: "Write spec",
      details: "",
      assignee: username,
      due_date: "2020-01-01",
    },
  });
  const mineThere = await createCard(page, secondColumnId, "Book venue");
  await page.request.patch(`/api/board/cards/${mineThere}`, {
    data: { title: "Book venue", details: "", assignee: username },
  });
  await createCard(page, workspace.columnIds[0], "Someone else's job");

  await page.reload();
  await page.getByRole("button", { name: /My work/ }).click();

  const tasks = page.getByRole("list", { name: "Assigned cards" });
  await expect(tasks.getByRole("listitem")).toHaveCount(2);
  // The overdue card sorts first and is flagged.
  await expect(tasks.getByRole("listitem").first()).toContainText("Write spec");
  await expect(tasks.getByRole("listitem").first()).toContainText(
    "Overdue 2020-01-01"
  );
  await expect(tasks).not.toContainText("Someone else's job");
  await expect(page.getByText("1 overdue")).toBeVisible();

  // Opening the other board's task switches board and opens the card.
  await tasks.getByRole("button", { name: /Book venue/ }).click();
  await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Card details for Book venue");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId(cardTestId(mineThere))).toBeVisible();
});

test("assigns a card from the member suggestions", async ({ page }) => {
  const workspace = await registerWorkspace(page, "mywork");
  const cardId = await createCard(page, workspace.columnIds[0], "Pick an owner");
  await page.reload();

  await page
    .getByTestId(cardTestId(cardId))
    .getByRole("button", { name: "Open Pick an owner" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Edit card" }).click();

  // The assignee field offers board members through a datalist.
  const assignee = dialog.getByLabel("Assignee for Pick an owner");
  const listId = await assignee.getAttribute("list");
  expect(listId).toBeTruthy();
  await expect(
    page.locator(`#${listId} option[value="${workspace.username}"]`)
  ).toHaveCount(1);

  await assignee.fill(workspace.username);
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/board/cards/${cardId}`) &&
      response.request().method() === "PATCH"
  );
  await dialog.getByRole("button", { name: "Save" }).click();
  await saved;
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /My work/ }).click();
  await expect(
    page.getByRole("list", { name: "Assigned cards" })
  ).toContainText("Pick an owner");
});
