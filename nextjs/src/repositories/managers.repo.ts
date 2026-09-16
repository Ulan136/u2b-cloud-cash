import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { managers } from "@/db/schema";

export type ManagerValues = typeof managers.$inferInsert;

export function all() {
  return db.select().from(managers).orderBy(asc(managers.name));
}
export function byId(id: number) {
  return db.select().from(managers).where(eq(managers.id, id));
}
export function byLogin(login: string) {
  return db.select().from(managers).where(eq(managers.login, login));
}
export function create(values: ManagerValues) {
  return db.insert(managers).values(values).returning();
}
export function updateById(id: number, values: Partial<ManagerValues>) {
  return db.update(managers).set(values).where(eq(managers.id, id)).returning();
}
export function deleteById(id: number) {
  return db.delete(managers).where(eq(managers.id, id));
}
