// Импорт данных MegaStroybazar (несколько .xlsx: 2025 + 2026) в базу `megabazar`.
// Этапы: проверка БД → бэкап → очистка → импорт (слияние файлов) → сверка + отчёт по подозрительным ячейкам.
//
// Запуск (из папки nextjs), DATABASE_URL ДОЛЖЕН указывать на megabazar:
//   DATABASE_URL="postgres://.../megabazar?sslmode=require" \
//   node scripts/import-megabazar.mjs "путь/2025.xlsx" "путь/2026.xlsx"
//
// Предохранитель: если подключённая база НЕ `megabazar` — скрипт прерывается,
// чтобы случайно не задеть боевую `neondb` (магазин Adal).

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

const EXPECTED_DB = "megabazar";
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Укажите пути к .xlsx файлам аргументами.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан в окружении.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const BACKUP_PATH = fileURLToPath(new URL("../../backup-before-import-megabazar.json", import.meta.url));

// ── утилиты ──
const ed = (n) =>
  typeof n === "number" && n > 40000 && n < 60000
    ? new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
    : null;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const round2 = (x) => Math.round(x * 100) / 100;

const suspicious = []; // {file, sheet, row, col, name, value, asDate}
const DATE_W_RE = /(\d{1,4}[.\/-]\d{1,2}[.\/-]\d{1,4})|[A-Za-zА-Яа-я]{3}/; // формат ячейки похож на дату

async function bulkInsert(table, cols, rows, chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const ph = part
      .map((_, ri) => `(${cols.map((__, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`)
      .join(",");
    const params = part.flatMap((r) => cols.map((c) => r[c]));
    await sql.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${ph}`, params);
  }
}

const MANUAL = {
  "Клауд общ": "klaud_obshch",
  "НАЛИЧНЫЕ": "nalichnye",
  "КАС": "kaspi",
  "ХАЛ": "halyk",
  "инкас наличка": "inkas_nalichka",
  "возврат": "vozvrat",
  "закуп товар": "zakup_tovar",
};
const normCat = (c) => (/^аренда$/i.test(c.trim()) ? "Аренда" : c.trim());

// Читает лист как массив-строк с выравниванием по строкам листа (blankrows:true),
// плюс возвращает функцию доступа к «сырой» ячейке (для проверки формата-даты).
function readSheet(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true, raw: true });
  const range = xlsx.utils.decode_range(ws["!ref"]);
  const r0 = range.s.r, c0 = range.s.c;
  const cellAt = (i, j) => ws[xlsx.utils.encode_cell({ r: r0 + i, c: c0 + j })];
  return { aoa, cellAt };
}

// Значение суммы + фиксация подозрительной ячейки-даты (импортируем как есть, но помечаем).
function amount(sheet, cellAt, i, j, fileTag, nameForLog) {
  const cell = cellAt(i, j);
  const v = cell ? cell.v : null;
  const n = num(v);
  if (cell && cell.t === "n" && typeof cell.v === "number" && cell.v > 40000 && cell.v < 60000) {
    const w = cell.w != null ? String(cell.w) : "";
    if (DATE_W_RE.test(w)) {
      suspicious.push({
        file: fileTag, sheet, row: i + 1, col: xlsx.utils.encode_col(j),
        name: nameForLog || "", value: n, asDate: ed(cell.v),
      });
    }
  }
  return n;
}

function parseWorkbook(path, fileTag, acc) {
  const wb = xlsx.readFile(path, { cellDates: false });

  // ── Касса ──
  const S = readSheet(wb, "Касса");
  if (S) {
    for (let i = 0; i < S.aoa.length; i++) {
      const row = S.aoa[i] || [];
      const date = ed(row[0]);
      if (!date) continue;
      const label = typeof row[1] === "string" ? row[1].trim() : null;
      if (label && MANUAL[label]) {
        const c = amount("Касса", S.cellAt, i, 2, fileTag, label);
        acc.kassa[date] = acc.kassa[date] || { man: {}, exp: {} };
        const k = MANUAL[label];
        if (Math.abs(c) >= Math.abs(acc.kassa[date].man[k] || 0)) acc.kassa[date].man[k] = c;
      }
      if (label === "ОБЩ РЕАЛ") {
        const c = amount("Касса", S.cellAt, i, 2, fileTag, label);
        acc.kassa[date] = acc.kassa[date] || { man: {}, exp: {} };
        if (Math.abs(c) >= Math.abs(acc.kassa[date].obshchReal ?? 0)) acc.kassa[date].obshchReal = c;
      }
      const cat = typeof row[4] === "string" ? row[4].trim() : null;
      if (cat) {
        const f = amount("Касса", S.cellAt, i, 5, fileTag, cat);
        if (f !== 0) {
          acc.kassa[date] = acc.kassa[date] || { man: {}, exp: {} };
          const c2 = normCat(cat);
          if (Math.abs(f) >= Math.abs(acc.kassa[date].exp[c2] || 0)) acc.kassa[date].exp[c2] = f;
        }
      }
    }
  }

  // ── Долг внес ──
  const D = readSheet(wb, "Долг внес");
  if (D) {
    for (let i = 0; i < D.aoa.length; i++) {
      const row = D.aoa[i] || [];
      const date = ed(row[0]);
      const b = typeof row[1] === "string" ? row[1].trim() : null;
      if (date && b && b !== "ФИО" && b !== "ФИО / Наименование") {
        acc.debts.push({
          date, name: b,
          debt: amount("Долг внес", D.cellAt, i, 2, fileTag, b),
          pay: amount("Долг внес", D.cellAt, i, 3, fileTag, b),
          comment: str(row[4]),
          ret: ed(row[5]),
        });
      }
    }
  }

  // ── КОНС ──
  const K = readSheet(wb, "КОНС");
  if (K) {
    for (let i = 0; i < K.aoa.length; i++) {
      const row = K.aoa[i] || [];
      const date = ed(row[0]);
      const b = typeof row[1] === "string" ? row[1].trim() : null;
      if (date && b && b !== "ФИО") {
        acc.kons.push({
          date, supplier: b,
          prihod: amount("КОНС", K.cellAt, i, 2, fileTag, b),
          rashod: amount("КОНС", K.cellAt, i, 3, fileTag, b),
          comment: str(row[4]),
        });
      }
    }
  }

  // ── ЗАРПЛАТА ──
  const Z = readSheet(wb, "ЗАРПЛАТА");
  if (Z) {
    for (let i = 0; i < Z.aoa.length; i++) {
      const row = Z.aoa[i] || [];
      const date = ed(row[0]);
      const b = typeof row[1] === "string" ? row[1].trim() : null;
      if (date && b && b !== "ФИО") {
        acc.salary.push({
          date, employee: b,
          amount: amount("ЗАРПЛАТА", Z.cellAt, i, 2, fileTag, b),
          comment: str(row[3]),
        });
      }
    }
  }

  // ── База клиент ──
  const B = readSheet(wb, "База клиент");
  if (B) {
    for (let i = 2; i < B.aoa.length; i++) {
      const b = B.aoa[i][1];
      if (typeof b === "string" && b.trim() && b.trim() !== "вручную") {
        acc.clientBase.set(b.trim(), str(B.aoa[i][2]));
      }
    }
  }
}

async function main() {
  // ── ПРЕДОХРАНИТЕЛЬ: убеждаемся, что это megabazar ──
  const dbName = (await sql`SELECT current_database() AS db`)[0].db;
  console.log("▶ Подключено к базе:", dbName);
  if (dbName !== EXPECTED_DB) {
    console.error(`❌ Ожидалась база «${EXPECTED_DB}», а подключено к «${dbName}». Прервано.`);
    process.exit(1);
  }

  // ── Парсинг всех файлов ──
  const acc = { kassa: {}, debts: [], kons: [], salary: [], clientBase: new Map() };
  for (const f of files) {
    console.log("▶ Парсинг:", f);
    parseWorkbook(f, f.split(/[\\/]/).pop(), acc);
  }

  // отбрасываем полностью пустые дни кассы (форма без данных)
  const kassaDates = Object.keys(acc.kassa)
    .filter((d) => {
      const man = acc.kassa[d].man, exp = acc.kassa[d].exp;
      const anyMan = Object.values(man).some((v) => Number(v) !== 0);
      const anyExp = Object.keys(exp).length > 0;
      return anyMan || anyExp;
    })
    .sort();

  const clientNames = new Set([...acc.clientBase.keys(), ...acc.debts.map((d) => d.name)]);
  const employees = [...new Set(acc.salary.map((s) => s.employee))];
  const suppliers = [...new Set(acc.kons.map((k) => k.supplier))];

  console.log(
    `▶ Итоги парсинга: дней=${kassaDates.length}, долгов=${acc.debts.length}, ` +
    `КОНС=${acc.kons.length}, зарплат=${acc.salary.length}, клиентов=${clientNames.size}, ` +
    `работников=${employees.length}, поставщиков=${suppliers.length}`
  );

  if (process.env.DRY_RUN) {
    console.log(`\n═══ [DRY RUN] Подозрительные ячейки (дата в столбце суммы): ${suspicious.length} ═══`);
    for (const s of suspicious.slice(0, 60))
      console.log(`  [${s.file}] ${s.sheet} стр.${s.row} ${s.col}  «${s.name}»  значение=${s.value}  (как дата: ${s.asDate})`);
    if (suspicious.length > 60) console.log(`  … и ещё ${suspicious.length - 60}`);
    console.log("\n[DRY RUN] База НЕ изменялась.");
    return;
  }

  // ── БЭКАП (на случай, если база уже не пустая) ──
  const tables = [
    "cash_days","cash_expenses","debts","clients","salary","kons",
    "employees","suppliers","fin_categories","fin_accounts","fin_ops","fin_favs",
    "monthly_costs","app_settings","firms",
  ];
  const backup = {};
  for (const t of tables) backup[t] = await sql.query(`SELECT * FROM ${t}`);
  const backupCount = Object.values(backup).reduce((s, r) => s + r.length, 0);
  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2), "utf-8");
  console.log("▶ Бэкап →", BACKUP_PATH, "| строк было:", backupCount);

  // ── ОЧИСТКА ──
  console.log("▶ Очистка таблиц…");
  await sql`DELETE FROM cash_expenses`;
  await sql`DELETE FROM cash_days`;
  await sql`DELETE FROM debts`;
  await sql`DELETE FROM salary`;
  await sql`DELETE FROM kons`;
  await sql`DELETE FROM monthly_costs`;
  await sql`DELETE FROM clients`;
  await sql`DELETE FROM employees`;
  await sql`DELETE FROM suppliers`;

  // ── ИМПОРТ ──
  console.log("▶ Импорт клиентов:", clientNames.size);
  await bulkInsert("clients", ["name", "phone"],
    [...clientNames].map((n) => ({ name: n, phone: acc.clientBase.get(n) ?? null })));
  const clientRows = await sql`SELECT id, name FROM clients`;
  const clientId = new Map(clientRows.map((c) => [c.name, c.id]));

  await bulkInsert("employees", ["name"], employees.map((n) => ({ name: n })));
  await bulkInsert("suppliers", ["name"], suppliers.map((n) => ({ name: n })));

  const now = new Date();
  const dayRows = kassaDates.map((d) => {
    const m = acc.kassa[d].man;
    return {
      date: d,
      klaud_obshch: m.klaud_obshch ?? 0, obshch_real: acc.kassa[d].obshchReal ?? null,
      nalichnye: m.nalichnye ?? 0, kaspi: m.kaspi ?? 0,
      halyk: m.halyk ?? 0, inkas_nalichka: m.inkas_nalichka ?? 0, vozvrat: m.vozvrat ?? 0,
      zakup_tovar: m.zakup_tovar ?? 0, comment: "", closed: true, closed_at: now, closed_by: "import",
    };
  });
  console.log("▶ Импорт кассы:", dayRows.length, "дней");
  await bulkInsert("cash_days",
    ["date","klaud_obshch","obshch_real","nalichnye","kaspi","halyk","inkas_nalichka","vozvrat","zakup_tovar","comment","closed","closed_at","closed_by"],
    dayRows);

  const expRows = [];
  for (const d of kassaDates)
    for (const [cat, amt] of Object.entries(acc.kassa[d].exp))
      expRows.push({ date: d, category: cat, amount: amt, comment: "" });
  console.log("▶ Импорт расходов кассы:", expRows.length);
  await bulkInsert("cash_expenses", ["date", "category", "amount", "comment"], expRows);

  const debtRows = acc.debts.map((d) => ({
    date: d.date, client_id: clientId.get(d.name) ?? null,
    debt_amount: d.debt, payment_amount: d.pay, comment: d.comment, return_date: d.ret,
  }));
  const missing = debtRows.filter((r) => r.client_id == null).length;
  if (missing) throw new Error(`❌ ${missing} долгов без client_id — прервано`);
  console.log("▶ Импорт долгов:", debtRows.length);
  await bulkInsert("debts", ["date","client_id","debt_amount","payment_amount","comment","return_date"], debtRows);

  console.log("▶ Импорт КОНС:", acc.kons.length);
  await bulkInsert("kons", ["date","supplier","prihod","rashod","comment"], acc.kons);

  console.log("▶ Импорт зарплаты:", acc.salary.length);
  await bulkInsert("salary", ["date","employee","amount","comment"], acc.salary);

  // ── СВЕРКА «файл vs база» ──
  console.log("\n═══════════ СВЕРКА «файл vs база» ═══════════");
  const fileDebtOst = round2(acc.debts.reduce((s, d) => s + d.debt - d.pay, 0));
  const fileKonsOst = round2(acc.kons.reduce((s, k) => s + k.prihod - k.rashod, 0));
  const fileSalary = round2(acc.salary.reduce((s, x) => s + x.amount, 0));
  const fileInkas = round2(kassaDates.reduce((s, d) => s + (acc.kassa[d].man.inkas_nalichka ?? 0), 0));

  const dbDays = (await sql`SELECT count(*)::int n FROM cash_days`)[0].n;
  const dbDebtCnt = (await sql`SELECT count(*)::int n FROM debts`)[0].n;
  const dbDebtOst = (await sql`SELECT COALESCE(SUM(debt_amount),0)-COALESCE(SUM(payment_amount),0) v FROM debts`)[0].v;
  const dbKonsCnt = (await sql`SELECT count(*)::int n FROM kons`)[0].n;
  const dbKonsOst = (await sql`SELECT COALESCE(SUM(prihod),0)-COALESCE(SUM(rashod),0) v FROM kons`)[0].v;
  const dbSalCnt = (await sql`SELECT count(*)::int n FROM salary`)[0].n;
  const dbSal = (await sql`SELECT COALESCE(SUM(amount),0) v FROM salary`)[0].v;
  const dbInkas = (await sql`SELECT COALESCE(SUM(inkas_nalichka),0) v FROM cash_days`)[0].v;
  const dbClients = (await sql`SELECT count(*)::int n FROM clients`)[0].n;

  const rows = [
    ["Дней кассы", kassaDates.length, dbDays],
    ["Записей долгов", acc.debts.length, dbDebtCnt],
    ["ОСТАТОК долгов", fileDebtOst, Number(dbDebtOst)],
    ["Записей КОНС", acc.kons.length, dbKonsCnt],
    ["ОСТАТОК КОНС", fileKonsOst, Number(dbKonsOst)],
    ["Записей зарплаты", acc.salary.length, dbSalCnt],
    ["Сумма зарплаты", fileSalary, Number(dbSal)],
    ["Σ инкас наличка", fileInkas, Number(dbInkas)],
    ["Клиентов", clientNames.size, dbClients],
  ];
  console.log("Показатель".padEnd(22), "Файл".padStart(16), "База".padStart(16), " ✓?");
  let allOk = true;
  for (const [label, f, d] of rows) {
    const ok = Number(f) === Number(d);
    if (!ok) allOk = false;
    console.log(label.padEnd(22), String(f).padStart(16), String(d).padStart(16), ok ? " ✓" : " ✗РАСХОЖДЕНИЕ");
  }
  console.log("\n" + (allOk ? "✅ ВСЁ СОШЛОСЬ 1-в-1" : "❌ ЕСТЬ РАСХОЖДЕНИЯ"));

  // ── ОТЧЁТ по подозрительным ячейкам (дата в столбце суммы) ──
  console.log(`\n═══ Подозрительные ячейки (похоже, дата в столбце суммы): ${suspicious.length} ═══`);
  for (const s of suspicious.slice(0, 60)) {
    console.log(`  [${s.file}] ${s.sheet} стр.${s.row} ${s.col}  «${s.name}»  значение=${s.value}  (как дата: ${s.asDate})`);
  }
  if (suspicious.length > 60) console.log(`  … и ещё ${suspicious.length - 60}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
