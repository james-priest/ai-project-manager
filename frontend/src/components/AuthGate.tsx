"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { ApiError, api } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type WorkspaceState =
  | "loading"
  | "unauthenticated"
  | "authenticated"
  | "error";

export const AuthGate = () => {
  const [workspaceState, setWorkspaceState] =
    useState<WorkspaceState>("loading");
  const [board, setBoard] = useState<BoardData | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadError = useCallback((loadError: unknown) => {
    if (loadError instanceof ApiError && loadError.status === 401) {
      setBoard(null);
      setWorkspaceState("unauthenticated");
      return;
    }

    setError("Unable to load your board. Please try again.");
    setWorkspaceState("error");
  }, []);

  const loadBoard = useCallback(async () => {
    setWorkspaceState("loading");
    setError(null);

    try {
      setBoard(await api.getBoard());
      setWorkspaceState("authenticated");
    } catch (loadError) {
      handleLoadError(loadError);
    }
  }, [handleLoadError]);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceState("loading");
    setError(null);

    try {
      // An unauthenticated caller gets a 401, handled by handleLoadError.
      await api.getCurrentUser();
      setBoard(await api.getBoard());
      setWorkspaceState("authenticated");
    } catch (loadError) {
      handleLoadError(loadError);
    }
  }, [handleLoadError]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSessionExpired = useCallback(() => {
    setBoard(null);
    setWorkspaceState("unauthenticated");
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError(null);

    try {
      await api.logout();
      setBoard(null);
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
          onClick={() => void loadWorkspace()}
          className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110"
        >
          Try again
        </button>
      </main>
    );
  }

  if (workspaceState === "unauthenticated") {
    return <LoginForm onAuthenticated={loadBoard} />;
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
      {board && (
        <KanbanBoard
          initialBoard={board}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          onSessionExpired={handleSessionExpired}
        />
      )}
    </>
  );
};
