"use client";

// Маленький индикатор живого обновления (View). «обновление…» / «обновлено HH:MM».
export function LiveIndicator({
  lastUpdated,
  refreshing,
  className = "text-[#9ca3af]",
}: {
  lastUpdated: number | null;
  refreshing?: boolean;
  className?: string;
}) {
  const cls = `text-[11px] ${className}`;
  if (refreshing) {
    return <span className={cls}>обновление…</span>;
  }
  if (!lastUpdated) return null;
  const d = new Date(lastUpdated);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return (
    <span className={cls}>
      обновлено {hh}:{mm}
    </span>
  );
}
