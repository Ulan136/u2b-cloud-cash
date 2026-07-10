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

export function clientBalancesRaw() {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      debts: sql<string>`COALESCE(SUM(${debts.debtAmount}), 0)`,
      payments: sql<string>`COALESCE(SUM(${debts.paymentAmount}), 0)`,
    })
    .from(clients)
    .leftJoin(debts, eq(debts.clientId, clients.id))
    .groupBy(clients.id, clients.name);
}

export function create(values: DebtValues) {
  return db.insert(debts).values(values).returning();
}

export function deleteById(id: number) {
  return db.delete(debts).where(eq(debts.id, id));
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
