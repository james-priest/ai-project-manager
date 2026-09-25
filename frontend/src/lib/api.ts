import type { BoardData, Column, Label, LabelColor } from "@/lib/kanban";

export type CardFields = {
  dueDate: string | null;
  assignee: string;
  labelIds: string[];
};

export type AuthResponse = {
  authenticated: boolean;
  username: string;
};

export type CardMutationResponse = {
  id: string;
};

export type BoardSummary = {
  id: string;
  title: string;
  cardCount: number;
  updatedAt: string;
  role: "owner" | "editor";
  memberCount: number;
  archived: boolean;
};

export const BOARD_TEMPLATES = ["kanban", "sprint", "blank"] as const;

export type BoardTemplate = (typeof BOARD_TEMPLATES)[number];

export type BoardMember = {
  username: string;
  role: "owner" | "editor";
};

export type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type AssignedCard = {
  cardId: string;
  title: string;
  boardId: string;
  boardTitle: string;
  columnTitle: string;
  dueDate: string | null;
  labels: Label[];
};

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type ActivityEntry = {
  id: string;
  actor: string;
  summary: string;
  createdAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResponse = {
  response: string;
  board: BoardData;
  updated: boolean;
};

export const emptyCardFields: CardFields = {
  dueDate: null,
  assignee: "",
  labelIds: [],
};

// Optimistic local cards start with no comments; the server count arrives
// with the next board load.
export const newCardDefaults = {
  ...emptyCardFields,
  commentCount: 0,
  checklistDone: 0,
  checklistTotal: 0,
};

export class ApiError extends Error {
  status: number;
  /** True when the server explained the failure, rather than only a status. */
  hasDetail: boolean;

  constructor(message: string, status: number, hasDetail = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.hasDetail = hasDetail;
  }
}

const request = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;
    let hasDetail = false;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
        hasDetail = true;
      }
    } catch {
      // Use the status-based message when the response has no JSON body.
    }
    throw new ApiError(detail, response.status, hasDetail);
  }

  return (await response.json()) as T;
};

const jsonRequest = <T>(path: string, body: unknown, method: string) =>
  request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const api = {
  getCurrentUser: () => request<AuthResponse>("/api/auth/me"),

  register: (username: string, password: string) =>
    jsonRequest<AuthResponse>(
      "/api/auth/register",
      { username, password },
      "POST"
    ),

  login: (username: string, password: string) =>
    jsonRequest<AuthResponse>(
      "/api/auth/login",
      { username, password },
      "POST"
    ),

  logout: () => request<{ authenticated: false }>("/api/auth/logout", { method: "POST" }),

  listBoards: (includeArchived = false) =>
    request<BoardSummary[]>(
      includeArchived ? "/api/boards?include_archived=true" : "/api/boards"
    ),

  createBoard: (title: string, template: BoardTemplate = "kanban") =>
    jsonRequest<BoardSummary>("/api/boards", { title, template }, "POST"),

  archiveBoard: (boardId: string, archived: boolean) =>
    jsonRequest<{ archived: boolean }>(
      `/api/boards/${encodeURIComponent(boardId)}/${
        archived ? "archive" : "unarchive"
      }`,
      {},
      "POST"
    ),

  createColumn: (boardId: string, title: string) =>
    jsonRequest<Column>(
      `/api/boards/${encodeURIComponent(boardId)}/columns`,
      { title },
      "POST"
    ),

  deleteColumn: (columnId: string) =>
    request<{ deleted: true }>(
      `/api/board/columns/${encodeURIComponent(columnId)}`,
      { method: "DELETE" }
    ),

  moveColumn: (columnId: string, position: number) =>
    jsonRequest<{ moved: true }>(
      `/api/board/columns/${encodeURIComponent(columnId)}/move`,
      { position },
      "POST"
    ),

  renameBoard: (boardId: string, title: string) =>
    jsonRequest<{ updated: true }>(
      `/api/boards/${encodeURIComponent(boardId)}`,
      { title },
      "PATCH"
    ),

  deleteBoard: (boardId: string) =>
    request<{ deleted: true }>(`/api/boards/${encodeURIComponent(boardId)}`, {
      method: "DELETE",
    }),

  getBoard: (boardId: string) =>
    request<BoardData>(`/api/boards/${encodeURIComponent(boardId)}`),

  renameColumn: (columnId: string, title: string) =>
    jsonRequest<{ updated: true }>(
      `/api/board/columns/${encodeURIComponent(columnId)}`,
      { title },
      "PATCH"
    ),

  createCard: (
    columnId: string,
    title: string,
    details: string,
    fields: CardFields = emptyCardFields
  ) =>
    jsonRequest<CardMutationResponse>(
      "/api/board/cards",
      {
        column_id: columnId,
        title,
        details,
        due_date: fields.dueDate,
        assignee: fields.assignee,
        label_ids: fields.labelIds,
      },
      "POST"
    ),

  updateCard: (
    cardId: string,
    title: string,
    details: string,
    fields: CardFields = emptyCardFields
  ) =>
    jsonRequest<{ updated: true }>(
      `/api/board/cards/${encodeURIComponent(cardId)}`,
      {
        title,
        details,
        due_date: fields.dueDate,
        assignee: fields.assignee,
        label_ids: fields.labelIds,
      },
      "PATCH"
    ),

  listMembers: (boardId: string) =>
    request<BoardMember[]>(
      `/api/boards/${encodeURIComponent(boardId)}/members`
    ),

  addMember: (boardId: string, username: string) =>
    jsonRequest<BoardMember>(
      `/api/boards/${encodeURIComponent(boardId)}/members`,
      { username },
      "POST"
    ),

  removeMember: (boardId: string, username: string) =>
    request<{ removed: true }>(
      `/api/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(
        username
      )}`,
      { method: "DELETE" }
    ),

  listMyTasks: () => request<AssignedCard[]>("/api/me/tasks"),

  listActivity: (boardId: string) =>
    request<ActivityEntry[]>(
      `/api/boards/${encodeURIComponent(boardId)}/activity`
    ),

  listChecklist: (cardId: string) =>
    request<ChecklistItem[]>(
      `/api/board/cards/${encodeURIComponent(cardId)}/checklist`
    ),

  addChecklistItem: (cardId: string, text: string) =>
    jsonRequest<ChecklistItem>(
      `/api/board/cards/${encodeURIComponent(cardId)}/checklist`,
      { text },
      "POST"
    ),

  setChecklistItemDone: (itemId: string, done: boolean) =>
    jsonRequest<{ updated: true }>(
      `/api/board/checklist/${encodeURIComponent(itemId)}`,
      { done },
      "PATCH"
    ),

  deleteChecklistItem: (itemId: string) =>
    request<{ deleted: true }>(
      `/api/board/checklist/${encodeURIComponent(itemId)}`,
      { method: "DELETE" }
    ),

  listComments: (cardId: string) =>
    request<Comment[]>(
      `/api/board/cards/${encodeURIComponent(cardId)}/comments`
    ),

  addComment: (cardId: string, body: string) =>
    jsonRequest<Comment>(
      `/api/board/cards/${encodeURIComponent(cardId)}/comments`,
      { body },
      "POST"
    ),

  deleteComment: (commentId: string) =>
    request<{ deleted: true }>(
      `/api/board/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" }
    ),

  createLabel: (boardId: string, name: string, color: LabelColor) =>
    jsonRequest<Label>(
      `/api/boards/${encodeURIComponent(boardId)}/labels`,
      { name, color },
      "POST"
    ),

  deleteLabel: (boardId: string, labelId: string) =>
    request<{ deleted: true }>(
      `/api/boards/${encodeURIComponent(boardId)}/labels/${encodeURIComponent(
        labelId
      )}`,
      { method: "DELETE" }
    ),

  deleteCard: (cardId: string) =>
    request<{ deleted: true }>(
      `/api/board/cards/${encodeURIComponent(cardId)}`,
      { method: "DELETE" }
    ),

  moveCard: (cardId: string, targetColumnId: string, position: number) =>
    jsonRequest<{ moved: true }>(
      `/api/board/cards/${encodeURIComponent(cardId)}/move`,
      { target_column_id: targetColumnId, position },
      "POST"
    ),

  chat: (question: string, history: ChatMessage[], boardId: string) =>
    jsonRequest<AIChatResponse>(
      "/api/ai/chat",
      { question, history, board_id: boardId },
      "POST"
    ),
};

// Prefer what the server said, but fall back to wording that fits the action
// when all we have is a bare status code.
export const getApiErrorMessage = (
  error: unknown,
  fallback: string
): string =>
  error instanceof ApiError && error.hasDetail ? error.message : fallback;

export const isSessionExpiredError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401;
