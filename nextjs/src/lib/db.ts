import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

// Общее подключение к БД (Neon + Drizzle). Используется только слоем repositories.
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
