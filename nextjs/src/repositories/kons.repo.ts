import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { kons } from "@/db/schema";

export type KonsValues = typeof kons.$inferInsert;

function period(from: string, to: string) {
  return and(gte(kons.date, from), lte(kons.date, to));
}

export function historyBySupplier(supplier: string) {
  return db
    .select({
      id: kons.id,
      date: kons.date,
      prihod: kons.prihod,
      rashod: kons.rashod,
      comment: kons.comment,
    })
    .from(kons)
    .where(eq(kons.supplier, supplier))
    .orderBy(desc(kons.date), desc(kons.id));
}

export function findInPeriod(from: string, to: string) {
  return db
    .select()
    .from(kons)
    .where(period(from, to))
    .orderBy(desc(kons.date), desc(kons.id));
}

export function balancesRaw(opts?: { from?: string; to?: string }) {
  const cond =
    opts?.from && opts?.to ? period(opts.from, opts.to) : undefined;
  return db
    .select({
      supplier: kons.supplier,
      prihod: sql<string>`COALESCE(SUM(${kons.prihod}), 0)`,
      rashod: sql<string>`COALESCE(SUM(${kons.rashod}), 0)`,
    })
    .from(kons)
    .where(cond)
    .groupBy(kons.supplier);
}

export function distinctSuppliers() {
  return db
    .selectDistinct({ supplier: kons.supplier })
    .from(kons)
    .orderBy(asc(kons.supplier));
}

export function prihodRashodInPeriod(from: string, to: string) {
  return db
    .select({ prihod: kons.prihod, rashod: kons.rashod })
    .from(kons)
    .where(period(from, to));
}

export function create(values: KonsValues) {
  return db.insert(kons).values(values).returning();
}

export function updateById(id: number, values: Partial<KonsValues>) {
  return db.update(kons).set(values).where(eq(kons.id, id)).returning();
}

export function deleteById(id: number) {
  return db.delete(kons).where(eq(kons.id, id));
}
