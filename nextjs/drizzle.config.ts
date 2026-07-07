import { readFileSync } from "fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit CLI не читает .env.local автоматически — подгружаем вручную.
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // .env.local отсутствует — используем переменные окружения как есть
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
