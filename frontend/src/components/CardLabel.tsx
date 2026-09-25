import clsx from "clsx";
import type { Label, LabelColor } from "@/lib/kanban";

const COLOR_CLASSES: Record<LabelColor, string> = {
  yellow: "bg-[var(--accent-yellow)]/20 text-[#7a5a00]",
  blue: "bg-[var(--primary-blue)]/15 text-[#0b5e85]",
  purple: "bg-[var(--secondary-purple)]/15 text-[var(--secondary-purple)]",
  navy: "bg-[var(--navy-dark)]/10 text-[var(--navy-dark)]",
  gray: "bg-[var(--gray-text)]/15 text-[#5c5c5c]",
};

type CardLabelProps = {
  label: Label;
  className?: string;
};

export const CardLabel = ({ label, className }: CardLabelProps) => (
  <span
    className={clsx(
      "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
      COLOR_CLASSES[label.color] ?? COLOR_CLASSES.gray,
      className
    )}
  >
    {label.name}
  </span>
);
