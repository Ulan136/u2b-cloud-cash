import { asc, eq, sql } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db";
import { kons, suppliers } from "@/db/schema";

export type SupplierValues = typeof suppliers.$inferInsert;

export function all() {
  return db.select().from(suppliers).orderBy(asc(suppliers.name));
}

export function findById(id: number) {
  return db.select().from(suppliers).where(eq(suppliers.id, id));
}

export function create(values: SupplierValues) {
  return db.insert(suppliers).values(values).returning();
}

export function update(id: number, set: Partial<SupplierValues>) {
  return db.update(suppliers).set(set).where(eq(suppliers.id, id)).returning();
}

// Кол-во операций по поставщику
export function opCounts() {
  return db
    .select({ name: kons.supplier, n: sql<string>`COUNT(*)` })
    .from(kons)
    .groupBy(kons.supplier);
}

// Переименование с каскадом в kons — атомарно
export async function renameCascade(id: number, newName: string, oldName: string) {
  await sqlClient.transaction([
    sqlClient`UPDATE suppliers SET name = ${newName} WHERE id = ${id}`,
    sqlClient`UPDATE kons SET supplier = ${newName} WHERE supplier = ${oldName}`,
  ]);
}
