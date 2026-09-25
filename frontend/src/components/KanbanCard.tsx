import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CardComments } from "@/components/CardComments";
import { CardLabel } from "@/components/CardLabel";
import type { CardFields } from "@/lib/api";
import { isOverdue, type Card, type Label } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  labels: Label[];
  today: string;
  onCommentsChanged: () => void;
  onEdit: (
    cardId: string,
    title: string,
    details: string,
    fields: CardFields
  ) => void | Promise<void>;
  onDelete: (cardId: string) => void | Promise<void>;
};

const cardFieldsOf = (card: Card): CardFields => ({
  dueDate: card.dueDate,
  assignee: card.assignee,
  labelIds: card.labelIds,
});

export const KanbanCard = ({
  card,
  labels,
  today,
  onCommentsChanged,
  onEdit,
  onDelete,
}: KanbanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    // The card holds buttons and, while editing, a form, so it is a group
    // rather than dnd-kit's default role of button.
    attributes: { role: "group" },
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(card.title);
  const [draftDetails, setDraftDetails] = useState(card.details);
  const [draftFields, setDraftFields] = useState<CardFields>(cardFieldsOf(card));
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const cardLabels = labels.filter((label) => card.labelIds.includes(label.id));

  const startEditing = () => {
    setIsConfirmingDelete(false);
    setDraftTitle(card.title);
    setDraftDetails(card.details);
    setDraftFields(cardFieldsOf(card));
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftTitle(card.title);
    setDraftDetails(card.details);
    setDraftFields(cardFieldsOf(card));
    setError(null);
    setIsEditing(false);
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
      await onEdit(card.id, title, draftDetails.trim(), {
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

  return (
    <article
      ref={(node) => {
        setNodeRef(node);
        // Only keys pressed on the card itself start a keyboard drag, not
        // Enter/Space on its buttons or edit fields.
        setActivatorNodeRef(node);
      }}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form
          onSubmit={handleSubmit}
          onPointerDown={(event) => event.stopPropagation()}
          className="space-y-3"
        >
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            aria-label={`Title for ${card.title}`}
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            disabled={isSaving}
            required
          />
          <textarea
            value={draftDetails}
            onChange={(event) => setDraftDetails(event.target.value)}
            aria-label={`Details for ${card.title}`}
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
            disabled={isSaving}
          />
          <div className="grid grid-cols-2 gap-2">
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
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-2 py-1 text-xs font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none"
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
                aria-label={`Assignee for ${card.title}`}
                disabled={isSaving}
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-2 py-1 text-xs font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none"
              />
            </label>
          </div>
          {labels.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Labels
              </legend>
              <div className="flex flex-wrap gap-2">
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
              className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:cursor-wait disabled:opacity-60"
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 break-words font-display text-base font-semibold text-[var(--navy-dark)]">
                {card.title}
              </h3>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={startEditing}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                  aria-label={`Edit ${card.title}`}
                  title={`Edit ${card.title}`}
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m4 16.5-.75 4.25 4.25-.75L19 8.5 15.5 5z" />
                    <path d="m13.75 6.75 3.5 3.5M3.25 20.75l3.5-3.5" />
                  </svg>
                </button>
                {isConfirmingDelete ? (
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => void onDelete(card.id)}
                    onBlur={() => setIsConfirmingDelete(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setIsConfirmingDelete(false);
                      }
                    }}
                    autoFocus
                    className="rounded-full border border-red-300 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                    aria-label={`Confirm delete ${card.title}`}
                    title={`Confirm delete ${card.title}`}
                  >
                    Confirm
                  </button>
                ) : (
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setIsConfirmingDelete(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                    aria-label={`Delete ${card.title}`}
                    title={`Delete ${card.title}`}
                  >
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4.5 7.5h15M9 4.5h6l1 3H8zM7 7.5l.75 12h8.5L17 7.5M10 11v5M14 11v5" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              {card.details || "No details yet."}
            </p>
            {(cardLabels.length > 0 ||
              card.dueDate ||
              card.assignee ||
              card.commentCount > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
                {card.commentCount > 0 && (
                  <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--gray-text)]">
                    {card.commentCount}{" "}
                    {card.commentCount === 1 ? "comment" : "comments"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {isEditing && (
        <div className="mt-3" onPointerDown={(event) => event.stopPropagation()}>
          <CardComments
            cardId={card.id}
            cardTitle={card.title}
            onCommentsChanged={onCommentsChanged}
          />
        </div>
      )}
    </article>
  );
};
