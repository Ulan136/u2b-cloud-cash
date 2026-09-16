import { BadRequestError, ConflictError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/managerAuth";
import * as repo from "@/repositories/managers.repo";

type Row = Awaited<ReturnType<typeof repo.all>>[number];

// Наружу пароль-хеш не отдаём.
function publicManager(m: Row) {
  return {
    id: m.id,
    name: m.name,
    login: m.login,
    isAdmin: m.isAdmin ?? false,
    pages: m.pages ? (JSON.parse(m.pages) as string[]) : [],
    archived: m.archived ?? false,
  };
}

export async function count() {
  const rows = await repo.all();
  return rows.filter((r) => !r.archived).length;
}

export async function list() {
  const rows = await repo.all();
  return { managers: rows.map(publicManager) };
}

// Безопасный список для окна входа: только id/имя/админ.
export async function listForPicker() {
  const rows = await repo.all();
  return {
    managers: rows
      .filter((r) => !r.archived)
      .map((m) => ({ id: m.id, name: m.name, isAdmin: m.isAdmin ?? false })),
  };
}

export type CreateManagerInput = {
  name: string;
  login: string;
  password: string;
  isAdmin?: boolean;
  pages?: string[];
};

export async function createManager(input: CreateManagerInput) {
  const name = input.name.trim();
  const login = input.login.trim();
  if (!name) throw new BadRequestError("Имя обязательно");
  if (!login) throw new BadRequestError("Логин обязателен");
  if (!input.password) throw new BadRequestError("Пароль обязателен");
  const existing = await repo.byLogin(login);
  if (existing.length) throw new ConflictError("Логин уже занят");
  const [m] = await repo.create({
    name,
    login,
    passwordHash: hashPassword(input.password),
    isAdmin: !!input.isAdmin,
    pages: JSON.stringify(input.isAdmin ? [] : input.pages ?? []),
  });
  return { manager: publicManager(m) };
}

export type UpdateManagerInput = {
  id: number;
  name: string;
  login: string;
  password?: string;
  isAdmin?: boolean;
  pages?: string[];
};

export async function updateManager(input: UpdateManagerInput) {
  const login = input.login.trim();
  const dupe = await repo.byLogin(login);
  if (dupe.length && dupe[0].id !== input.id) throw new ConflictError("Логин уже занят");
  const set: Record<string, unknown> = {
    name: input.name.trim(),
    login,
    isAdmin: !!input.isAdmin,
    pages: JSON.stringify(input.isAdmin ? [] : input.pages ?? []),
  };
  if (input.password) set.passwordHash = hashPassword(input.password);
  const [m] = await repo.updateById(input.id, set);
  return { manager: publicManager(m) };
}

export async function removeManager(id: number) {
  await repo.deleteById(id);
  return { ok: true };
}

// Вход: выбрал себя (id) + пароль.
export async function login(id: number, password: string) {
  const [m] = await repo.byId(id);
  if (!m || m.archived) throw new BadRequestError("Пользователь не найден");
  if (!verifyPassword(password, m.passwordHash)) throw new BadRequestError("Неверный пароль");
  return { manager: publicManager(m) };
}
