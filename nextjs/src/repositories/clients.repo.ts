import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/db/schema";

export type ClientValues = typeof clients.$inferInsert;

export function all() {
  return db.select().from(clients).orderBy(asc(clients.name));
}

export function create(values: ClientValues) {
  return db.insert(clients).values(values).returning();
}
