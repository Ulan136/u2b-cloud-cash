// Дата из БД (YYYY-MM-DD) → человекочитаемый вид ДД.ММ.ГГГГ (18.09.2026).
// Сравнения/фильтры дат остаются на ISO-строках — форматируем только для показа.
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
