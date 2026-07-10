import { money, num } from "@/lib/money";
import { computeMinPlus, computeObshchReal } from "@/services/kassa.service";
import * as cashDaysRepo from "@/repositories/cashDays.repo";
import * as expensesRepo from "@/repositories/expenses.repo";
import * as debtsRepo from "@/repositories/debts.repo";
import * as salaryRepo from "@/repositories/salary.repo";
import * as konsRepo from "@/repositories/kons.repo";
import * as monthlyCostsRepo from "@/repositories/monthlyCosts.repo";

const round2 = (x: number) => Math.round(x * 100) / 100;
const monthIdx = (date: string) => Number(date.slice(5, 7)) - 1;

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

// Годовая таблица «месяцы колонками» (лист «Отчет месяц»).
export async function getYear(year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [days, expenses, debtRows, costs] = await Promise.all([
    cashDaysRepo.findInPeriod(from, to),
    expensesRepo.findInPeriod(from, to),
    debtsRepo.findInPeriod(from, to),
    monthlyCostsRepo.findByYear(year),
  ]);

  // Расходы: по дню (для дневного ОБЩ РЕАЛ) и по месяцу (строка «Расход» = все расходы месяца)
  const expensesByDate = new Map<string, number>();
  const rashodByMonth = new Array(12).fill(0);
  for (const e of expenses) {
    const a = num(e.amount);
    expensesByDate.set(e.date, (expensesByDate.get(e.date) ?? 0) + a);
    rashodByMonth[monthIdx(e.date)] += a;
  }

  // Долги по дню (для дневного ОБЩ РЕАЛ)
  const debtsByDate = new Map<string, { debt: number; payment: number }>();
  for (const d of debtRows) {
    const cur = debtsByDate.get(d.date) ?? { debt: 0, payment: 0 };
    cur.debt += num(d.debtAmount);
    cur.payment += num(d.paymentAmount);
    debtsByDate.set(d.date, cur);
  }

  // Себестоимость помесячно
  const sebestByMonth = new Array(12).fill(0);
  for (const c of costs) sebestByMonth[c.month - 1] = num(c.sebestoimost);

  // Агрегаты по месяцам из cash_days + дневной ОБЩ РЕАЛ (формула из kassa.service)
  const acc = Array.from({ length: 12 }, () => ({
    klaud: 0,
    nalichnye: 0,
    kaspi: 0,
    halyk: 0,
    obshchReal: 0,
  }));
  for (const day of days) {
    const i = monthIdx(day.date);
    const nal = num(day.nalichnye);
    const kas = num(day.kaspi);
    const hal = num(day.halyk);
    const dd = debtsByDate.get(day.date) ?? { debt: 0, payment: 0 };
    const obshchReal = computeObshchReal({
      nal,
      kas,
      hal,
      rashod: expensesByDate.get(day.date) ?? 0,
      zakup: num(day.zakupTovar),
      inkas: num(day.inkasNalichka),
      debt: dd.debt,
      vozvrat: num(day.vozvrat),
      vozvratDolg: dd.payment,
    });
    acc[i].klaud += num(day.klaudObshch);
    acc[i].nalichnye += nal;
    acc[i].kaspi += kas;
    acc[i].halyk += hal;
    acc[i].obshchReal += obshchReal;
  }

  const months = acc.map((m, i) => {
    const rashod = round2(rashodByMonth[i]);
    const klaud = round2(m.klaud);
    const obshchReal = round2(m.obshchReal);
    const sebestoimost = round2(sebestByMonth[i]);
    const raznica = round2(obshchReal - klaud);
    const gross = round2(klaud - sebestoimost);
    const net = round2(gross - rashod);
    return {
      month: i + 1,
      klaud,
      obshchReal,
      nalichnye: round2(m.nalichnye),
      kaspi: round2(m.kaspi),
      halyk: round2(m.halyk),
      rashod,
      raznica,
      sebestoimost,
      gross,
      net,
    };
  });

  const sum = (k: keyof (typeof months)[number]) =>
    round2(months.reduce((s, m) => s + (m[k] as number), 0));
  const totals = {
    klaud: sum("klaud"),
    obshchReal: sum("obshchReal"),
    nalichnye: sum("nalichnye"),
    kaspi: sum("kaspi"),
    halyk: sum("halyk"),
    rashod: sum("rashod"),
    raznica: round2(sum("obshchReal") - sum("klaud")),
    sebestoimost: sum("sebestoimost"),
    gross: round2(sum("klaud") - sum("sebestoimost")),
    net: round2(sum("klaud") - sum("sebestoimost") - sum("rashod")),
  };

  return { year, months, totals };
}

export async function setMonthlyCost(year: number, month: number, sebestoimost: string) {
  await monthlyCostsRepo.upsert(year, month, money(sebestoimost));
  return { ok: true };
}
