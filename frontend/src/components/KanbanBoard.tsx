"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { api, getApiErrorMessage, isSessionExpiredError } from "@/lib/api";
import {
  getCardDropPosition,
  getKeyboardDropPosition,
  insertCard,
  moveCardToPosition,
  removeCard,
  setCard,
  setColumnTitle,
  type BoardData,
} from "@/lib/kanban";

type KanbanBoardProps = {
  initialBoard: BoardData;
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
  onSessionExpired?: () => void;
};

const findColumn = (board: BoardData, id: string) =>
  board.columns.find(
    (column) => column.id === id || column.cardIds.includes(id)
  );

// Keyboard drags have no pointer coordinates, which pointerWithin needs.
const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCorners(args);

export const KanbanBoard = ({
  initialBoard,
  onLogout,
  isLoggingOut = false,
  onSessionExpired,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialBoard);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const pendingMutations = useRef(new Set<Promise<unknown>>());
  const mutationCount = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const trackMutation = <T,>(request: Promise<T>): Promise<T> => {
    mutationCount.current += 1;
    pendingMutations.current.add(request);
    const forget = () => {
      pendingMutations.current.delete(request);
    };
    request.then(forget, forget);
    return request;
  };

  const handleMutationError = (error: unknown, fallback: string) => {
    if (isSessionExpiredError(error)) {
      onSessionExpired?.();
      return;
    }
    setMutationError(getApiErrorMessage(error, fallback));
  };

  // The assistant's board snapshot can predate edits made while it was
  // thinking, so reload from the server once local mutations have settled.
  const refreshBoard = async () => {
    try {
      for (;;) {
        await Promise.allSettled(pendingMutations.current);
        const countBeforeLoad = mutationCount.current;
        const latestBoard = await api.getBoard();
        if (mutationCount.current === countBeforeLoad) {
          setBoard(latestBoard);
          return;
        }
      }
    } catch (error) {
      handleMutationError(
        error,
        "Unable to refresh the board. Please reload the page."
      );
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta, activatorEvent } = event;
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

    const isOverColumn = overId === targetColumn.id;
    const initialRect = active.rect.current.initial;
    const position =
      activatorEvent instanceof KeyboardEvent
        ? getKeyboardDropPosition(
            targetColumn.cardIds,
            activeId,
            overId,
            isOverColumn
          )
        : getCardDropPosition(
            targetColumn.cardIds,
            activeId,
            overId,
            isOverColumn,
            initialRect
              ? { top: initialRect.top + delta.y, height: initialRect.height }
              : (active.rect.current.translated ?? undefined),
            over.rect
          );

    const originalPosition = activeColumn.cardIds.indexOf(activeId);
    setMutationError(null);
    setBoard((prev) => ({
      ...prev,
      columns: moveCardToPosition(
        prev.columns,
        activeId,
        targetColumn.id,
        position
      ),
    }));

    void trackMutation(api.moveCard(activeId, targetColumn.id, position)).catch(
      (error: unknown) => {
        setBoard((prev) => ({
          ...prev,
          columns: moveCardToPosition(
            prev.columns,
            activeId,
            activeColumn.id,
            originalPosition
          ),
        }));
        handleMutationError(error, "Unable to move card. Please try again.");
      }
    );
  };

  const handleRenameColumn = async (columnId: string, title: string) => {
    const previousTitle = findColumn(board, columnId)?.title ?? title;
    setMutationError(null);
    setBoard((prev) => setColumnTitle(prev, columnId, title));

    try {
      await trackMutation(api.renameColumn(columnId, title));
    } catch (error) {
      setBoard((prev) => setColumnTitle(prev, columnId, previousTitle));
      handleMutationError(error, "Unable to rename column. Please try again.");
    }
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    setMutationError(null);
    try {
      const { id } = await trackMutation(
        api.createCard(columnId, title, details || "No details yet.")
      );
      setBoard((prev) =>
        insertCard(
          prev,
          columnId,
          { id, title, details: details || "No details yet." },
          Infinity
        )
      );
    } catch (error) {
      handleMutationError(error, "Unable to add card. Please try again.");
      throw error;
    }
  };

  const handleEditCard = async (
    cardId: string,
    title: string,
    details: string
  ) => {
    const previousCard = board.cards[cardId];
    setMutationError(null);
    setBoard((prev) => setCard(prev, { id: cardId, title, details }));

    try {
      await trackMutation(api.updateCard(cardId, title, details));
    } catch (error) {
      setBoard((prev) => setCard(prev, previousCard));
      handleMutationError(error, "Unable to save card. Please try again.");
      throw error;
    }
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    const previousCard = board.cards[cardId];
    const previousPosition =
      findColumn(board, columnId)?.cardIds.indexOf(cardId) ?? 0;
    setMutationError(null);
    setBoard((prev) => removeCard(prev, cardId));

    try {
      await trackMutation(api.deleteCard(cardId));
    } catch (error) {
      setBoard((prev) =>
        insertCard(prev, columnId, previousCard, previousPosition)
      );
      handleMutationError(error, "Unable to remove card. Please try again.");
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
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
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
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <AIChatSidebar
          onBoardChanged={() => void refreshBoard()}
          onSessionExpired={onSessionExpired}
        />
      </main>
    </div>
  );
};
