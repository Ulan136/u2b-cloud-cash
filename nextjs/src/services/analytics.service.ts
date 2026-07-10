import { num } from "@/lib/money";
import * as expensesRepo from "@/repositories/expenses.repo";
import * as debtsRepo from "@/repositories/debts.repo";
import * as konsRepo from "@/repositories/kons.repo";

// Данные листа «АНАЛИЗ»: расходы по категориям за период, долги за период
// и общие остатки (конс/клиенты) за всё время.
export async function getAnalytics(from: string, to: string) {
  const [expenses, debtRows, debtGrand, konsBalances] = await Promise.all([
    expensesRepo.findInPeriod(from, to),
    debtsRepo.findInPeriod(from, to),
    debtsRepo.grandTotals(),
    konsRepo.balancesRaw(), // за всё время
  ]);

  const byCategory = new Map<string, number>();
  let expensesTotal = 0;
  for (const e of expenses) {
    const a = num(e.amount);
    expensesTotal += a;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + a);
  }
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
