// Переимпорт ТОЛЬКО таблицы kons в megabazar из листа «КОНС» файла 2026.
// Удаляет все строки kons и заливает детальные строки файла как есть.
// Другие таблицы (debts/salary/cash/clients) НЕ трогаются.
// Запуск: DATABASE_URL="...megabazar..." node scripts/reimport-kons-megabazar.mjs "C:/Users/User/Downloads/MegaStroy 2026.xlsx"
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

const EXPECTED = "megabazar";
const file = process.argv[2];
if (!file) { console.error("❌ укажи путь к xlsx"); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);

const ed = (n) => (typeof n === "number" && n > 40000 && n < 60000 ? new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const money = (v) => String(num(v));

function parseKons() {
  const wb = xlsx.readFile(file, { cellDates: false });
  const rows = xlsx.utils.sheet_to_json(wb.Sheets["КОНС"], { header: 1, defval: null, blankrows: true, raw: true });
  const out = [];
  for (const r of rows) {
    const date = ed((r || [])[0]);
    const b = typeof r[1] === "string" ? r[1].trim() : null;
    if (date && b && b !== "ФИО")
      out.push({ date, supplier: b, prihod: money(r[2]), rashod: money(r[3]), comment: str(r[4]) });
  }
  return out;
}

async function bulkInsert(table, cols, rows, chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const ph = part.map((_, ri) => `(${cols.map((__, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`).join(",");
    const params = part.flatMap((r) => cols.map((c) => r[c]));
    await sql.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${ph}`, params);
  }
}

async function main() {
  const db = (await sql`SELECT current_database() AS db`)[0].db;
  console.log("▶ база:", db);
  if (db !== EXPECTED) { console.error(`❌ ожидалась ${EXPECTED}, а это ${db} — отмена`); process.exit(1); }

  const kons = parseKons();
  const p = kons.reduce((s, k) => s + num(k.prihod), 0);
  const r = kons.reduce((s, k) => s + num(k.rashod), 0);
  console.log(`▶ из файла: строк=${kons.length}  Σприход=${Math.round(p)}  Σоплата=${Math.round(r)}  остаток=${Math.round(p - r)}`);

  const before = (await sql`SELECT COUNT(*)::int n FROM kons`)[0].n;
  console.log(`▶ было в БД строк kons: ${before} — удаляю…`);
  await sql`DELETE FROM kons`;

  await bulkInsert("kons", ["date", "supplier", "prihod", "rashod", "comment"], kons);

  const after = (await sql`SELECT COALESCE(SUM(prihod),0) p, COALESCE(SUM(rashod),0) r, COUNT(*)::int n FROM kons`)[0];
  console.log("\n=== ПОСЛЕ ИМПОРТА ===");
  console.log(`  строк=${after.n}  Σприход=${Math.round(Number(after.p))}  Σоплата=${Math.round(Number(after.r))}  остаток=${Math.round(Number(after.p) - Number(after.r))}`);
  if (after.n !== kons.length) console.warn(`  ⚠ вставлено ${after.n}, ожидалось ${kons.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
