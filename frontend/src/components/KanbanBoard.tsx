"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  getCardDropPosition,
  moveCardToPosition,
  type BoardData,
} from "@/lib/kanban";

type KanbanBoardProps = {
  initialBoard: BoardData;
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
};

const findColumn = (board: BoardData, id: string) =>
  board.columns.find(
    (column) => column.id === id || column.cardIds.includes(id)
  );

const getMovePosition = (
  board: BoardData,
  activeId: string,
  targetColumnId: string,
  overId: string,
  activeRect?: { top: number; height: number } | null,
  overRect?: { top: number; height: number }
) => {
  const targetColumn = board.columns.find(
    (column) => column.id === targetColumnId
  );
  if (!targetColumn) {
    return null;
  }

  return getCardDropPosition(
    targetColumn.cardIds,
    activeId,
    overId,
    overId === targetColumnId,
    activeRect ?? undefined,
    overRect
  );
};

export const KanbanBoard = ({
  initialBoard,
  onLogout,
  isLoggingOut = false,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialBoard);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeColumn = findColumn(board, activeId);
    const targetColumn = findColumn(board, overId);
    if (!activeColumn || !targetColumn) {
      return;
    }

    const activeRect = active.rect.current.initial
      ? {
          top: active.rect.current.initial.top + delta.y,
          height: active.rect.current.initial.height,
        }
      : active.rect.current.translated;
    const position = getMovePosition(
      board,
      activeId,
      targetColumn.id,
      overId,
      activeRect,
      over.rect
    );
    if (position === null) {
      return;
    }

    const previousBoard = board;
    const nextBoard = {
      ...board,
      columns: moveCardToPosition(
        board.columns,
        activeId,
        targetColumn.id,
        position
      ),
    };
    setMutationError(null);
    setBoard(nextBoard);

    void api
      .moveCard(activeId, targetColumn.id, position)
      .catch((error: unknown) => {
        setBoard(previousBoard);
        setMutationError(
          getApiErrorMessage(error, "Unable to move card. Please try again.")
        );
      });
  };

  const handleRenameColumn = async (columnId: string, title: string) => {
    const previousBoard = board;
    setMutationError(null);
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));

    try {
      await api.renameColumn(columnId, title);
    } catch (error) {
      setBoard(previousBoard);
      setMutationError(
        getApiErrorMessage(error, "Unable to rename column. Please try again.")
      );
    }
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    setMutationError(null);
    try {
      const { id } = await api.createCard(
        columnId,
        title,
        details || "No details yet."
      );
      setBoard((prev) => ({
        ...prev,
        cards: {
          ...prev.cards,
          [id]: { id, title, details: details || "No details yet." },
        },
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? { ...column, cardIds: [...column.cardIds, id] }
            : column
        ),
      }));
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to add card. Please try again.")
      );
      throw error;
    }
  };

  const handleEditCard = async (
    cardId: string,
    title: string,
    details: string
  ) => {
    const previousBoard = board;
    setMutationError(null);
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: { id: cardId, title, details },
      },
    }));

    try {
      await api.updateCard(cardId, title, details);
    } catch (error) {
      setBoard(previousBoard);
      setMutationError(
        getApiErrorMessage(error, "Unable to save card. Please try again.")
      );
      throw error;
    }
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    const previousBoard = board;
    setMutationError(null);
    setBoard((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    }));

    try {
      await api.deleteCard(cardId);
    } catch (error) {
      setBoard(previousBoard);
      setMutationError(
        getApiErrorMessage(error, "Unable to remove card. Please try again.")
      );
    }
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      {mutationError && (
        <p
          role="alert"
          className="fixed right-6 top-6 z-10 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800 shadow-lg"
        >
          {mutationError}
        </p>
      )}
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  disabled={isLoggingOut}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)] disabled:cursor-wait disabled:opacity-60"
                >
                  {isLoggingOut ? "Signing out..." : "Log out"}
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onEditCard={handleEditCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <AIChatSidebar onBoardUpdate={(nextBoard) => setBoard(nextBoard)} />
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
