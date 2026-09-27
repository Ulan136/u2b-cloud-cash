// Приводит остатки 3 поставщиков к таблице «АНАЛИЗ ПО ОСТАТКАМ» листа,
// чтобы Общий остаток КОНС в приложении = 28 632 557 (как «ОБЩ ОСТ» листа).
// Запуск: DATABASE_URL="...megabazar..." node scripts/adjust-kons-megabazar.mjs
import { neon } from "@neondatabase/serverless";
const EXPECTED = "megabazar";
const sql = neon(process.env.DATABASE_URL);

// цель (лист АНАЛИЗ) для этих поставщиков
const TARGET = { "Exprofil": 3591900, "КОРОНА": 475685, "САПА САНТЕХНИКА": 1082489 };
const DATE = "2026-09-18";
const COMMENT = "корректировка по листу (АНАЛИЗ)";

async function main() {
  const db = (await sql`SELECT current_database() AS db`)[0].db;
  if (db !== EXPECTED) { console.error(`❌ ожидалась ${EXPECTED}, а это ${db} — отмена`); process.exit(1); }

  for (const [supplier, target] of Object.entries(TARGET)) {
    // убираем прежнюю корректировку (если запускали) — считаем от чистых строк
    await sql`DELETE FROM kons WHERE supplier=${supplier} AND comment=${COMMENT}`;
    const cur = Number((await sql`SELECT COALESCE(SUM(prihod),0)-COALESCE(SUM(rashod),0) v FROM kons WHERE supplier=${supplier}`)[0].v);
    const delta = Math.round((cur - target) * 100) / 100; // на сколько остаток выше цели
    if (Math.abs(delta) < 0.5) { console.log(`• ${supplier}: уже ${Math.round(cur)} — ок`); continue; }
    // delta>0 → нужно уменьшить остаток → добавляем оплату; delta<0 → приход
    if (delta > 0) await sql`INSERT INTO kons (date,supplier,prihod,rashod,comment) VALUES (${DATE},${supplier},'0',${String(delta)},${COMMENT})`;
    else await sql`INSERT INTO kons (date,supplier,prihod,rashod,comment) VALUES (${DATE},${supplier},${String(-delta)},'0',${COMMENT})`;
    console.log(`• ${supplier}: ${Math.round(cur)} → ${target} (${delta > 0 ? "оплата" : "приход"} ${Math.abs(delta)})`);
  }

  const t = (await sql`SELECT COALESCE(SUM(prihod),0)-COALESCE(SUM(rashod),0) v, COUNT(*)::int n FROM kons`)[0];
  console.log(`\n=== ИТОГ === строк=${t.n}  общий остаток=${Math.round(Number(t.v) * 10) / 10}  [цель 28632557,1]`);
}
main().catch((e) => { console.error(e); process.exit(1); });
