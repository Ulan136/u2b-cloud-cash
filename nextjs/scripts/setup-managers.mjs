// Создаёт таблицу managers + колонки author, и заводит первого админа (если нет).
// Запуск: DATABASE_URL="..." node scripts/setup-managers.mjs [ADMIN_LOGIN] [ADMIN_PASSWORD]
import { neon } from "@neondatabase/serverless";
import { randomBytes, scryptSync } from "crypto";

const hash = (pw) => {
  const s = randomBytes(16).toString("hex");
  return `${s}:${scryptSync(pw, s, 64).toString("hex")}`;
};

const adminLogin = process.argv[2] || "admin";
const adminPass = process.argv[3] || "admin123";

const CREATE = `CREATE TABLE IF NOT EXISTS managers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  login text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_admin boolean DEFAULT false,
  pages text,
  archived boolean DEFAULT false,
  created_at timestamp DEFAULT now()
)`;
const AUTHOR_TABLES = ["cash_days", "cash_expenses", "debts", "salary", "kons", "fin_ops"];

async function setup(url) {
  const sql = neon(url);
  const db = (await sql.query("SELECT current_database() AS db"))[0].db;
  await sql.query(CREATE);
  for (const t of AUTHOR_TABLES) {
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS author text`);
  }
  const existing = await sql.query("SELECT id FROM managers WHERE login=$1", [adminLogin]);
  if (existing.length === 0) {
    await sql.query(
      "INSERT INTO managers (name, login, password_hash, is_admin, pages) VALUES ($1,$2,$3,true,$4)",
      ["Админ", adminLogin, hash(adminPass), "[]"]
    );
    console.log(`[${db}] админ «${adminLogin}» создан`);
  } else {
    console.log(`[${db}] «${adminLogin}» уже существует — пропуск`);
  }
  const cnt = (await sql.query("SELECT count(*)::int n FROM managers"))[0].n;
  console.log(`[${db}] пользователей: ${cnt}`);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error("нет DATABASE_URL"); process.exit(1); }
setup(url).catch((e) => { console.error(e); process.exit(1); });
