import { num } from "@/lib/money";
import { computeMinPlus, computeObshchReal } from "@/services/kassa.service";
import * as cashDaysRepo from "@/repositories/cashDays.repo";
import * as expensesRepo from "@/repositories/expenses.repo";
import * as debtsRepo from "@/repositories/debts.repo";
import * as salaryRepo from "@/repositories/salary.repo";
import * as konsRepo from "@/repositories/kons.repo";

export async function getReport(from: string, to: string) {
  const [days, expenses, debtRows, salaryRows, konsRows] = await Promise.all([
    cashDaysRepo.findInPeriod(from, to),
    expensesRepo.findInPeriod(from, to),
    debtsRepo.findInPeriod(from, to),
    salaryRepo.amountsInPeriod(from, to),
    konsRepo.prihodRashodInPeriod(from, to),
  ]);

  // Агрегаты расходов
  const expensesByDate = new Map<string, number>();
  const expensesByCategory = new Map<string, number>();
  let expensesTotal = 0;
  for (const e of expenses) {
    const a = num(e.amount);
    expensesTotal += a;
    expensesByDate.set(e.date, (expensesByDate.get(e.date) ?? 0) + a);
    expensesByCategory.set(e.category, (expensesByCategory.get(e.category) ?? 0) + a);
  }

  // Агрегаты долгов по дням
  const debtsByDate = new Map<string, { debt: number; payment: number }>();
  let debtsIssued = 0;
  let debtsReceived = 0;
  for (const d of debtRows) {
    const debt = num(d.debtAmount);
    const pay = num(d.paymentAmount);
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
    const klaud = num(day.klaudObshch);
    const nal = num(day.nalichnye);
    const kas = num(day.kaspi);
    const hal = num(day.halyk);
    const inkas = num(day.inkasNalichka);
    const vozvrat = num(day.vozvrat);
    const zakup = num(day.zakupTovar);
    const rashodDay = expensesByDate.get(day.date) ?? 0;
    const dd = debtsByDate.get(day.date) ?? { debt: 0, payment: 0 };

    const obshchReal = computeObshchReal({
      nal,
      kas,
      hal,
      rashod: rashodDay,
      zakup,
      inkas,
      debt: dd.debt,
      vozvrat,
      vozvratDolg: dd.payment,
    });
    const minPlus = computeMinPlus(obshchReal, klaud);

    sales += klaud;
    sebestoimost += num(day.sebestoimost);
    nalichnye += nal;
    kaspi += kas;
    halyk += hal;
    accumulated += minPlus;

    return {
      date: day.date,
      klaud,
      sebestoimost: num(day.sebestoimost),
      obshchReal: Math.round(obshchReal * 100) / 100,
      minPlus,
    };
  });
  accumulated = Math.round(accumulated * 100) / 100;

  const salaryTotal = salaryRows.reduce((s, r) => s + num(r.amount), 0);
  const gross = sales - sebestoimost;
  const net = gross - expensesTotal - salaryTotal;

  const konsPrihod = konsRows.reduce((s, r) => s + num(r.prihod), 0);
  const konsRashod = konsRows.reduce((s, r) => s + num(r.rashod), 0);

  const expensesByCategoryArr = Array.from(expensesByCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
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
  };
}
