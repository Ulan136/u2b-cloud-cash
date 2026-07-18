import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, debts } from "@/db/schema";

export type DebtValues = typeof debts.$inferInsert;

export function historyByClient(clientId: number) {
  return db
    .select({
      id: debts.id,
      date: debts.date,
      debtAmount: debts.debtAmount,
      paymentAmount: debts.paymentAmount,
      comment: debts.comment,
      returnDate: debts.returnDate,
    })
    .from(debts)
    .where(eq(debts.clientId, clientId))
    .orderBy(desc(debts.date), desc(debts.id));
}

export function entriesByDate(date: string) {
  return db
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
}

export function dayTotals(date: string) {
  return db
    .select({
      debt: sql<string>`COALESCE(SUM(${debts.debtAmount}), 0)`,
      payment: sql<string>`COALESCE(SUM(${debts.paymentAmount}), 0)`,
    })
    .from(debts)
    .where(eq(debts.date, date));
}

export function clientBalancesRaw(opts: { from?: string; to?: string; today: string }) {
  // период (если задан) применяем в условии JOIN, чтобы клиенты без строк не выпадали
  const joinCond =
    opts.from && opts.to
      ? and(
          eq(debts.clientId, clients.id),
          gte(debts.date, opts.from),
          lte(debts.date, opts.to)
        )
      : eq(debts.clientId, clients.id);

  return db
    .select({
      id: clients.id,
      name: clients.name,
      debts: sql<string>`COALESCE(SUM(${debts.debtAmount}), 0)`,
      payments: sql<string>`COALESCE(SUM(${debts.paymentAmount}), 0)`,
      hasOverdue: sql<boolean>`COALESCE(BOOL_OR(${debts.returnDate} IS NOT NULL AND ${debts.returnDate} < ${opts.today}), false)`,
    })
    .from(clients)
    .leftJoin(debts, joinCond)
    .groupBy(clients.id, clients.name);
}

export function create(values: DebtValues) {
  return db.insert(debts).values(values).returning();
}

export function updateById(id: number, values: Partial<DebtValues>) {
  return db.update(debts).set(values).where(eq(debts.id, id)).returning();
}

export function deleteById(id: number) {
  return db.delete(debts).where(eq(debts.id, id));
}

// Последние записи (для дашборда)
export function recent(limit: number) {
  return db
    .select({
      id: debts.id,
      date: debts.date,
      debtAmount: debts.debtAmount,
      paymentAmount: debts.paymentAmount,
      clientName: clients.name,
    })
    .from(debts)
    .leftJoin(clients, eq(clients.id, debts.clientId))
    .orderBy(desc(debts.id))
    .limit(limit);
}

// Итоги по всем долгам за всё время (для «Общий долг»)
export function grandTotals() {
  return db
    .select({
      debt: sql<string>`COALESCE(SUM(${debts.debtAmount}), 0)`,
      payment: sql<string>`COALESCE(SUM(${debts.paymentAmount}), 0)`,
    })
    .from(debts);
}

export function findInPeriod(from: string, to: string) {
  return db
    .select({
      date: debts.date,
      debtAmount: debts.debtAmount,
      paymentAmount: debts.paymentAmount,
    })
    .from(debts)
    .where(and(gte(debts.date, from), lte(debts.date, to)));
}
