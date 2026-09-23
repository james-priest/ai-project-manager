import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void | Promise<void>;
  onAddCard: (
    columnId: string,
    title: string,
    details: string
  ) => void | Promise<void>;
  onEditCard: (
    cardId: string,
    title: string,
    details: string
  ) => void | Promise<void>;
  onDeleteCard: (columnId: string, cardId: string) => void | Promise<void>;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [draftTitle, setDraftTitle] = useState(column.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
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
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={onEditCard}
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
