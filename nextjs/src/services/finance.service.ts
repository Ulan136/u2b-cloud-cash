import { money, num } from "@/lib/money";
import { DATE_RE } from "@/lib/validation";
import { BadRequestError, ConflictError } from "@/lib/errors";
import type {
  CreateAccountInput,
  CreateFavInput,
  CreateOpInput,
  PatchAccountInput,
  UpdateOpInput,
} from "@/dto/finance.dto";
import * as finRepo from "@/repositories/finance.repo";

type RawOp = { accountId: number; type: string; amount: unknown; toAccountId: number | null };

// Баланс = initial + Приходы − Расходы − переводы-из + переводы-в (из fin_ops)
function computeBalances(ops: RawOp[]) {
  const delta = new Map<number, number>();
  const add = (id: number, v: number) => delta.set(id, (delta.get(id) ?? 0) + v);
  for (const op of ops) {
    const amt = num(op.amount);
    if (op.type === "Приход") add(op.accountId, amt);
    else if (op.type === "Расход") add(op.accountId, -amt);
    else if (op.type === "Перевод") {
      add(op.accountId, -amt);
      if (op.toAccountId != null) add(op.toAccountId, amt);
    }
  }
  return delta;
}

// ── категории ──
export async function getCategories() {
  return { categories: await finRepo.categories() };
}

export async function createCategory(input: { name: string; icon?: string; color?: string }) {
  const code =
    input.name
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "cat";
  try {
    const [item] = await finRepo.createCategory({
      code,
      name: input.name,
      icon: input.icon || null,
      color: input.color || "#64748b",
    });
    return { category: item };
  } catch {
    // код мог совпасть — добавим суффикс из id-подобной строки
    const [item] = await finRepo.createCategory({
      code: `${code}_${input.name.length}${input.name.charCodeAt(0)}`,
      name: input.name,
      icon: input.icon || null,
      color: input.color || "#64748b",
    });
    return { category: item };
  }
}

export async function updateCategory(input: {
  id: number;
  name?: string;
  icon?: string;
  color?: string;
}) {
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.icon !== undefined) set.icon = input.icon || null;
  if (input.color !== undefined) set.color = input.color;
  if (Object.keys(set).length === 0) {
    throw new BadRequestError("нет полей для обновления");
  }
  const [category] = await finRepo.updateCategory(input.id, set);
  return { category };
}

export async function getAccounts() {
  const [categories, accounts, ops] = await Promise.all([
    finRepo.categories(),
    finRepo.accounts(),
    finRepo.allOps(),
  ]);
  const delta = computeBalances(ops);

  const withBal = accounts.map((a) => ({
    ...a,
    initialBalance: num(a.initialBalance),
    balance: num(a.initialBalance) + (delta.get(a.id) ?? 0),
  }));
  const total = withBal.filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0);

  return { categories, accounts: withBal, total };
}

export async function createAccount(input: CreateAccountInput) {
  try {
    const [created] = await finRepo.createAccount({
      name: input.name,
      categoryId: input.categoryId ?? null,
      icon: input.icon || null,
      initialBalance: money(input.initialBalance),
      archived: false,
    });
    return { account: created };
  } catch {
    throw new ConflictError("Счёт с таким названием уже есть");
  }
}

export async function updateAccount(input: PatchAccountInput) {
  const { id, ...rest } = input;
  const set: Record<string, unknown> = {};
  if (rest.name !== undefined) set.name = rest.name;
  if (rest.categoryId !== undefined) set.categoryId = rest.categoryId;
  if (rest.icon !== undefined) set.icon = rest.icon || null;
  if (rest.initialBalance !== undefined) set.initialBalance = money(rest.initialBalance);
  if (rest.archived !== undefined) set.archived = rest.archived;
  if (Object.keys(set).length === 0) {
    throw new BadRequestError("нет полей для обновления");
  }
  const [updated] = await finRepo.updateAccount(id, set);
  return { account: updated };
}

export async function getOps(raw: {
  from: string | null;
  to: string | null;
  accountId: string | null;
}) {
  const filters: { from?: string; to?: string; accountId?: number } = {};
  if (raw.from && DATE_RE.test(raw.from)) filters.from = raw.from;
  if (raw.to && DATE_RE.test(raw.to)) filters.to = raw.to;
  if (raw.accountId && Number.isInteger(Number(raw.accountId)))
    filters.accountId = Number(raw.accountId);

  const accounts = await finRepo.accountNames();
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = await finRepo.findOps(filters);
  const ops = rows.map((o) => ({
    ...o,
    amount: Number(o.amount),
    accountName: nameById.get(o.accountId) ?? null,
    toAccountName: o.toAccountId != null ? nameById.get(o.toAccountId) ?? null : null,
  }));

  return { ops };
}

export async function createOp(input: CreateOpInput) {
  const [created] = await finRepo.createOp({
    date: input.date,
    name: input.name || null,
    accountId: input.accountId,
    type: input.type,
    amount: String(Math.round(input.amount * 100) / 100),
    comment: input.comment || null,
    toAccountId: input.type === "Перевод" ? input.toAccountId ?? null : null,
  });
  return { op: created };
}

// Изменение суммы/комментария операции. Баланс счёта пересчитывается автоматически
// (агрегируется из fin_ops при следующей загрузке).
export async function updateOp(input: UpdateOpInput) {
  const [updated] = await finRepo.updateOp(input.id, {
    amount: String(Math.round(input.amount * 100) / 100),
    comment: input.comment || null,
  });
  return { op: updated };
}

export async function deleteOp(id: number) {
  await finRepo.deleteOp(id);
  return { ok: true };
}

export async function getFavs() {
  const accounts = await finRepo.accountNames();
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = await finRepo.favs();
  const favs = rows.map((f) => ({
    ...f,
    amount: Number(f.amount),
    accountName: f.accountId != null ? nameById.get(f.accountId) ?? null : null,
  }));
  return { favs };
}

export async function createFav(input: CreateFavInput) {
  const [created] = await finRepo.createFav({
    name: input.name,
    accountId: input.accountId,
    type: input.type,
    amount: String(input.amount),
  });
  return { fav: created };
}

export async function deleteFav(id: number) {
  await finRepo.deleteFav(id);
  return { ok: true };
}
