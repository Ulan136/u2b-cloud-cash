// Общие утилиты форматирования/нормализации денежных значений.

// numeric-колонки БД не принимают пустую строку — нормализуем к "0".
export const money = (v: unknown): string =>
  v === "" || v === null || v === undefined ? "0" : String(v);

// Безопасный парсинг числа (NaN → 0).
export const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
