import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

// Общее подключение к БД (Neon + Drizzle). Используется только слоем repositories.
// sqlClient — «сырой» neon-клиент для атомарных батчей (sqlClient.transaction([...])),
// т.к. neon-http драйвер не поддерживает интерактивные транзакции drizzle.
export const sqlClient = neon(process.env.DATABASE_URL!);

export const db = drizzle(sqlClient, { schema });
