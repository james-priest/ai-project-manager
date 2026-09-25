"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { ApiError, api, type BoardSummary } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type WorkspaceState =
  | "loading"
  | "unauthenticated"
  | "authenticated"
  | "error";

export const AuthGate = () => {
  const [workspaceState, setWorkspaceState] =
    useState<WorkspaceState>("loading");
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadError = useCallback((loadError: unknown) => {
    if (loadError instanceof ApiError && loadError.status === 401) {
      setBoard(null);
      setBoards([]);
      setActiveBoardId(null);
      setWorkspaceState("unauthenticated");
      return;
    }

    setError("Unable to load your board. Please try again.");
    setWorkspaceState("error");
  }, []);

  // Loads the board list and opens one of them; keeps the current board when
  // it still exists so switching accounts or deleting lands somewhere sensible.
  const loadWorkspace = useCallback(
    async (preferredBoardId?: string) => {
      setWorkspaceState("loading");
      setError(null);

      try {
        const nextBoards = await api.listBoards();
        const nextBoardId =
          nextBoards.find((summary) => summary.id === preferredBoardId)?.id ??
          nextBoards[0]?.id;
        if (!nextBoardId) {
          throw new ApiError("No boards available.", 404);
        }

        setBoards(nextBoards);
        setActiveBoardId(nextBoardId);
        setBoard(await api.getBoard(nextBoardId));
        setWorkspaceState("authenticated");
      } catch (loadError) {
        handleLoadError(loadError);
      }
    },
    [handleLoadError]
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSessionExpired = useCallback(() => {
    setBoard(null);
    setBoards([]);
    setActiveBoardId(null);
    setWorkspaceState("unauthenticated");
  }, []);

  const runBoardAction = async (action: () => Promise<string | undefined>) => {
    setError(null);
    try {
      const preferredBoardId = await action();
      await loadWorkspace(preferredBoardId);
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 401) {
        handleSessionExpired();
        return;
      }
      setError(
        actionError instanceof ApiError
          ? actionError.message
          : "Unable to update your boards. Please try again."
      );
    }
  };

  const handleSelectBoard = async (boardId: string) => {
    if (boardId === activeBoardId) {
      return;
    }
    await runBoardAction(async () => boardId);
  };

  const handleCreateBoard = async (title: string) => {
    await runBoardAction(async () => (await api.createBoard(title)).id);
  };

  const handleRenameBoard = async (boardId: string, title: string) => {
    await runBoardAction(async () => {
      await api.renameBoard(boardId, title);
      return boardId;
    });
  };

  const handleDeleteBoard = async (boardId: string) => {
    await runBoardAction(async () => {
      await api.deleteBoard(boardId);
      return undefined;
    });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError(null);

    try {
      await api.logout();
      setBoard(null);
      setBoards([]);
      setActiveBoardId(null);
      setWorkspaceState("unauthenticated");
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (workspaceState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p role="status" className="text-sm font-semibold text-[var(--gray-text)]">
          Loading workspace...
        </p>
      </main>
    );
  }

  if (workspaceState === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void loadWorkspace(activeBoardId ?? undefined)}
          className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110"
        >
          Try again
        </button>
      </main>
    );
  }

  if (workspaceState === "unauthenticated") {
    return <LoginForm onAuthenticated={() => loadWorkspace()} />;
  }

  return (
    <>
      {error && workspaceState === "authenticated" && (
        <p
          role="alert"
          className="fixed right-6 top-20 z-10 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800 shadow-lg"
        >
          {error}
        </p>
      )}
      {board && activeBoardId && (
        <KanbanBoard
          key={activeBoardId}
          boardId={activeBoardId}
          initialBoard={board}
          boards={boards}
          onSelectBoard={handleSelectBoard}
          onCreateBoard={handleCreateBoard}
          onRenameBoard={handleRenameBoard}
          onDeleteBoard={handleDeleteBoard}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          onSessionExpired={handleSessionExpired}
        />
      )}
    </>
  );
};
