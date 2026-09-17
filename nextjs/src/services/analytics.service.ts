import { num } from "@/lib/money";
import * as expensesRepo from "@/repositories/expenses.repo";
import * as debtsRepo from "@/repositories/debts.repo";
import * as konsRepo from "@/repositories/kons.repo";
import * as salaryRepo from "@/repositories/salary.repo";

// «Кимбай» — получатель в журнале ЗАРПЛАТА (пишется по-разному: КИМБАЙ/кимбай).
const isKimbay = (name: string | null) => /кимба/i.test(name ?? "");

// Данные листа «АНАЛИЗ»: расходы по категориям за период, долги за период
// и общие остатки (конс/клиенты) за всё время.
export async function getAnalytics(from: string, to: string) {
  const [expenses, debtRows, debtGrand, konsBalances, salaryTotals] = await Promise.all([
    expensesRepo.findInPeriod(from, to),
    debtsRepo.findInPeriod(from, to),
    debtsRepo.grandTotals(),
    konsRepo.balancesRaw(), // за всё время
    salaryRepo.totalsByEmployee(from, to),
  ]);

  const byCategory = new Map<string, number>();
  let expensesTotal = 0;
  for (const e of expenses) {
    const a = num(e.amount);
    expensesTotal += a;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + a);
  }

  // ЗАРПЛАТА и Кимбай в «Анализах» берём из журнала зарплаты (как лист АНАЛИЗ:
  // Кимбай = 'ЗАРПЛАТА'!H12, ЗАРПЛАТА = сумма по остальным получателям).
  // Кимбай — отдельная строка, в ЗАРПЛАТА не входит; «ЗАРПЛАТА С КИМБАЙ» = ЗАРПЛАТА + Кимбай.
  let kimbay = 0;
  let zarplata = 0;
  for (const s of salaryTotals) {
    const t = num(s.total);
    if (isKimbay(s.employee)) kimbay += t;
    else zarplata += t;
  }
  // Убираем кассовую импортированную «ЗАРПЛАТА»/«Кимбай», заменяем на журнальные.
  for (const key of ["ЗАРПЛАТА", "Кимбай"]) {
    expensesTotal -= byCategory.get(key) ?? 0;
    byCategory.delete(key);
  }
  byCategory.set("ЗАРПЛАТА", zarplata);
  byCategory.set("Кимбай", kimbay);
  expensesTotal += zarplata + kimbay;

  const expensesByCategory = Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  let debtIssued = 0;
  let debtReceived = 0;
  for (const d of debtRows) {
    debtIssued += num(d.debtAmount);
    debtReceived += num(d.paymentAmount);
  }

  const [g] = debtGrand;
  const clientsOstatok = num(g?.debt) - num(g?.payment);
  const konsOstatok = konsBalances.reduce((s, b) => s + (num(b.prihod) - num(b.rashod)), 0);

  return {
    from,
    to,
    expensesTotal,
    expensesByCategory,
    period: { debtIssued, debtReceived },
    grand: { clientsOstatok, konsOstatok },
  };
}
