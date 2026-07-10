import { num } from "@/lib/money";
import { computeMinPlus, computeObshchReal, getDay, listRecentDays } from "@/services/kassa.service";
import { getAccounts } from "@/services/finance.service";
import * as debtsRepo from "@/repositories/debts.repo";
import * as expensesRepo from "@/repositories/expenses.repo";
import * as salaryRepo from "@/repositories/salary.repo";
import * as konsRepo from "@/repositories/kons.repo";
import * as finRepo from "@/repositories/finance.repo";

type Op = { type: string; name: string; amount: number; tone: "in" | "out" | "transfer"; date: string };

export async function getDashboard(date: string, chartFrom: string) {
  const [dayData, salToday, debtGrand, konsBal, finance, chartDays, dr, er, sr, fr, accNames] =
    await Promise.all([
      getDay(date),
      salaryRepo.dayTotal(date),
      debtsRepo.grandTotals(),
      konsRepo.balancesRaw(),
      getAccounts(),
      listRecentDays(chartFrom, date),
      debtsRepo.recent(10),
      expensesRepo.recent(10),
      salaryRepo.recent(10),
      finRepo.recentOps(10),
      finRepo.accountNames(),
    ]);

  // Показатели «сегодня»
  const day = dayData.day;
  const klaud = num(day?.klaudObshch);
  const nal = num(day?.nalichnye);
  const kas = num(day?.kaspi);
  const hal = num(day?.halyk);
  const expensesTotal = (dayData.expenses ?? []).reduce((s, e) => s + num(e.amount), 0);
  const debtToday = num(dayData.totals?.debt);
  const paymentToday = num(dayData.totals?.payment);
  const obshchReal = computeObshchReal({
    nal,
    kas,
    hal,
    rashod: expensesTotal,
    zakup: num(day?.zakupTovar),
    inkas: num(day?.inkasNalichka),
    debt: debtToday,
    vozvrat: num(day?.vozvrat),
    vozvratDolg: paymentToday,
  });
  const minPlus = computeMinPlus(obshchReal, klaud);

  const clientsOstatok = num(debtGrand[0]?.debt) - num(debtGrand[0]?.payment);
  const konsOstatok = konsBal.reduce((s, b) => s + (num(b.prihod) - num(b.rashod)), 0);

  // Мини-график: последние дни в хронологии (старые слева)
  const chart = [...(chartDays.days ?? [])]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({ date: d.date, minPlus: d.minPlus }));

  // Последние операции (объединяем источники)
  const nameById = new Map(accNames.map((a) => [a.id, a.name]));
  const ops: Op[] = [];
  for (const d of dr) {
    if (num(d.debtAmount) > 0)
      ops.push({ type: "Долг выдан", name: d.clientName ?? "—", amount: num(d.debtAmount), tone: "out", date: d.date });
    if (num(d.paymentAmount) > 0)
      ops.push({ type: "Оплата долга", name: d.clientName ?? "—", amount: num(d.paymentAmount), tone: "in", date: d.date });
  }
  for (const e of er)
    ops.push({ type: `Расход: ${e.category}`, name: e.category, amount: num(e.amount), tone: "out", date: e.date });
  for (const s of sr)
    ops.push({ type: "Зарплата", name: s.employee, amount: num(s.amount), tone: "out", date: s.date });
  for (const o of fr)
    ops.push({
      type: `Финансы: ${o.type}`,
      name: nameById.get(o.accountId) ?? "—",
      amount: num(o.amount),
      tone: o.type === "Приход" ? "in" : o.type === "Перевод" ? "transfer" : "out",
      date: o.date,
    });
  ops.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    date,
    today: { klaud, obshchReal: Math.round(obshchReal * 100) / 100, minPlus },
    shift: {
      closed: !!day?.closed,
      closedAt: day?.closedAt ?? null,
      closedBy: day?.closedBy ?? null,
    },
    debts: { grandOstatok: clientsOstatok, todayIssued: debtToday, todayReceived: paymentToday },
    kons: { grandOstatok: konsOstatok },
    salaryToday: Number(salToday[0]?.t ?? 0),
    finance,
    chart,
    recentOps: ops.slice(0, 10),
  };
}
