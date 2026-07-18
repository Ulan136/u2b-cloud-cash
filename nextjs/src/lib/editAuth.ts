// Пароль для изменения (редактирования) существующих записей журналов.
// Единственное место хранения — поменять здесь или задать env EDIT_PASSWORD.
export const EDIT_PASSWORD = process.env.EDIT_PASSWORD ?? "777";

export function checkEditPassword(password: unknown): boolean {
  return typeof password === "string" && password === EDIT_PASSWORD;
}
