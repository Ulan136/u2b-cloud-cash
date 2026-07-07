import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cashDays, cashExpenses, debts } from "@/db/schema";

// numeric-колонки не принимают пустую строку — нормализуем к "0"
const money = (v: unknown) =>
  v === "" || v === null || v === undefined ? "0" : String(v);

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.object({
    klaudObshch: z.string(),
    sebestoimost: z.string(),
    nalichnye: z.string(),
    kaspi: z.string(),
    halyk: z.string(),
    inkasNalichka: z.string(),
    vozvrat: z.string(),
    zakupTovar: z.string(),
    comment: z.string().optional().default(""),
  }),
  expenses: z.array(
    z.object({
      category: z.string().min(1),
      amount: z.string(),
      comment: z.string().optional().default(""),
    })
  ),
});

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) обязателен" }, { status: 400 });
  }

  const [day] = await db.select().from(cashDays).where(eq(cashDays.date, date));
  const expenses = await db
    .select()
    .from(cashExpenses)
    .where(eq(cashExpenses.date, date))
    .orderBy(cashExpenses.id);
  const [totals] = await db
    .select({
      debt: sql<string>`COALESCE(SUM(${debts.debtAmount}), 0)`,
      payment: sql<string>`COALESCE(SUM(${debts.paymentAmount}), 0)`,
    })
    .from(debts)
    .where(eq(debts.date, date));

  return NextResponse.json({ day: day ?? null, expenses, totals });
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { date, day, expenses } = parsed.data;

  const values = {
    date,
    klaudObshch: money(day.klaudObshch),
    sebestoimost: money(day.sebestoimost),
    nalichnye: money(day.nalichnye),
    kaspi: money(day.kaspi),
    halyk: money(day.halyk),
    inkasNalichka: money(day.inkasNalichka),
    vozvrat: money(day.vozvrat),
    zakupTovar: money(day.zakupTovar),
    comment: day.comment ?? "",
  };

  // upsert по уникальной дате
  const { date: _d, ...set } = values;
  await db.insert(cashDays).values(values).onConflictDoUpdate({
    target: cashDays.date,
    set,
  });

  // расходы дня переписываем целиком (add/edit/delete одним махом)
  await db.delete(cashExpenses).where(eq(cashExpenses.date, date));
  const rows = expenses
    .filter((e) => e.amount !== "" && e.category)
    .map((e) => ({
      date,
      category: e.category,
      amount: money(e.amount),
      comment: e.comment ?? "",
    }));
  if (rows.length) {
    await db.insert(cashExpenses).values(rows);
  }

  return NextResponse.json({ ok: true });
}
