import { expect, type Page } from "@playwright/test";

/**
 * Helpers for e2e specs that need their own data.
 *
 * Every run registers a throwaway account, so specs never share the seeded
 * demo board and a failure cannot leave state behind for the next run.
 */

export type Workspace = {
  username: string;
  boardId: string;
  columnIds: string[];
};

const uniqueUsername = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 1e6
  ).toString(36)}`;

export const registerWorkspace = async (
  page: Page,
  prefix = "e2e"
): Promise<Workspace> => {
  const username = uniqueUsername(prefix);
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("hunter2pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "My board" })).toBeVisible();

  // The session cookie can lag the UI, and page.request calls need it.
  await expect
    .poll(async () =>
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "session_id"
      )
    )
    .toBe(true);

  const boards = await page.request.get("/api/boards");
  expect(boards.ok()).toBeTruthy();
  const boardId = (await boards.json())[0].id;
  const board = await page.request.get(`/api/boards/${boardId}`);
  expect(board.ok()).toBeTruthy();
  const columnIds = (await board.json()).columns.map(
    (column: { id: string }) => column.id
  );

  return { username, boardId, columnIds };
};

export const signIn = async (page: Page, username: string) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to Kanban Studio" })
  ).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("hunter2pass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My board" })).toBeVisible();
};

export const createCard = async (
  page: Page,
  columnId: string,
  title: string,
  details = ""
): Promise<string> => {
  const response = await page.request.post("/api/board/cards", {
    data: { column_id: columnId, title, details },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
};

export const getBoard = async (page: Page, boardId: string) => {
  const response = await page.request.get(`/api/boards/${boardId}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

export const cardTestId = (cardId: string) => `card-${cardId}`;

export const columnTestId = (columnId: string) => `column-${columnId}`;
