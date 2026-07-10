export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isDate = (v: unknown): v is string =>
  typeof v === "string" && DATE_RE.test(v);
