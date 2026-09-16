// Перезалив ДОЛГИ/КОНС/ЗАРПЛАТА в megabazar ТОЛЬКО из файла 2026 (он самодостаточен).
// Исправляет задвоение из-за склейки двух перекрывающихся файлов при первом импорте.
// Касса не трогается. Запуск: DATABASE_URL="...megabazar..." node scripts/fix-debts-kons-salary.mjs "2026.xlsx"
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

const EXPECTED = "megabazar";
const file = process.argv[2];
const sql = neon(process.env.DATABASE_URL);
const ed = (n) => (typeof n === "number" && n > 40000 && n < 60000 ? new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const money = (v) => String(num(v));

function aoa(name) {
  const wb = xlsx.readFile(file, { cellDates: false });
  return xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, blankrows: true, raw: true });
}

async function bulkInsert(table, cols, rows, chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const ph = part.map((_, ri) => `(${cols.map((__, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`).join(",");
    const params = part.flatMap((r) => cols.map((c) => r[c]));
    await sql.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${ph}`, params);
  }
}

function parseDebts() {
  const out = [];
  for (const r of aoa("Долг внес")) {
    const date = ed((r || [])[0]);
    const b = typeof r[1] === "string" ? r[1].trim() : null;
    if (date && b && b !== "ФИО" && b !== "ФИО / Наименование")
      out.push({ date, name: b, debt: money(r[2]), pay: money(r[3]), comment: str(r[4]), ret: ed(r[5]) });
  }
  return out;
}
function parseKons() {
  const out = [];
  for (const r of aoa("КОНС")) {
    const date = ed((r || [])[0]);
    const b = typeof r[1] === "string" ? r[1].trim() : null;
    if (date && b && b !== "ФИО") out.push({ date, supplier: b, prihod: money(r[2]), rashod: money(r[3]), comment: str(r[4]) });
  }
  return out;
}
function parseSalary() {
  const out = [];
  for (const r of aoa("ЗАРПЛАТА")) {
    const date = ed((r || [])[0]);
    const b = typeof r[1] === "string" ? r[1].trim() : null;
    if (date && b && b !== "ФИО") out.push({ date, employee: b, amount: money(r[2]), comment: str(r[3]) });
  }
  return out;
}

async function main() {
  const db = (await sql`SELECT current_database() AS db`)[0].db;
  console.log("▶ база:", db);
  if (db !== EXPECTED) { console.error(`❌ ожидалась ${EXPECTED}, а это ${db}`); process.exit(1); }

  const debts = parseDebts(), kons = parseKons(), salary = parseSalary();
  console.log(`▶ из файла 2026: долгов=${debts.length}, КОНС=${kons.length}, зарплат=${salary.length}`);

  // клиенты: создаём недостающих
  const cRows = await sql`SELECT id, name FROM clients`;
  const cid = new Map(cRows.map((c) => [c.name, c.id]));
  const missing = [...new Set(debts.map((d) => d.name))].filter((n) => !cid.has(n));
  for (const n of missing) {
    const [c] = await sql`INSERT INTO clients (name) VALUES (${n}) RETURNING id, name`;
    cid.set(n, c.id);
  }
  console.log(`▶ клиентов дозаведено: ${missing.length}`);

  console.log("▶ удаляю старые долги/КОНС/зарплату…");
  await sql`DELETE FROM debts`;
  await sql`DELETE FROM kons`;
  await sql`DELETE FROM salary`;

  await bulkInsert("debts", ["date", "client_id", "debt_amount", "payment_amount", "comment", "return_date"],
    debts.map((d) => ({ date: d.date, client_id: cid.get(d.name), debt_amount: d.debt, payment_amount: d.pay, comment: d.comment, return_date: d.ret })));
  await bulkInsert("kons", ["date", "supplier", "prihod", "rashod", "comment"], kons);
  await bulkInsert("salary", ["date", "employee", "amount", "comment"], salary);

  const dDebt = (await sql`SELECT COALESCE(SUM(debt_amount),0)-COALESCE(SUM(payment_amount),0) v, COUNT(*)::int n FROM debts`)[0];
  const dKons = (await sql`SELECT COALESCE(SUM(prihod),0)-COALESCE(SUM(rashod),0) v, COUNT(*)::int n FROM kons`)[0];
  const dSal = (await sql`SELECT COALESCE(SUM(amount),0) v, COUNT(*)::int n FROM salary`)[0];
  console.log("\n=== ПОСЛЕ ФИКСА ===");
  console.log(`  Долги: остаток=${Math.round(Number(dDebt.v))} (${dDebt.n} записей)  [ожидалось 32388654]`);
  console.log(`  КОНС:  остаток=${Math.round(Number(dKons.v))} (${dKons.n} записей)  [ожидалось 28014596]`);
  console.log(`  Зарплата: сумма=${Math.round(Number(dSal.v))} (${dSal.n} записей)  [ожидалось 49436500]`);
}
main().catch((e) => { console.error(e); process.exit(1); });
