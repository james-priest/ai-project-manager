"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

export const AuthGate = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((response) => setIsAuthenticated(response.ok))
      .catch(() => setIsAuthenticated(false));
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      setIsAuthenticated(false);
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isAuthenticated === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p role="status" className="text-sm font-semibold text-[var(--gray-text)]">
          Loading workspace...
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="fixed right-6 top-6 z-10 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800 shadow-lg"
        >
          {error}
        </p>
      )}
      <KanbanBoard onLogout={handleLogout} isLoggingOut={isLoggingOut} />
    </>
  );
};
