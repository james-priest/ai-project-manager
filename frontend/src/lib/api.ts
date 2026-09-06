import type { BoardData } from "@/lib/kanban";

export type AuthResponse = {
  authenticated: boolean;
  username: string;
};

export type CardMutationResponse = {
  id: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // Use the status-based message when the response has no JSON body.
    }
    throw new ApiError(detail, response.status);
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

  login: (username: string, password: string) =>
    jsonRequest<AuthResponse>(
      "/api/auth/login",
      { username, password },
      "POST"
    ),

  logout: () => request<{ authenticated: false }>("/api/auth/logout", { method: "POST" }),

  getBoard: () => request<BoardData>("/api/board"),

  renameColumn: (columnId: string, title: string) =>
    jsonRequest<{ updated: true }>(
      `/api/board/columns/${encodeURIComponent(columnId)}`,
      { title },
      "PATCH"
    ),

  createCard: (columnId: string, title: string, details: string) =>
    jsonRequest<CardMutationResponse>(
      "/api/board/cards",
      { column_id: columnId, title, details },
      "POST"
    ),

  updateCard: (cardId: string, title: string, details: string) =>
    jsonRequest<{ updated: true }>(
      `/api/board/cards/${encodeURIComponent(cardId)}`,
      { title, details },
      "PATCH"
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
};

export const getApiErrorMessage = (
  error: unknown,
  fallback: string
): string => (error instanceof ApiError ? error.message : fallback);
