import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column, Label } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  labels: Label[];
  today: string;
  index: number;
  columnCount: number;
  onMoveColumn: (columnId: string, position: number) => void | Promise<void>;
  onDeleteColumn: (columnId: string) => void | Promise<void>;
  onRename: (columnId: string, title: string) => void | Promise<void>;
  onAddCard: (
    columnId: string,
    title: string,
    details: string
  ) => void | Promise<void>;
  onOpenCard: (cardId: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void | Promise<void>;
};

export const KanbanColumn = ({
  column,
  cards,
  labels,
  today,
  index,
  columnCount,
  onMoveColumn,
  onDeleteColumn,
  onRename,
  onAddCard,
  onOpenCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [draftTitle, setDraftTitle] = useState(column.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const cancelTitleEditRef = useRef(false);

  useEffect(() => {
    // Do not overwrite what the user is typing when the board updates.
    if (!isEditingTitle) {
      setDraftTitle(column.title);
    }
  }, [column.title, isEditingTitle]);

  const saveTitle = async () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === column.title || isSavingTitle) {
      if (!nextTitle) {
        setDraftTitle(column.title);
      }
      return;
    }

    setIsSavingTitle(true);
    try {
      await onRename(column.id, nextTitle);
    } finally {
      setIsSavingTitle(false);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <h2 className="sr-only">{column.title}</h2>
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} cards
            </span>
          </div>
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onFocus={() => setIsEditingTitle(true)}
            onBlur={() => {
              setIsEditingTitle(false);
              if (cancelTitleEditRef.current) {
                cancelTitleEditRef.current = false;
                return;
              }
              void saveTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelTitleEditRef.current = true;
                setDraftTitle(column.title);
                event.currentTarget.blur();
              }
            }}
            disabled={isSavingTitle}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label={`Column title: ${column.title}`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => void onMoveColumn(column.id, index - 1)}
              disabled={index === 0}
              aria-label={`Move ${column.title} left`}
              title={`Move ${column.title} left`}
              className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-40"
            >
              Left
            </button>
            <button
              type="button"
              onClick={() => void onMoveColumn(column.id, index + 1)}
              disabled={index === columnCount - 1}
              aria-label={`Move ${column.title} right`}
              title={`Move ${column.title} right`}
              className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-40"
            >
              Right
            </button>
            {columnCount > 1 &&
              (isConfirmingDelete ? (
                <button
                  type="button"
                  onClick={() => void onDeleteColumn(column.id)}
                  onBlur={() => setIsConfirmingDelete(false)}
                  autoFocus
                  aria-label={`Confirm delete ${column.title}`}
                  className="rounded-full border border-red-300 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-50"
                >
                  {cards.length > 0
                    ? `Delete ${cards.length} cards?`
                    : "Confirm"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  aria-label={`Delete ${column.title}`}
                  title={`Delete ${column.title}`}
                  className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-red-700"
                >
                  Delete
                </button>
              ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              labels={labels}
              today={today}
              onOpen={onOpenCard}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
