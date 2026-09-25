"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { CardLabel } from "@/components/CardLabel";
import {
  LABEL_COLORS,
  type BoardFilters,
  type Label,
  type LabelColor,
} from "@/lib/kanban";

type BoardToolbarProps = {
  labels: Label[];
  filters: BoardFilters;
  visibleCount: number;
  totalCount: number;
  onFiltersChange: (filters: BoardFilters) => void;
  onCreateLabel: (name: string, color: LabelColor) => Promise<void>;
  onDeleteLabel: (labelId: string) => Promise<void>;
};

export const BoardToolbar = ({
  labels,
  filters,
  visibleCount,
  totalCount,
  onFiltersChange,
  onCreateLabel,
  onDeleteLabel,
}: BoardToolbarProps) => {
  const [isManagingLabels, setIsManagingLabels] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<LabelColor>("blue");
  const [isBusy, setIsBusy] = useState(false);

  const toggleLabelFilter = (labelId: string) => {
    onFiltersChange({
      ...filters,
      labelIds: filters.labelIds.includes(labelId)
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
    });
  };

  const handleCreateLabel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newLabelName.trim();
    if (!name || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await onCreateLabel(name, newLabelColor);
      setNewLabelName("");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    setIsBusy(true);
    try {
      await onDeleteLabel(labelId);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      aria-label="Board filters"
      className="flex flex-col gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filters.query}
          onChange={(event) =>
            onFiltersChange({ ...filters, query: event.target.value })
          }
          placeholder="Search cards"
          aria-label="Search cards"
          className="min-w-[220px] flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />

        {labels.map((label) => {
          const isSelected = filters.labelIds.includes(label.id);
          return (
            <button
              key={label.id}
              type="button"
              onClick={() => toggleLabelFilter(label.id)}
              aria-pressed={isSelected}
              className={clsx(
                "rounded-full border px-2 py-1 transition",
                isSelected
                  ? "border-[var(--primary-blue)] bg-white"
                  : "border-transparent hover:border-[var(--stroke)]"
              )}
            >
              <CardLabel label={label} />
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsManagingLabels((current) => !current)}
          aria-expanded={isManagingLabels}
          className="rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          Labels
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          {visibleCount === totalCount
            ? `${totalCount} cards`
            : `${visibleCount} of ${totalCount} cards`}
        </p>

        {(filters.query || filters.labelIds.length > 0) && (
          <button
            type="button"
            onClick={() => onFiltersChange({ query: "", labelIds: [] })}
            className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {isManagingLabels && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--stroke)] pt-3">
          <form onSubmit={handleCreateLabel} className="flex items-center gap-2">
            <input
              value={newLabelName}
              onChange={(event) => setNewLabelName(event.target.value)}
              placeholder="Label name"
              aria-label="New label name"
              disabled={isBusy}
              required
              className="rounded-full border border-[var(--stroke)] bg-white px-3 py-2 text-xs font-medium text-[var(--navy-dark)] outline-none"
            />
            <select
              value={newLabelColor}
              onChange={(event) =>
                setNewLabelColor(event.target.value as LabelColor)
              }
              aria-label="New label color"
              disabled={isBusy}
              className="rounded-full border border-[var(--stroke)] bg-white px-3 py-2 text-xs font-medium text-[var(--navy-dark)] outline-none"
            >
              {LABEL_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
            >
              Add label
            </button>
          </form>

          {labels.map((label) => (
            <span key={label.id} className="flex items-center gap-1">
              <CardLabel label={label} />
              <button
                type="button"
                onClick={() => void handleDeleteLabel(label.id)}
                disabled={isBusy}
                aria-label={`Delete label ${label.name}`}
                className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-red-700 disabled:opacity-60"
              >
                Remove
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
};
