import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, debts } from "@/db/schema";

const money = (v: unknown) =>
  v === "" || v === null || v === undefined ? "0" : String(v);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // История конкретного клиента
  const clientIdParam = sp.get("clientId");
  if (clientIdParam) {
    const id = Number(clientIdParam);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "clientId неверный" }, { status: 400 });
    }
    const history = await db
      .select({
        id: debts.id,
        date: debts.date,
        debtAmount: debts.debtAmount,
        paymentAmount: debts.paymentAmount,
        comment: debts.comment,
        returnDate: debts.returnDate,
      })
      .from(debts)
      .where(eq(debts.clientId, id))
      .orderBy(desc(debts.date), desc(debts.id));
    return NextResponse.json({ history });
  }

  // Вид за дату
  const date = sp.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) обязателен" }, { status: 400 });
  }

  const entries = await db
    .select({
      id: debts.id,
      date: debts.date,
      clientId: debts.clientId,
      clientName: clients.name,
      debtAmount: debts.debtAmount,
      paymentAmount: debts.paymentAmount,
      comment: debts.comment,
      returnDate: debts.returnDate,
    })
    .from(debts)
    .leftJoin(clients, eq(clients.id, debts.clientId))
    .where(eq(debts.date, date))
    .orderBy(desc(debts.id));

  const [dayTotals] = await db
    .select({
      debt: sql<string>`COALESCE(SUM(${debts.debtAmount}), 0)`,
      payment: sql<string>`COALESCE(SUM(${debts.paymentAmount}), 0)`,
    })
    .from(debts)
    .where(eq(debts.date, date));

  // Остатки по клиентам (аналог QUERY из «Долги АНАЛИЗ1»)
  const balancesRaw = await db
    .select({
      id: clients.id,
      name: clients.name,
      debts: sql<string>`COALESCE(SUM(${debts.debtAmount}), 0)`,
      payments: sql<string>`COALESCE(SUM(${debts.paymentAmount}), 0)`,
    })
    .from(clients)
    .leftJoin(debts, eq(debts.clientId, clients.id))
    .groupBy(clients.id, clients.name);

  const balances = balancesRaw
    .map((b) => {
      const d = Number(b.debts);
      const p = Number(b.payments);
      return { id: b.id, name: b.name, debts: d, payments: p, ostatok: d - p };
    })
    .filter((b) => b.debts !== 0 || b.payments !== 0)
    .sort((a, b) => b.ostatok - a.ostatok);

  const totalOstatok = balances.reduce((s, b) => s + b.ostatok, 0);

  return NextResponse.json({ entries, dayTotals, balances, totalOstatok });
}

const entrySchema = z.object({
  date: z.string().regex(DATE_RE),
  clientId: z.number().int(),
  debtAmount: z.string().optional().default("0"),
  paymentAmount: z.string().optional().default("0"),
  comment: z.string().optional().default(""),
  returnDate: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const parsed = entrySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const e = parsed.data;
  const returnDate =
    e.returnDate && DATE_RE.test(e.returnDate.trim()) ? e.returnDate.trim() : null;

  const [created] = await db
    .insert(debts)
    .values({
      date: e.date,
      clientId: e.clientId,
      debtAmount: money(e.debtAmount),
      paymentAmount: money(e.paymentAmount),
      comment: e.comment ?? "",
      returnDate,
    })
    .returning();

  return NextResponse.json({ entry: created });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  await db.delete(debts).where(eq(debts.id, id));
  return NextResponse.json({ ok: true });
}
