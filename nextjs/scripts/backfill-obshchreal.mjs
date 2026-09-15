// Бэкфилл дневного «ОБЩ РЕАЛ» в cash_days.obshch_real (только UPDATE по датам).
// Источник — те же .xlsx. Цель — база из DATABASE_URL (по умолчанию должна быть megabazar).
// Запуск: DATABASE_URL="...megabazar..." node scripts/backfill-obshchreal.mjs f1.xlsx f2.xlsx
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

const EXPECTED_DB = "megabazar";
const files = process.argv.slice(2);
if (!process.env.DATABASE_URL) { console.error("нет DATABASE_URL"); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);

const ed = (n) => (typeof n === "number" && n > 40000 && n < 60000 ? new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// date -> obshchReal (берём значение с бо́льшим модулем, как в основном импорте)
const map = {};
for (const f of files) {
  const wb = xlsx.readFile(f, { cellDates: false });
  const ws = wb.Sheets["Касса"];
  if (!ws) continue;
  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  for (const row of aoa) {
    const date = ed((row || [])[0]);
    if (!date) continue;
    const label = typeof row[1] === "string" ? row[1].trim() : null;
    if (label !== "ОБЩ РЕАЛ") continue;
    const c = num(row[2]);
    if (Math.abs(c) >= Math.abs(map[date] ?? 0)) map[date] = c;
  }
}

async function main() {
  const dbName = (await sql`SELECT current_database() AS db`)[0].db;
  console.log("▶ база:", dbName);
  if (dbName !== EXPECTED_DB) { console.error(`❌ ожидалась ${EXPECTED_DB}, а это ${dbName}`); process.exit(1); }

  const dates = Object.keys(map);
  console.log("▶ дат с ОБЩ РЕАЛ в файлах:", dates.length);
  let updated = 0;
  // батчами по 400
  for (let i = 0; i < dates.length; i += 400) {
    const part = dates.slice(i, i + 400);
    for (const d of part) {
      const r = await sql`UPDATE cash_days SET obshch_real = ${String(map[d])} WHERE date = ${d}`;
      // neon-http возвращает массив; кол-во затронутых строк не всегда доступно — считаем по существованию
    }
    updated += part.length;
  }
  // Сверка: сумма obshch_real по паре месяцев
  for (const m of ["2026-09", "2026-08", "2025-12"]) {
    const [r] = await sql`SELECT COALESCE(SUM(obshch_real),0) v, COUNT(obshch_real)::int n FROM cash_days WHERE to_char(date,'YYYY-MM') = ${m}`;
    console.log(`  ${m}: сумма ОБЩ РЕАЛ = ${r.v}  (заполнено дней ${r.n})`);
  }
  const [tot] = await sql`SELECT COUNT(*)::int total, COUNT(obshch_real)::int filled FROM cash_days`;
  console.log(`▶ cash_days: всего ${tot.total}, с obshch_real ${tot.filled}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
