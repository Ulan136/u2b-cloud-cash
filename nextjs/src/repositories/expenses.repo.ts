import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { cashExpenses } from "@/db/schema";

export type ExpenseValues = typeof cashExpenses.$inferInsert;

export function findByDate(date: string) {
  return db
    .select()
    .from(cashExpenses)
    .where(eq(cashExpenses.date, date))
    .orderBy(cashExpenses.id);
}

export function deleteByDate(date: string) {
  return db.delete(cashExpenses).where(eq(cashExpenses.date, date));
}

export function insertMany(rows: ExpenseValues[]) {
  return db.insert(cashExpenses).values(rows);
}

export function findInPeriod(from: string, to: string) {
  return db
    .select({
      date: cashExpenses.date,
      category: cashExpenses.category,
      amount: cashExpenses.amount,
    })
    .from(cashExpenses)
    .where(and(gte(cashExpenses.date, from), lte(cashExpenses.date, to)));
}
