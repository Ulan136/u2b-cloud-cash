import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { incassation } from "@/db/schema";

export type IncassationValues = typeof incassation.$inferInsert;

export function findInPeriod(from: string, to: string) {
  return db
    .select({
      id: incassation.id,
      date: incassation.date,
      cash: incassation.cash,
      kaspi: incassation.kaspi,
      halyk: incassation.halyk,
      comment: incassation.comment,
    })
    .from(incassation)
    .where(and(gte(incassation.date, from), lte(incassation.date, to)))
    .orderBy(desc(incassation.date), desc(incassation.id));
}

export function create(values: IncassationValues) {
  return db.insert(incassation).values(values).returning();
}

export function updateById(id: number, values: Partial<IncassationValues>) {
  return db.update(incassation).set(values).where(eq(incassation.id, id)).returning();
}

export function deleteById(id: number) {
  return db.delete(incassation).where(eq(incassation.id, id));
}
