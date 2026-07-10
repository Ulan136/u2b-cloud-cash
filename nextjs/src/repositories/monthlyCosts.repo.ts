import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { monthlyCosts } from "@/db/schema";

export function findByYear(year: number) {
  return db.select().from(monthlyCosts).where(eq(monthlyCosts.year, year));
}

export function upsert(year: number, month: number, sebestoimost: string) {
  return db
    .insert(monthlyCosts)
    .values({ year, month, sebestoimost })
    .onConflictDoUpdate({
      target: [monthlyCosts.year, monthlyCosts.month],
      set: { sebestoimost },
    });
}
