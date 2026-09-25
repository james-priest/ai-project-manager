"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { CardChecklist } from "@/components/CardChecklist";
import { CardComments } from "@/components/CardComments";
import { CardLabel } from "@/components/CardLabel";
import { api, type CardFields } from "@/lib/api";
import { isOverdue, type Card, type Label } from "@/lib/kanban";

type CardDetailDialogProps = {
  card: Card;
  boardId: string;
  labels: Label[];
  today: string;
  onSave: (
    cardId: string,
    title: string,
    details: string,
    fields: CardFields
  ) => Promise<void>;
  onDelete: (cardId: string) => void | Promise<void>;
  onCommentsChanged: () => void;
  onClose: () => void;
};

const fieldsOf = (card: Card): CardFields => ({
  dueDate: card.dueDate,
  assignee: card.assignee,
  labelIds: card.labelIds,
});

export const CardDetailDialog = ({
  card,
  boardId,
  labels,
  today,
  onSave,
  onDelete,
  onCommentsChanged,
  onClose,
}: CardDetailDialogProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(card.title);
  const [draftDetails, setDraftDetails] = useState(card.details);
  const [draftFields, setDraftFields] = useState<CardFields>(fieldsOf(card));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Board members become assignee suggestions; free text still works.
  useEffect(() => {
    let active = true;
    api
      .listMembers(boardId)
      .then((loaded) => {
        if (active) {
          setMembers(loaded.map((member) => member.username));
        }
      })
      .catch(() => {
        // Suggestions are optional; typing a name still works without them.
      });
    return () => {
      active = false;
    };
  }, [boardId]);

  // Escape closes, and Tab cycles inside the dialog while it is open.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, input, textarea, [href], [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const startEditing = () => {
    setDraftTitle(card.title);
    setDraftDetails(card.details);
    setDraftFields(fieldsOf(card));
    setError(null);
    setIsEditing(true);
  };

  const toggleLabel = (labelId: string) => {
    setDraftFields((current) => ({
      ...current,
      labelIds: current.labelIds.includes(labelId)
        ? current.labelIds.filter((id) => id !== labelId)
        : [...current.labelIds, labelId],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) {
      setError("Card title is required.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(card.id, title, draftDetails.trim(), {
        ...draftFields,
        assignee: draftFields.assignee.trim(),
      });
      setIsEditing(false);
    } catch {
      setError("Unable to save card. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const cardLabels = labels.filter((label) => card.labelIds.includes(label.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(3,33,71,0.35)] p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Card details for ${card.title}`}
        className="mt-10 w-full max-w-2xl rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[0_24px_60px_rgba(3,33,71,0.25)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label className="block text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Title
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                aria-label={`Title for ${card.title}`}
                disabled={isSaving}
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
            </label>

            <label className="block text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Description (Markdown)
              <textarea
                value={draftDetails}
                onChange={(event) => setDraftDetails(event.target.value)}
                aria-label={`Details for ${card.title}`}
                rows={8}
                disabled={isSaving}
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 font-mono text-xs normal-case tracking-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Due date
                <input
                  type="date"
                  value={draftFields.dueDate ?? ""}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      dueDate: event.target.value || null,
                    }))
                  }
                  aria-label={`Due date for ${card.title}`}
                  disabled={isSaving}
                  className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[var(--navy-dark)] outline-none"
                />
              </label>
              <label className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Assignee
                <input
                  value={draftFields.assignee}
                  onChange={(event) =>
                    setDraftFields((current) => ({
                      ...current,
                      assignee: event.target.value,
                    }))
                  }
                  list={`assignees-${card.id}`}
                  aria-label={`Assignee for ${card.title}`}
                  disabled={isSaving}
                  className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[var(--navy-dark)] outline-none"
                />
              </label>
              <datalist id={`assignees-${card.id}`}>
                {members.map((member) => (
                  <option key={member} value={member} />
                ))}
              </datalist>
            </div>

            {labels.length > 0 && (
              <fieldset>
                <legend className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                  Labels
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {labels.map((label) => (
                    <label
                      key={label.id}
                      className="flex items-center gap-1 text-xs text-[var(--navy-dark)]"
                    >
                      <input
                        type="checkbox"
                        checked={draftFields.labelIds.includes(label.id)}
                        onChange={() => toggleLabel(label.id)}
                        disabled={isSaving}
                        aria-label={`${label.name} label for ${card.title}`}
                      />
                      <CardLabel label={label} />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-60"
              >
                Cancel
              </button>
            </div>

            {error && (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {error}
              </p>
            )}
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {cardLabels.map((label) => (
                <CardLabel key={label.id} label={label} />
              ))}
              {card.dueDate && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                    isOverdue(card, today)
                      ? "bg-red-100 text-red-700"
                      : "bg-[var(--surface)] text-[var(--gray-text)]"
                  )}
                >
                  {isOverdue(card, today) ? "Overdue " : "Due "}
                  {card.dueDate}
                </span>
              )}
              {card.assignee && (
                <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--navy-dark)]">
                  {card.assignee}
                </span>
              )}
            </div>

            <div
              data-testid="card-description"
              className="prose-sm max-w-none space-y-2 text-sm leading-6 text-[var(--navy-dark)] [&_a]:text-[var(--primary-blue)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--surface)] [&_code]:px-1 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal"
            >
              {card.details ? (
                <ReactMarkdown>{card.details}</ReactMarkdown>
              ) : (
                <p className="text-[var(--gray-text)]">No details yet.</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
              >
                Edit card
              </button>
              <button
                type="button"
                onClick={() => void onDelete(card.id)}
                className="rounded-full border border-red-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-50"
              >
                Delete card
              </button>
            </div>
          </div>
        )}

        <div className="mt-6">
          <CardChecklist
            cardId={card.id}
            cardTitle={card.title}
            onChecklistChanged={onCommentsChanged}
          />
        </div>

        <div className="mt-6">
          <CardComments
            cardId={card.id}
            cardTitle={card.title}
            onCommentsChanged={onCommentsChanged}
          />
        </div>
      </div>
    </div>
  );
};
