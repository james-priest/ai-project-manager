import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CardLabel } from "@/components/CardLabel";
import { isOverdue, type Card, type Label } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  labels: Label[];
  today: string;
  onOpen: (cardId: string) => void;
  onDelete: (cardId: string) => void | Promise<void>;
};

export const KanbanCard = ({
  card,
  labels,
  today,
  onOpen,
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
    // The card holds buttons, so it is a group rather than dnd-kit's default
    // role of button.
    attributes: { role: "group" },
  });
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const cardLabels = labels.filter((label) => card.labelIds.includes(label.id));

  return (
    <article
      ref={(node) => {
        setNodeRef(node);
        // Only keys pressed on the card itself start a keyboard drag, not
        // Enter/Space on its buttons.
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 break-words font-display text-base font-semibold text-[var(--navy-dark)]">
              <button
                type="button"
                // No stopPropagation here: the drag sensor needs 6px of
                // movement, so a plain click still opens the card while a
                // drag that starts on the title still picks the card up.
                onClick={() => onOpen(card.id)}
                aria-label={`Open ${card.title}`}
                className="text-left underline-offset-4 outline-none transition hover:underline focus:ring-2 focus:ring-[var(--primary-blue)]"
              >
                {card.title}
              </button>
            </h3>
            <div className="flex shrink-0 items-center gap-1">
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
          {card.details && (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--gray-text)]">
              {card.details}
            </p>
          )}
          {(cardLabels.length > 0 ||
            card.dueDate ||
            card.assignee ||
            card.commentCount > 0 ||
            card.checklistTotal > 0) && (
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
              {card.checklistTotal > 0 && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                    card.checklistDone === card.checklistTotal
                      ? "bg-[var(--primary-blue)]/15 text-[#0b5e85]"
                      : "bg-[var(--surface)] text-[var(--gray-text)]"
                  )}
                >
                  {card.checklistDone}/{card.checklistTotal} done
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
    </article>
  );
};
