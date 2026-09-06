"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { api, getApiErrorMessage, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type AIChatSidebarProps = {
  onBoardUpdate: (board: BoardData) => void;
};

export const AIChatSidebar = ({ onBoardUpdate }: AIChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || isSubmitting) {
      if (!nextQuestion) {
        setError("Ask a question before sending.");
      }
      return;
    }

    const history = messages;
    setQuestion("");
    setError(null);
    setMessages((currentMessages) => [
      ...currentMessages,
      { role: "user", content: nextQuestion },
    ]);
    setIsSubmitting(true);

    try {
      const result = await api.chat(nextQuestion, history);
      if (result.updated) {
        onBoardUpdate(result.board);
      }
      setMessages((currentMessages) => [
        ...currentMessages,
        { role: "assistant", content: result.response },
      ]);
    } catch (chatError) {
      setError(
        getApiErrorMessage(
          chatError,
          "Unable to reach the AI assistant. Please try again."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuestionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <aside
      className="flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-white/90 p-5 shadow-[var(--shadow)]"
      aria-labelledby="ai-assistant-title"
      data-testid="ai-chat-sidebar"
    >
      <div className="border-b border-[var(--stroke)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          Workspace assistant
        </p>
        <h2
          id="ai-assistant-title"
          className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]"
        >
          Ask the board
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
          Ask for a summary or request card changes in plain language.
        </p>
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto py-5"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <p className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--gray-text)]">
            Try “What should we prioritize next?”
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === "user"
                  ? "ml-6 rounded-2xl bg-[var(--primary-blue)] px-4 py-3 text-sm leading-6 text-white"
                  : "mr-6 rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
              }
              data-testid={`chat-message-${message.role}`}
            >
              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] opacity-70">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] pt-4">
        <label
          htmlFor="ai-question"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
        >
          Your question
        </label>
        <textarea
          id="ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleQuestionKeyDown}
          placeholder="Ask about your board..."
          rows={3}
          disabled={isSubmitting}
          className="mt-2 w-full resize-none rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] disabled:cursor-wait disabled:opacity-60"
        />
        <p className="mt-2 text-xs text-[var(--gray-text)]">
          Enter to send. Shift+Enter for a new line.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-3 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? "Sending..." : "Send message"}
        </button>
      </form>
    </aside>
  );
};
