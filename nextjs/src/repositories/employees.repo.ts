import { asc, eq, sql } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db";
import { employees, salary } from "@/db/schema";

export type EmployeeValues = typeof employees.$inferInsert;

export function all() {
  return db.select().from(employees).orderBy(asc(employees.name));
}

export function findById(id: number) {
  return db.select().from(employees).where(eq(employees.id, id));
}

export function create(values: EmployeeValues) {
  return db.insert(employees).values(values).returning();
}

export function update(id: number, set: Partial<EmployeeValues>) {
  return db.update(employees).set(set).where(eq(employees.id, id)).returning();
}

// Кол-во операций (выплат) по имени работника
export function opCounts() {
  return db
    .select({ name: salary.employee, n: sql<string>`COUNT(*)` })
    .from(salary)
    .groupBy(salary.employee);
}

// Переименование с каскадом в salary — атомарно (batch-транзакция neon-http).
export async function renameCascade(id: number, newName: string, oldName: string) {
  await sqlClient.transaction([
    sqlClient`UPDATE employees SET name = ${newName} WHERE id = ${id}`,
    sqlClient`UPDATE salary SET employee = ${newName} WHERE employee = ${oldName}`,
  ]);
}
