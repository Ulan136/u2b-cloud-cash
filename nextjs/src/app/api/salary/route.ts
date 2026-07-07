import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { salary } from "@/db/schema";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const money = (v: unknown) =>
  v === "" || v === null || v === undefined ? "0" : String(v);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  const date = sp.get("date");
  const period = and(gte(salary.date, from), lte(salary.date, to));

  const entries = await db
    .select()
    .from(salary)
    .where(period)
    .orderBy(desc(salary.date), desc(salary.id));

  // Сводка по сотрудникам за период (аналог SUMIFS H6:H24)
  const byEmpRaw = await db
    .select({
      employee: salary.employee,
      total: sql<string>`COALESCE(SUM(${salary.amount}), 0)`,
    })
    .from(salary)
    .where(period)
    .groupBy(salary.employee);

  const byEmployee = byEmpRaw
    .map((r) => ({ employee: r.employee, total: Number(r.total) }))
    .sort((a, b) => b.total - a.total);
  const totalPeriod = byEmployee.reduce((s, e) => s + e.total, 0);

  // ЗП за выбранную дату
  let dayTotal = 0;
  if (date && DATE_RE.test(date)) {
    const [d] = await db
      .select({ t: sql<string>`COALESCE(SUM(${salary.amount}), 0)` })
      .from(salary)
      .where(eq(salary.date, date));
    dayTotal = Number(d.t);
  }

  // Подсказки — ранее введённые имена
  const empRows = await db
    .selectDistinct({ employee: salary.employee })
    .from(salary)
    .orderBy(asc(salary.employee));
  const employees = empRows.map((r) => r.employee);

  return NextResponse.json({ entries, byEmployee, totalPeriod, dayTotal, employees });
}

const schema = z.object({
  date: z.string().regex(DATE_RE),
  employee: z.string().trim().min(1, "сотрудник обязателен"),
  amount: z.string().min(1, "сумма обязательна"),
  comment: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const e = parsed.data;
  const [entry] = await db
    .insert(salary)
    .values({
      date: e.date,
      employee: e.employee,
      amount: money(e.amount),
      comment: e.comment ?? "",
    })
    .returning();
  return NextResponse.json({ entry });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  await db.delete(salary).where(eq(salary.id, id));
  return NextResponse.json({ ok: true });
}
