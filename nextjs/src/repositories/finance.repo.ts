import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { finAccounts, finCategories, finFavs, finOps } from "@/db/schema";

export type AccountValues = typeof finAccounts.$inferInsert;
export type OpValues = typeof finOps.$inferInsert;
export type FavValues = typeof finFavs.$inferInsert;

// ── categories / accounts ──
export function categories() {
  return db.select().from(finCategories).orderBy(asc(finCategories.id));
}

export function accounts() {
  return db.select().from(finAccounts).orderBy(asc(finAccounts.id));
}

export function accountNames() {
  return db.select({ id: finAccounts.id, name: finAccounts.name }).from(finAccounts);
}

export function createAccount(values: AccountValues) {
  return db.insert(finAccounts).values(values).returning();
}

export function updateAccount(id: number, set: Partial<AccountValues>) {
  return db.update(finAccounts).set(set).where(eq(finAccounts.id, id)).returning();
}

// ── ops ──
export function allOps() {
  return db
    .select({
      accountId: finOps.accountId,
      type: finOps.type,
      amount: finOps.amount,
      toAccountId: finOps.toAccountId,
    })
    .from(finOps);
}

export function findOps(filters: { from?: string; to?: string; accountId?: number }) {
  const conds: SQL[] = [];
  if (filters.from) conds.push(gte(finOps.date, filters.from));
  if (filters.to) conds.push(lte(finOps.date, filters.to));
  if (filters.accountId !== undefined) conds.push(eq(finOps.accountId, filters.accountId));
  return db
    .select()
    .from(finOps)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(finOps.date), desc(finOps.id));
}

export function createOp(values: OpValues) {
  return db.insert(finOps).values(values).returning();
}

export function deleteOp(id: number) {
  return db.delete(finOps).where(eq(finOps.id, id));
}

// ── favs ──
export function favs() {
  return db.select().from(finFavs).orderBy(asc(finFavs.id));
}

export function createFav(values: FavValues) {
  return db.insert(finFavs).values(values).returning();
}

export function deleteFav(id: number) {
  return db.delete(finFavs).where(eq(finFavs.id, id));
}
