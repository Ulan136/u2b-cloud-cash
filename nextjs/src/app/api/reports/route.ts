import { NextRequest, NextResponse } from "next/server";
import { and, asc, gte, lte, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import { cashDays, cashExpenses, debts, kons, salary } from "@/db/schema";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }

  const inPeriod = (col: AnyColumn) => and(gte(col, from), lte(col, to));

  const [days, expenses, debtRows, salaryRows, konsRows] = await Promise.all([
    db.select().from(cashDays).where(inPeriod(cashDays.date)).orderBy(asc(cashDays.date)),
    db
      .select({
        date: cashExpenses.date,
        category: cashExpenses.category,
        amount: cashExpenses.amount,
      })
      .from(cashExpenses)
      .where(inPeriod(cashExpenses.date)),
    db
      .select({
        date: debts.date,
        debtAmount: debts.debtAmount,
        paymentAmount: debts.paymentAmount,
      })
      .from(debts)
      .where(inPeriod(debts.date)),
    db
      .select({ amount: salary.amount })
      .from(salary)
      .where(inPeriod(salary.date)),
    db
      .select({ prihod: kons.prihod, rashod: kons.rashod })
      .from(kons)
      .where(inPeriod(kons.date)),
  ]);

  // Агрегаты расходов
  const expensesByDate = new Map<string, number>();
  const expensesByCategory = new Map<string, number>();
  let expensesTotal = 0;
  for (const e of expenses) {
    const a = n(e.amount);
    expensesTotal += a;
    expensesByDate.set(e.date, (expensesByDate.get(e.date) ?? 0) + a);
    expensesByCategory.set(
      e.category,
      (expensesByCategory.get(e.category) ?? 0) + a
    );
  }

  // Агрегаты долгов по дням
  const debtsByDate = new Map<string, { debt: number; payment: number }>();
  let debtsIssued = 0;
  let debtsReceived = 0;
  for (const d of debtRows) {
    const debt = n(d.debtAmount);
    const pay = n(d.paymentAmount);
    debtsIssued += debt;
    debtsReceived += pay;
    const cur = debtsByDate.get(d.date) ?? { debt: 0, payment: 0 };
    cur.debt += debt;
    cur.payment += pay;
    debtsByDate.set(d.date, cur);
  }

  // Разрыв кассы по дням
  let sales = 0;
  let sebestoimost = 0;
  let nalichnye = 0;
  let kaspi = 0;
  let halyk = 0;
  let accumulated = 0;
  const perDay = days.map((day) => {
    const klaud = n(day.klaudObshch);
    const nal = n(day.nalichnye);
    const kas = n(day.kaspi);
    const hal = n(day.halyk);
    const inkas = n(day.inkasNalichka);
    const vozvrat = n(day.vozvrat);
    const zakup = n(day.zakupTovar);
    const rashodDay = expensesByDate.get(day.date) ?? 0;
    const dd = debtsByDate.get(day.date) ?? { debt: 0, payment: 0 };

    const obshchReal =
      nal + kas + hal + (rashodDay + zakup + inkas + dd.debt + vozvrat) - dd.payment;
    const minPlus = Math.round((obshchReal - klaud) * 100) / 100;

    sales += klaud;
    sebestoimost += n(day.sebestoimost);
    nalichnye += nal;
    kaspi += kas;
    halyk += hal;
    accumulated += minPlus;

    return {
      date: day.date,
      klaud,
      sebestoimost: n(day.sebestoimost),
      obshchReal: Math.round(obshchReal * 100) / 100,
      minPlus,
    };
  });
  accumulated = Math.round(accumulated * 100) / 100;

  const salaryTotal = salaryRows.reduce((s, r) => s + n(r.amount), 0);
  const gross = sales - sebestoimost;
  const net = gross - expensesTotal - salaryTotal;

  const konsPrihod = konsRows.reduce((s, r) => s + n(r.prihod), 0);
  const konsRashod = konsRows.reduce((s, r) => s + n(r.rashod), 0);

  const expensesByCategoryArr = Array.from(expensesByCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    from,
    to,
    gap: { accumulated, perDay },
    profit: {
      sales,
      sebestoimost,
      gross,
      expenses: expensesTotal,
      salary: salaryTotal,
      net,
    },
    summary: {
      nalichnye,
      kaspi,
      halyk,
      expensesByCategory: expensesByCategoryArr,
      debts: {
        issued: debtsIssued,
        received: debtsReceived,
        delta: debtsIssued - debtsReceived,
      },
      salaryTotal,
      kons: { prihod: konsPrihod, rashod: konsRashod },
    },
  });
}
