import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { cashDays } from "@/db/schema";

export type CashDayValues = typeof cashDays.$inferInsert;

export function findByDate(date: string) {
  return db.select().from(cashDays).where(eq(cashDays.date, date));
}

export function upsert(values: CashDayValues, set: Partial<CashDayValues>) {
  return db
    .insert(cashDays)
    .values(values)
    .onConflictDoUpdate({ target: cashDays.date, set });
}

export function findInPeriod(from: string, to: string) {
  return db
    .select()
    .from(cashDays)
    .where(and(gte(cashDays.date, from), lte(cashDays.date, to)))
    .orderBy(asc(cashDays.date));
}
