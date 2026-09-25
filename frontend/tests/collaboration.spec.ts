import { expect, test, type Page } from "@playwright/test";

const uniqueUsername = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 1e6
  ).toString(36)}`;

const registerAccount = async (page: Page, prefix: string) => {
  const username = uniqueUsername(prefix);
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("hunter2pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "My board" })).toBeVisible();
  return username;
};

const signIn = async (page: Page, username: string) => {
  // Logging out remounts the form, so wait for it before typing or the
  // fill can land on an instance that is about to be replaced.
  await expect(
    page.getByRole("heading", { name: "Sign in to Kanban Studio" })
  ).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("hunter2pass");
  await page.getByRole("button", { name: "Sign in" }).click();
};

const addCard = async (page: Page, title: string) => {
  const column = page.getByTestId(/^column-/).first();
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill(title);
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/board/cards") &&
      response.request().method() === "POST"
  );
  await column.getByRole("button", { name: /add card/i }).click();
  await created;
};

test("shares a board, collaborates, and records activity", async ({ page }) => {
  // The invited account has to exist before it can be invited.
  const guest = await registerAccount(page, "guest");
  await page.getByRole("button", { name: "Log out" }).click();
  const owner = await registerAccount(page, "owner");

  await addCard(page, "Shared task");

  // Share with the guest.
  await page.getByRole("button", { name: "Sharing and activity" }).click();
  await expect(page.getByRole("list", { name: "Members" })).toContainText(owner);
  await page.getByLabel("Username to invite").fill(guest);
  const shared = page.waitForResponse(
    (response) =>
      response.url().includes("/members") &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await shared;
  await expect(page.getByRole("list", { name: "Members" })).toContainText(guest);

  // The guest signs in and sees the shared board alongside their own.
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, guest);
  const boards = page.getByRole("navigation", { name: "Boards" });
  await expect(boards.getByRole("button", { name: /^My board/ })).toHaveCount(2);

  // Open the shared board (the second "My board" tab) and comment on the card.
  await boards.getByRole("button", { name: /^My board/ }).nth(1).click();
  await expect(page.getByText("Shared task")).toBeVisible();

  const cardId = await page
    .locator('[data-testid^="card-"]', { hasText: "Shared task" })
    .getAttribute("data-testid");
  const card = page.getByTestId(cardId ?? "");
  await card.getByRole("button", { name: "Edit Shared task" }).click();
  await card.getByLabel("New comment on Shared task").fill("On it");
  const commented = page.waitForResponse(
    (response) =>
      response.url().includes("/comments") &&
      response.request().method() === "POST"
  );
  await card.getByRole("button", { name: "Comment" }).click();
  await commented;
  await expect(card.getByText(/On it/)).toBeVisible();

  // A guest cannot manage members.
  await page.getByRole("button", { name: "Sharing and activity" }).click();
  await expect(page.getByLabel("Username to invite")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Recent activity" })).toContainText(
    "commented on"
  );

  // Back as the owner: the comment count and activity are visible.
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, owner);
  await expect(page.getByText("1 comment")).toBeVisible();

  await page.getByRole("button", { name: "Sharing and activity" }).click();
  const activity = page.getByRole("list", { name: "Recent activity" });
  await expect(activity).toContainText(`shared the board with ${guest}`);
  await expect(activity).toContainText('added "Shared task"');

  // Removing the guest takes the board away from them.
  await page.getByRole("button", { name: `Remove ${guest}` }).click();
  await expect(page.getByRole("list", { name: "Members" })).not.toContainText(
    guest
  );

  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, guest);
  await expect(page.getByText("Shared task")).toHaveCount(0);
});
