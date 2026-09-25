"use client";

import { useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";

type LoginFormProps = {
  onAuthenticated: (username: string) => void | Promise<void>;
};

export const LoginForm = ({ onAuthenticated }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Bad credentials come back as a 401, handled below.
      const data = isRegistering
        ? await api.register(username, password)
        : await api.login(username, password);
      await onAuthenticated(data.username);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setError("Invalid username or password.");
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        setError("That username is already taken.");
        return;
      }
      if (error instanceof ApiError && error.status === 422) {
        setError(
          "Usernames need 3+ letters, numbers, - or _, and passwords need 8+ characters."
        );
        return;
      }
      setError(
        isRegistering
          ? "Unable to create your account. Please try again."
          : "Unable to sign in. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Single Board Kanban
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          {isRegistering ? "Create your account" : "Sign in to Kanban Studio"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {isRegistering
            ? "Pick a username and password to start your first board."
            : "Sign in to continue to your project boards."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="username"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={
                isRegistering ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting
              ? isRegistering
                ? "Creating account..."
                : "Signing in..."
              : isRegistering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isRegistering ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsRegistering((current) => !current);
              setError(null);
            }}
            className="font-semibold text-[var(--primary-blue)] underline-offset-4 hover:underline"
          >
            {isRegistering ? "Sign in instead" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
};
