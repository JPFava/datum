import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/datum/format";

export function ToolButton({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cx(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-sm disabled:opacity-40",
        active
          ? "border-bronze bg-bronze/15 text-bronze"
          : "border-line bg-surface-2 text-fg hover:border-bronze/50",
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cx(
        "inline-flex size-11 items-center justify-center rounded-md border",
        active
          ? "border-bronze bg-bronze/15 text-bronze"
          : "border-line bg-surface-2 text-fg hover:border-bronze/50",
        className,
      )}
      {...props}
    />
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 font-mono text-xs tracking-wide text-muted uppercase">{children}</p>
  );
}
