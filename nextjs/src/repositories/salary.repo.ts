import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { salary } from "@/db/schema";

export type SalaryValues = typeof salary.$inferInsert;

function period(from: string, to: string) {
  return and(gte(salary.date, from), lte(salary.date, to));
}

export function findInPeriod(from: string, to: string) {
  return db
    .select()
    .from(salary)
    .where(period(from, to))
    .orderBy(desc(salary.date), desc(salary.id));
}

export function totalsByEmployee(from: string, to: string) {
  return db
    .select({
      employee: salary.employee,
      total: sql<string>`COALESCE(SUM(${salary.amount}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(salary)
    .where(period(from, to))
    .groupBy(salary.employee);
}

export function historyByEmployee(employee: string) {
  return db
    .select({
      id: salary.id,
      date: salary.date,
      amount: salary.amount,
      comment: salary.comment,
    })
    .from(salary)
    .where(eq(salary.employee, employee))
    .orderBy(desc(salary.date), desc(salary.id));
}

export function dayTotal(date: string) {
  return db
    .select({ t: sql<string>`COALESCE(SUM(${salary.amount}), 0)` })
    .from(salary)
    .where(eq(salary.date, date));
}

export function distinctEmployees() {
  return db
    .selectDistinct({ employee: salary.employee })
    .from(salary)
    .orderBy(asc(salary.employee));
}

export function amountsInPeriod(from: string, to: string) {
  return db.select({ amount: salary.amount }).from(salary).where(period(from, to));
}

export function recent(limit: number) {
  return db
    .select({ id: salary.id, date: salary.date, employee: salary.employee, amount: salary.amount })
    .from(salary)
    .orderBy(desc(salary.id))
    .limit(limit);
}

export function create(values: SalaryValues) {
  return db.insert(salary).values(values).returning();
}

export function updateById(id: number, values: Partial<SalaryValues>) {
  return db.update(salary).set(values).where(eq(salary.id, id)).returning();
}

export function deleteById(id: number) {
  return db.delete(salary).where(eq(salary.id, id));
}
