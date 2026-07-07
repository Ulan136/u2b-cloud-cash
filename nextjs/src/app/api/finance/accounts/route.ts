import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { finAccounts, finCategories, finOps } from "@/db/schema";

const money = (v: unknown) =>
  v === "" || v === null || v === undefined ? "0" : String(v);
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// Баланс = initial + Приходы − Расходы − переводы-из + переводы-в (из fin_ops)
async function computeBalances() {
  const ops = await db
    .select({
      accountId: finOps.accountId,
      type: finOps.type,
      amount: finOps.amount,
      toAccountId: finOps.toAccountId,
    })
    .from(finOps);
  const delta = new Map<number, number>();
  const add = (id: number, v: number) => delta.set(id, (delta.get(id) ?? 0) + v);
  for (const op of ops) {
    const amt = n(op.amount);
    if (op.type === "Приход") add(op.accountId, amt);
    else if (op.type === "Расход") add(op.accountId, -amt);
    else if (op.type === "Перевод") {
      add(op.accountId, -amt);
      if (op.toAccountId != null) add(op.toAccountId, amt);
    }
  }
  return delta;
}

export async function GET() {
  const [categories, accounts, delta] = await Promise.all([
    db.select().from(finCategories).orderBy(asc(finCategories.id)),
    db.select().from(finAccounts).orderBy(asc(finAccounts.id)),
    computeBalances(),
  ]);

  const withBal = accounts.map((a) => ({
    ...a,
    initialBalance: n(a.initialBalance),
    balance: n(a.initialBalance) + (delta.get(a.id) ?? 0),
  }));
  const total = withBal
    .filter((a) => !a.archived)
    .reduce((s, a) => s + a.balance, 0);

  return NextResponse.json({ categories, accounts: withBal, total });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "название обязательно"),
  categoryId: z.number().int().nullable().optional(),
  icon: z.string().optional().default(""),
  initialBalance: z.string().optional().default("0"),
});

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const a = parsed.data;
  try {
    const [created] = await db
      .insert(finAccounts)
      .values({
        name: a.name,
        categoryId: a.categoryId ?? null,
        icon: a.icon || null,
        initialBalance: money(a.initialBalance),
        archived: false,
      })
      .returning();
    return NextResponse.json({ account: created });
  } catch {
    return NextResponse.json({ error: "Счёт с таким названием уже есть" }, { status: 409 });
  }
}

const patchSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1).optional(),
  categoryId: z.number().int().nullable().optional(),
  icon: z.string().optional(),
  initialBalance: z.string().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, ...rest } = parsed.data;
  const set: Record<string, unknown> = {};
  if (rest.name !== undefined) set.name = rest.name;
  if (rest.categoryId !== undefined) set.categoryId = rest.categoryId;
  if (rest.icon !== undefined) set.icon = rest.icon || null;
  if (rest.initialBalance !== undefined) set.initialBalance = money(rest.initialBalance);
  if (rest.archived !== undefined) set.archived = rest.archived;
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: "нет полей для обновления" }, { status: 400 });
  }
  const [updated] = await db
    .update(finAccounts)
    .set(set)
    .where(eq(finAccounts.id, id))
    .returning();
  return NextResponse.json({ account: updated });
}
