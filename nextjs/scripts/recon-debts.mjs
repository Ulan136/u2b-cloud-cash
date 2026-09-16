// Диагностика долгов: диапазоны/суммы по каждому файлу + сравнение с базой megabazar.
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

const files = process.argv.slice(2);
const sql = neon(process.env.DATABASE_URL);
const ed = (n) => (typeof n === "number" && n > 40000 && n < 60000 ? new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function parseFile(path) {
  const wb = xlsx.readFile(path, { cellDates: false });
  const ws = wb.Sheets["Долг внес"];
  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  const rows = [];
  for (const r of aoa) {
    const date = ed((r || [])[0]);
    const b = typeof r[1] === "string" ? r[1].trim() : null;
    if (date && b && b !== "ФИО" && b !== "ФИО / Наименование") {
      rows.push({ date, name: b, debt: num(r[2]), pay: num(r[3]) });
    }
  }
  return rows;
}

async function main() {
  console.log("=== ПО ФАЙЛАМ (лист «Долг внес») ===");
  const perFile = [];
  for (const f of files) {
    const rows = parseFile(f);
    const dates = rows.map((r) => r.date).sort();
    const ost = rows.reduce((s, r) => s + r.debt - r.pay, 0);
    console.log(`${f.split(/[\\/]/).pop()}: строк=${rows.length}, остаток=${Math.round(ost)}, даты ${dates[0]}…${dates[dates.length-1]}`);
    perFile.push(rows);
  }
  // Склейка (как в импорте) и «только 2026-файл» (последний аргумент — текущий год)
  const concat = perFile.flat();
  const last = perFile[perFile.length - 1] || [];
  const sumBy = (rows) => { const m = {}; for (const r of rows) m[r.name] = (m[r.name] || 0) + r.debt - r.pay; return m; };
  const concatBy = sumBy(concat), lastBy = sumBy(last);

  // ПРАВИЛЬНО (без задвоения): старый файл только ДО начала нового + весь новый файл.
  const bStart = last.map((r) => r.date).sort()[0]; // мин. дата 2026-файла
  const older = (perFile.slice(0, -1).flat()).filter((r) => r.date < bStart);
  const correct = [...older, ...last];
  const correctBy = sumBy(correct);
  const correctTotal = Object.values(correctBy).reduce((s, v) => s + v, 0);
  const overlapAmt = Object.values(concatBy).reduce((s, v) => s + v, 0) - correctTotal;
  console.log(`\n>>> Стык нового файла (bStart) = ${bStart}`);
  console.log(`>>> ПРАВИЛЬНЫЙ остаток (без задвоения) = ${Math.round(correctTotal)}`);
  console.log(`>>> Величина задвоения (лишнее в базе) = ${Math.round(overlapAmt)}`);

  // База
  const dbRows = await sql`SELECT c.name, COALESCE(SUM(d.debt_amount),0)-COALESCE(SUM(d.payment_amount),0) AS ost, COUNT(*)::int n
    FROM debts d JOIN clients c ON c.id=d.client_id GROUP BY c.name`;
  const dbBy = {}; for (const r of dbRows) dbBy[r.name] = num(r.ost);
  const dbTotal = Object.values(dbBy).reduce((s, v) => s + v, 0);
  const concatTotal = Object.values(concatBy).reduce((s, v) => s + v, 0);
  const lastTotal = Object.values(lastBy).reduce((s, v) => s + v, 0);
  console.log(`\n=== ИТОГО остаток долгов ===`);
  console.log(`  склейка обоих файлов (как в импорте): ${Math.round(concatTotal)}`);
  console.log(`  только последний файл (2026):          ${Math.round(lastTotal)}`);
  console.log(`  в базе megabazar:                      ${Math.round(dbTotal)}`);

  // Сколько клиентов у кого база == склейка vs база == только2026
  const names = new Set([...Object.keys(dbBy), ...Object.keys(concatBy), ...Object.keys(lastBy)]);
  let eqConcat = 0, eqLast = 0, diff = 0;
  const samples = [];
  for (const nm of names) {
    const db = Math.round(dbBy[nm] ?? 0), cc = Math.round(concatBy[nm] ?? 0), lt = Math.round(lastBy[nm] ?? 0);
    if (db === cc) eqConcat++;
    if (db === lt) eqLast++;
    if (db !== cc && db !== lt) { diff++; if (samples.length < 15) samples.push(`  «${nm}»: база=${db} склейка=${cc} 2026=${lt}`); }
  }
  console.log(`\nКлиентов: база==склейка ${eqConcat}, база==только2026 ${eqLast}, не совпало ни с чем ${diff}`);
  if (samples.length) { console.log("Примеры расхождений:"); samples.forEach((s) => console.log(s)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
