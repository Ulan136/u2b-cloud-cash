import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, debts } from "@/db/schema";

export type ClientValues = typeof clients.$inferInsert;

export function all() {
  return db.select().from(clients).orderBy(asc(clients.name));
}

export function findById(id: number) {
  return db.select().from(clients).where(eq(clients.id, id));
}

export function create(values: ClientValues) {
  return db.insert(clients).values(values).returning();
}

export function update(id: number, set: Partial<ClientValues>) {
  return db.update(clients).set(set).where(eq(clients.id, id)).returning();
}

// Кол-во операций (долгов) по клиенту
export function opCounts() {
  return db
    .select({ id: debts.clientId, n: sql<string>`COUNT(*)` })
    .from(debts)
    .groupBy(debts.clientId);
}
