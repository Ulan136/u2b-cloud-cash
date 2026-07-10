import { db } from "@/lib/db";
import { appSettings } from "@/db/schema";

export function all() {
  return db.select().from(appSettings);
}

export function upsert(key: string, value: string) {
  return db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
