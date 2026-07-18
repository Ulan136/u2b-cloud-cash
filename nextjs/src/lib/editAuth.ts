import * as appSettingsRepo from "@/repositories/appSettings.repo";

// Пароль для изменения (редактирования) существующих записей журналов.
// Хранится в БД (таблица app_settings, ключ edit_password) и меняется на странице
// Настройки → Безопасность. Если в БД не задан — берётся резервное значение
// (env EDIT_PASSWORD или "777").
export const EDIT_PASSWORD_KEY = "edit_password";
const FALLBACK_PASSWORD = process.env.EDIT_PASSWORD ?? "777";

export async function getEditPassword(): Promise<string> {
  const rows = await appSettingsRepo.all();
  const v = rows.find((r) => r.key === EDIT_PASSWORD_KEY)?.value;
  return v && v.length > 0 ? v : FALLBACK_PASSWORD;
}

export async function checkEditPassword(password: unknown): Promise<boolean> {
  if (typeof password !== "string") return false;
  return password === (await getEditPassword());
}
