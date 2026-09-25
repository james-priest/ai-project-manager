"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import type { BoardSummary } from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  activeBoardId: string;
  onSelect: (boardId: string) => void;
  onCreate: (title: string) => Promise<void>;
  onRename: (boardId: string, title: string) => Promise<void>;
  onDelete: (boardId: string) => Promise<void>;
};

export const BoardSwitcher = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await onCreate(title);
      setNewTitle("");
      setIsCreating(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = renameTitle.trim();
    if (!renamingBoardId || !title || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await onRename(renamingBoardId, title);
      setRenamingBoardId(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (boardId: string) => {
    setIsBusy(true);
    try {
      await onDelete(boardId);
      setConfirmingDeleteId(null);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <nav aria-label="Boards" className="flex flex-wrap items-center gap-2">
      <ul className="flex flex-wrap items-center gap-2">
        {boards.map((board) => {
          const isActive = board.id === activeBoardId;

          if (board.id === renamingBoardId) {
            return (
              <li key={board.id}>
                <form onSubmit={handleRename} className="flex items-center gap-2">
                  <input
                    value={renameTitle}
                    onChange={(event) => setRenameTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setRenamingBoardId(null);
                      }
                    }}
                    aria-label={`New name for ${board.title}`}
                    disabled={isBusy}
                    autoFocus
                    className="rounded-full border border-[var(--primary-blue)] bg-white px-4 py-2 text-xs font-semibold text-[var(--navy-dark)] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    Save
                  </button>
                </form>
              </li>
            );
          }

          return (
            <li key={board.id} className="flex items-center">
              <div
                className={clsx(
                  "flex items-center gap-1 rounded-full border px-2 py-1 transition",
                  isActive
                    ? "border-[var(--primary-blue)] bg-[var(--primary-blue)]/10"
                    : "border-[var(--stroke)] hover:border-[var(--primary-blue)]"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(board.id)}
                  aria-current={isActive ? "true" : undefined}
                  className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)]"
                >
                  {board.title}
                  <span className="ml-2 font-normal normal-case tracking-normal text-[var(--gray-text)]">
                    {board.cardCount}
                  </span>
                </button>
                {isActive && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameTitle(board.title);
                        setConfirmingDeleteId(null);
                        setRenamingBoardId(board.id);
                      }}
                      aria-label={`Rename ${board.title}`}
                      title={`Rename ${board.title}`}
                      className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                    >
                      Rename
                    </button>
                    {boards.length > 1 &&
                      (confirmingDeleteId === board.id ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(board.id)}
                          onBlur={() => setConfirmingDeleteId(null)}
                          disabled={isBusy}
                          autoFocus
                          aria-label={`Confirm delete ${board.title}`}
                          className="rounded-full border border-red-300 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(board.id)}
                          aria-label={`Delete ${board.title}`}
                          title={`Delete ${board.title}`}
                          className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-red-700"
                        >
                          Delete
                        </button>
                      ))}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {isCreating ? (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setIsCreating(false);
                setNewTitle("");
              }
            }}
            placeholder="Board name"
            aria-label="New board name"
            disabled={isBusy}
            autoFocus
            required
            className="rounded-full border border-[var(--primary-blue)] bg-white px-4 py-2 text-xs font-semibold text-[var(--navy-dark)] outline-none"
          />
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isBusy ? "Adding..." : "Add board"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-full border border-dashed border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          New board
        </button>
      )}
    </nav>
  );
};
