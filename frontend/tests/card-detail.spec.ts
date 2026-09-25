import { expect, test } from "@playwright/test";
import { cardTestId, createCard, registerWorkspace } from "./support/workspace";

test("opens a card, edits it with markdown, and comments", async ({ page }) => {
  const workspace = await registerWorkspace(page, "detail");
  const cardId = await createCard(page, workspace.columnIds[0], "Ship release");
  await page.request.post(`/api/boards/${workspace.boardId}/labels`, {
    data: { name: "Urgent", color: "purple" },
  });
  await page.reload();

  await page
    .getByTestId(cardTestId(cardId))
    .getByRole("button", { name: "Open Ship release" })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("No details yet.")).toBeVisible();

  // Edit with markdown, a due date, an assignee, and a label.
  await dialog.getByRole("button", { name: "Edit card" }).click();
  await dialog
    .getByLabel("Details for Ship release")
    .fill("## Release steps\n\n- cut the tag\n- publish notes");
  await dialog.getByLabel("Due date for Ship release").fill("2027-03-01");
  await dialog.getByLabel("Assignee for Ship release").fill("Ada");
  await dialog.getByLabel("Urgent label for Ship release").check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/board/cards/${cardId}`) &&
      response.request().method() === "PATCH"
  );
  await dialog.getByRole("button", { name: "Save" }).click();
  await saved;

  // The description renders as markdown, not as raw text.
  const description = dialog.getByTestId("card-description");
  await expect(
    description.getByRole("heading", { name: "Release steps" })
  ).toBeVisible();
  await expect(description.getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByText(/Due 2027-03-01/)).toBeVisible();

  // Comment from inside the dialog.
  await dialog.getByLabel("New comment on Ship release").fill("Starting now");
  const commented = page.waitForResponse(
    (response) =>
      response.url().includes("/comments") &&
      response.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: "Comment" }).click();
  await commented;
  await expect(dialog.getByText(/Starting now/)).toBeVisible();

  // Close with Escape; the card face shows the new metadata.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const card = page.getByTestId(cardTestId(cardId));
  await expect(card.getByText("Urgent")).toBeVisible();
  await expect(card.getByText("Ada")).toBeVisible();
  await expect(card.getByText("1 comment")).toBeVisible();

  // Everything survives a reload.
  await page.reload();
  await page
    .getByTestId(cardTestId(cardId))
    .getByRole("button", { name: "Open Ship release" })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Release steps" })
  ).toBeVisible();
});

test("deletes a card from its detail dialog", async ({ page }) => {
  const workspace = await registerWorkspace(page, "detail");
  const cardId = await createCard(page, workspace.columnIds[0], "Throwaway");
  await page.reload();

  await page
    .getByTestId(cardTestId(cardId))
    .getByRole("button", { name: "Open Throwaway" })
    .click();
  const deleted = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards/") &&
      response.request().method() === "DELETE"
  );
  await page.getByRole("dialog").getByRole("button", { name: "Delete card" }).click();
  await deleted;

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Throwaway")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Throwaway")).toHaveCount(0);
});

test("tracks steps on a card checklist", async ({ page }) => {
  const workspace = await registerWorkspace(page, "detail");
  const cardId = await createCard(page, workspace.columnIds[0], "Release plan");
  await page.reload();

  const card = page.getByTestId(cardTestId(cardId));
  await card.getByRole("button", { name: "Open Release plan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("No steps yet.")).toBeVisible();

  for (const step of ["Cut the tag", "Publish notes"]) {
    await dialog.getByLabel("New checklist step for Release plan").fill(step);
    const added = page.waitForResponse(
      (response) =>
        response.url().includes("/checklist") &&
        response.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "Add step" }).click();
    await added;
  }
  await expect(dialog.getByText("0/2")).toBeVisible();

  const ticked = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/checklist/") &&
      response.request().method() === "PATCH"
  );
  // getByLabel would also match "Remove step Cut the tag".
  await dialog.getByRole("checkbox", { name: "Cut the tag" }).check();
  await ticked;
  await expect(dialog.getByText("1/2")).toBeVisible();

  // The card face shows the same progress.
  await page.keyboard.press("Escape");
  await expect(card.getByText("1/2 done")).toBeVisible();

  // And it survives a reload.
  await page.reload();
  await expect(page.getByTestId(cardTestId(cardId))).toContainText("1/2 done");

  // Removing a step updates the count.
  await page
    .getByTestId(cardTestId(cardId))
    .getByRole("button", { name: "Open Release plan" })
    .click();
  const removed = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/checklist/") &&
      response.request().method() === "DELETE"
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove step Publish notes" })
    .click();
  await removed;
  await expect(page.getByRole("dialog").getByText("1/1")).toBeVisible();
});
