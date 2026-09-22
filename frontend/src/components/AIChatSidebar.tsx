"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  api,
  getApiErrorMessage,
  isSessionExpiredError,
  type ChatMessage,
} from "@/lib/api";
import {
  clampAssistantGeometry,
  getInitialAssistantGeometry,
  moveAssistantGeometry,
  resizeAssistantGeometry,
  type AssistantGeometry,
} from "@/lib/assistantGeometry";

type AIChatSidebarProps = {
  onBoardChanged: () => void;
  onSessionExpired?: () => void;
};

type PointerInteraction = {
  type: "drag" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  geometry: AssistantGeometry;
};

const getViewportSize = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

export const AIChatSidebar = ({
  onBoardChanged,
  onSessionExpired,
}: AIChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [geometry, setGeometry] = useState<AssistantGeometry | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const interactionRef = useRef<PointerInteraction | null>(null);

  const closeAssistant = useCallback(() => {
    interactionRef.current = null;
    setIsInteracting(false);
    setIsOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      questionRef.current?.focus();
    });
    const handleViewportResize = () => {
      setGeometry((currentGeometry) =>
        currentGeometry
          ? clampAssistantGeometry(currentGeometry, getViewportSize())
          : currentGeometry
      );
    };

    // Listen on the document so Escape works even after focus leaves the
    // non-modal dialog; skip keys an inner control already handled.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        closeAssistant();
      }
    };

    window.addEventListener("resize", handleViewportResize);
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", handleViewportResize);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, closeAssistant]);

  const openAssistant = () => {
    setGeometry((currentGeometry) =>
      currentGeometry
        ? clampAssistantGeometry(currentGeometry, getViewportSize())
        : getInitialAssistantGeometry(getViewportSize())
    );
    setIsOpen(true);
  };

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
        onBoardChanged();
      }
      setMessages((currentMessages) => [
        ...currentMessages,
        { role: "assistant", content: result.response },
      ]);
    } catch (chatError) {
      if (isSessionExpiredError(chatError)) {
        onSessionExpired?.();
      } else {
        setError(
          getApiErrorMessage(
            chatError,
            "Unable to reach the AI assistant. Please try again."
          )
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuestionKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const startPointerInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    type: PointerInteraction["type"]
  ) => {
    if (event.button !== 0 || !geometry) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
    setIsInteracting(true);
  };

  const updatePointerInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    const viewport = getViewportSize();
    setGeometry(
      interaction.type === "drag"
        ? moveAssistantGeometry(
            interaction.geometry,
            deltaX,
            deltaY,
            viewport
          )
        : resizeAssistantGeometry(
            interaction.geometry,
            deltaX,
            deltaY,
            viewport
          )
    );
  };

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (interactionRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    interactionRef.current = null;
    setIsInteracting(false);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!geometry) {
      return;
    }

    const step = event.shiftKey ? 40 : 10;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (!delta) {
      return;
    }

    event.preventDefault();
    setGeometry(
      resizeAssistantGeometry(
        geometry,
        delta[0],
        delta[1],
        getViewportSize()
      )
    );
  };

  if (!isOpen || !geometry) {
    return (
      <button
        ref={launcherRef}
        type="button"
        onClick={openAssistant}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-white shadow-[0_16px_32px_rgba(3,33,71,0.24)] transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[rgba(117,57,145,0.28)]"
        aria-label="Open workspace assistant"
        title="Open workspace assistant"
        data-testid="ai-chat-launcher"
      >
        <svg
          aria-hidden="true"
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5 6.75A2.75 2.75 0 0 1 7.75 4h8.5A2.75 2.75 0 0 1 19 6.75v6.5A2.75 2.75 0 0 1 16.25 16H12l-4.25 3v-3.05A2.75 2.75 0 0 1 5 13.25z" />
          <path d="M8.5 9.5h7M8.5 12.5h4" />
        </svg>
      </button>
    );
  }

  return (
    <aside
      className={`fixed z-50 flex flex-col overflow-hidden rounded-3xl border border-[var(--stroke)] bg-white/95 shadow-[0_24px_60px_rgba(3,33,71,0.25)] backdrop-blur ${isInteracting ? "select-none" : ""}`}
      style={{
        left: geometry.x,
        top: geometry.y,
        width: geometry.width,
        height: geometry.height,
      }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-assistant-title"
      data-testid="ai-chat-sidebar"
    >
      <div
        className="flex cursor-move items-start justify-between gap-3 border-b border-[var(--stroke)] bg-[var(--surface)] px-5 py-4"
        onPointerDown={(event) => startPointerInteraction(event, "drag")}
        onPointerMove={updatePointerInteraction}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        data-testid="ai-chat-drag-handle"
      >
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Workspace assistant
          </p>
          <h2
            id="ai-assistant-title"
            className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]"
          >
            Ask the board
          </h2>
        </div>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={closeAssistant}
          className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
          aria-label="Close workspace assistant"
        >
          Close
        </button>
      </div>

      <div className="px-5 pt-4">
        <p className="text-sm leading-6 text-[var(--gray-text)]">
          Ask for a summary or request card changes in plain language.
        </p>
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
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
        <p role="alert" className="px-5 pb-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] px-5 pb-5 pt-4">
        <label
          htmlFor="ai-question"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
        >
          Your question
        </label>
        <textarea
          ref={questionRef}
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

      <button
        type="button"
        aria-label="Resize assistant"
        title="Resize assistant"
        className="absolute bottom-1 right-1 h-6 w-6 cursor-se-resize rounded-br-2xl text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
        onPointerDown={(event) => startPointerInteraction(event, "resize")}
        onPointerMove={updatePointerInteraction}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        onKeyDown={handleResizeKeyDown}
        data-testid="ai-chat-resize-handle"
      >
        <svg
          aria-hidden="true"
          className="ml-auto mt-2 h-3 w-3"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M2 10 10 2M6 10l4-4" />
        </svg>
      </button>
    </aside>
  );
};
