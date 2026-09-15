// Полная помесячная сверка кассы: файлы .xlsx (дневной лист «Касса») vs база megabazar.
// Поля: Клауд общ, ОБЩ РЕАЛ, Наличные, Кас, Хал, Расход.
// Запуск: DATABASE_URL="...megabazar..." node scripts/recon-cash.mjs f2025.xlsx f2026.xlsx
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

const EXPECTED_DB = "megabazar";
const files = process.argv.slice(2);
const sql = neon(process.env.DATABASE_URL);
const ed = (n) => (typeof n === "number" && n > 40000 && n < 60000 ? new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const MANUAL = { "Клауд общ": "klaud", "ОБЩ РЕАЛ": "obshch", "НАЛИЧНЫЕ": "nal", "КАС": "kas", "ХАЛ": "hal" };

// ВАЖНО: оба файла содержат перекрывающуюся историю (2024/2025). Как и импорт,
// дедуплицируем по (дата,метка) и (дата,категория) через max-модуль ЕДИНОЖДЫ по всем файлам.
const perDate = {}; // date -> {field: value}  (max-модуль по всем файлам)
const expByDateCat = {}; // date -> cat -> value (max-модуль по всем файлам)
for (const f of files) {
  const wb = xlsx.readFile(f, { cellDates: false });
  const ws = wb.Sheets["Касса"];
  if (!ws) continue;
  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  for (const row of aoa) {
    const date = ed((row || [])[0]);
    if (!date) continue;
    const label = typeof row[1] === "string" ? row[1].trim() : null;
    if (label && MANUAL[label]) {
      const k = MANUAL[label], c = num(row[2]);
      perDate[date] = perDate[date] || {};
      if (Math.abs(c) >= Math.abs(perDate[date][k] ?? 0)) perDate[date][k] = c;
    }
    const cat = typeof row[4] === "string" ? row[4].trim() : null;
    const amt = num(row[5]);
    if (cat && amt !== 0) {
      expByDateCat[date] = expByDateCat[date] || {};
      if (Math.abs(amt) >= Math.abs(expByDateCat[date][cat] ?? 0)) expByDateCat[date][cat] = amt;
    }
  }
}
// month -> суммы
const fm = {};
const M = (mo) => (fm[mo] = fm[mo] || { klaud: 0, obshch: 0, nal: 0, kas: 0, hal: 0, rashod: 0 });
for (const [d, fields] of Object.entries(perDate)) {
  const acc = M(d.slice(0, 7));
  for (const k of ["klaud", "obshch", "nal", "kas", "hal"]) acc[k] += fields[k] ?? 0;
}
for (const [d, cats] of Object.entries(expByDateCat)) {
  const acc = M(d.slice(0, 7));
  for (const v of Object.values(cats)) acc.rashod += v;
}

async function main() {
  const dbName = (await sql`SELECT current_database() AS db`)[0].db;
  if (dbName !== EXPECTED_DB) { console.error(`❌ база ${dbName}, ожидалась ${EXPECTED_DB}`); process.exit(1); }

  // db side
  const cd = await sql`SELECT to_char(date,'YYYY-MM') mo,
      COALESCE(SUM(klaud_obshch),0) klaud, COALESCE(SUM(obshch_real),0) obshch,
      COALESCE(SUM(nalichnye),0) nal, COALESCE(SUM(kaspi),0) kas, COALESCE(SUM(halyk),0) hal
    FROM cash_days GROUP BY 1`;
  const ce = await sql`SELECT to_char(date,'YYYY-MM') mo, COALESCE(SUM(amount),0) rashod FROM cash_expenses GROUP BY 1`;
  const db = {};
  for (const r of cd) db[r.mo] = { klaud: num(r.klaud), obshch: num(r.obshch), nal: num(r.nal), kas: num(r.kas), hal: num(r.hal), rashod: 0 };
  for (const r of ce) (db[r.mo] = db[r.mo] || {}).rashod = num(r.rashod);

  const months = [...new Set([...Object.keys(fm), ...Object.keys(db)])].sort();
  const fields = [["klaud", "Клауд"], ["obshch", "ОБЩ РЕАЛ"], ["nal", "Нал"], ["kas", "Кас"], ["hal", "Хал"]];
  let bad = 0;
  console.log("Месяц    Поле       Файл            База            ✓");
  for (const mo of months) {
    const F = fm[mo] || {}, D = db[mo] || {};
    for (const [k, name] of fields) {
      const fv = Math.round((F[k] ?? 0) * 100) / 100, dv = Math.round((D[k] ?? 0) * 100) / 100;
      if (fv !== dv) { bad++; console.log(`${mo}  ${name.padEnd(9)} ${String(fv).padStart(14)} ${String(dv).padStart(14)}  ✗`); }
    }
    const rfv = Math.round((F.rashod ?? 0) * 100) / 100, rdv = Math.round((D.rashod ?? 0) * 100) / 100;
    if (rfv !== rdv) { bad++; console.log(`${mo}  ${"Расход".padEnd(9)} ${String(rfv).padStart(14)} ${String(rdv).padStart(14)}  ✗`); }
  }
  console.log(bad === 0 ? "\n✅ 100% совпадение по всем полям и месяцам" : `\n⚠ расхождений: ${bad}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
