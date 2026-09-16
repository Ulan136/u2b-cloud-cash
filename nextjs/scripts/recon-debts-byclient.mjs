// Поклиентная сверка долгов: файл 2026 (перенос+текущее) vs текущая база megabazar.
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

const file2026 = process.argv[2];
const sql = neon(process.env.DATABASE_URL);
const ed = (n) => (typeof n === "number" && n > 40000 && n < 60000 ? new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0,10) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function fileBy(path) {
  const wb = xlsx.readFile(path, { cellDates: false });
  const aoa = xlsx.utils.sheet_to_json(wb.Sheets["Долг внес"], { header: 1, defval: null, blankrows: true, raw: true });
  const m = {};
  for (const r of aoa) {
    const d = ed((r || [])[0]);
    const b = typeof r[1] === "string" ? r[1].trim() : null;
    if (d && b && b !== "ФИО" && b !== "ФИО / Наименование") m[b] = (m[b] || 0) + num(r[2]) - num(r[3]);
  }
  return m;
}

async function main() {
  const fileM = fileBy(file2026);
  const dbRows = await sql`SELECT c.name, COALESCE(SUM(d.debt_amount),0)-COALESCE(SUM(d.payment_amount),0) AS ost
    FROM debts d JOIN clients c ON c.id=d.client_id GROUP BY c.name`;
  const dbM = {}; for (const r of dbRows) dbM[r.name] = Math.round(num(r.ost));
  const names = new Set([...Object.keys(fileM), ...Object.keys(dbM)]);

  const rows = [...names].map((nm) => ({ nm, file: Math.round(fileM[nm] || 0), db: dbM[nm] || 0 }))
    .map((r) => ({ ...r, diff: r.db - r.file }));

  const fileTotal = rows.reduce((s, r) => s + r.file, 0);
  const dbTotal = rows.reduce((s, r) => s + r.db, 0);
  const mismatch = rows.filter((r) => r.diff !== 0);

  console.log(`ИТОГО: файл2026=${fileTotal}  база=${dbTotal}  разница=${dbTotal - fileTotal}`);
  console.log(`Клиентов всего=${rows.length}, совпало=${rows.length - mismatch.length}, расхождений=${mismatch.length}\n`);
  console.log("ТОП-30 по остатку в базе (файл2026 | база | разница):");
  rows.sort((a, b) => b.db - a.db).slice(0, 30).forEach((r) =>
    console.log(`  ${r.nm.slice(0,26).padEnd(26)} ${String(r.file).padStart(11)} ${String(r.db).padStart(11)} ${r.diff ? String(r.diff).padStart(11)+" ✗" : "        —  ✓"}`)
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
