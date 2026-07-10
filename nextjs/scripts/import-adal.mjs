// Импорт данных из import.xlsx («Adal MegaStroy 2026») в Neon.
// Этапы: бэкап → очистка тест-операций → импорт → сверка «файл vs база».
// Запуск: node scripts/import-adal.mjs   (из папки nextjs)
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import xlsx from "xlsx";
import { neon } from "@neondatabase/serverless";

// ── окружение ──
const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
for (const l of readFileSync(envPath, "utf-8").split("\n")) {
  const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const XLSX_PATH = fileURLToPath(new URL("../../import.xlsx", import.meta.url));
const BACKUP_PATH = fileURLToPath(new URL("../../backup-before-import.json", import.meta.url));

// ── утилиты ──
const wb = xlsx.readFile(XLSX_PATH, { cellDates: false });
const aoaOf = (n) => xlsx.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, blankrows: false });
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

// ── ПАРСИНГ ФАЙЛА ──
const MANUAL = {
  "Клауд общ": "klaud_obshch",
  "НАЛИЧНЫЕ": "nalichnye",
  "КАС": "kaspi",
  "ХАЛ": "halyk",
  "инкас наличка": "inkas_nalichka",
  "возврат": "vozvrat",
  "закуп товар": "zakup_tovar",
};
const normCat = (c) => {
  const t = c.trim();
  if (/^аренда$/i.test(t)) return "Аренда";
  return t;
};

function parseKassa() {
  const days = {}; // date -> {man, exp}
  for (const row of aoaOf("Касса")) {
    const date = ed(row[0]);
    if (!date) continue;
    const b = typeof row[1] === "string" ? row[1].trim() : null;
    const c = num(row[2]);
    if (b && MANUAL[b]) {
      days[date] = days[date] || { man: {}, exp: {} };
      const k = MANUAL[b];
      // берём значение с бо́льшим модулем (форма пустая, архив с данными)
      if (Math.abs(c) >= Math.abs(days[date].man[k] || 0)) days[date].man[k] = c;
    }
    const e = typeof row[4] === "string" ? row[4].trim() : null;
    const f = num(row[5]);
    if (e && f !== 0) {
      days[date] = days[date] || { man: {}, exp: {} };
      const cat = normCat(e);
      if (Math.abs(f) >= Math.abs(days[date].exp[cat] || 0)) days[date].exp[cat] = f;
    }
  }
  return days;
}

function parseDebts() {
  const recs = [];
  for (const row of aoaOf("Долг внес")) {
    const date = ed(row[0]);
    const b = typeof row[1] === "string" ? row[1].trim() : null;
    if (date && b && b !== "ФИО" && b !== "ФИО / Наименование") {
      recs.push({
        date,
        name: b,
        debt: num(row[2]),
        pay: num(row[3]),
        comment: str(row[4]),
        ret: ed(row[5]),
      });
    }
  }
  return recs;
}

function parseKons() {
  const recs = [];
  for (const row of aoaOf("КОНС")) {
    const date = ed(row[0]);
    const b = typeof row[1] === "string" ? row[1].trim() : null;
    if (date && b && b !== "ФИО") {
      recs.push({ date, supplier: b, prihod: num(row[2]), rashod: num(row[3]), comment: str(row[4]) });
    }
  }
  return recs;
}

function parseSalary() {
  const recs = [];
  for (const row of aoaOf("ЗАРПЛАТА")) {
    const date = ed(row[0]);
    const b = typeof row[1] === "string" ? row[1].trim() : null;
    if (date && b && b !== "ФИО") {
      recs.push({ date, employee: b, amount: num(row[2]), comment: str(row[3]) });
    }
  }
  return recs;
}

function parseClientBase() {
  const out = new Map(); // name -> phone
  const aoa = aoaOf("База клиент");
  for (let r = 5; r < aoa.length; r++) {
    const b = aoa[r][1];
    if (typeof b === "string" && b.trim() && b.trim() !== "вручную") {
      out.set(b.trim(), str(aoa[r][2]));
    }
  }
  return out;
}

async function main() {
  console.log("▶ Парсинг файла…");
  const kassa = parseKassa();
  const debts = parseDebts();
  const kons = parseKons();
  const salary = parseSalary();
  const clientBase = parseClientBase();

  const kassaDates = Object.keys(kassa).sort();
  const clientNames = new Set([...clientBase.keys(), ...debts.map((d) => d.name)]);
  const employees = [...new Set(salary.map((s) => s.employee))];
  const suppliers = [...new Set(kons.map((k) => k.supplier))];

  // ── ЭТАП 2.1 БЭКАП ──
  console.log("▶ Бэкап базы →", BACKUP_PATH);
  const backup = {};
  const tables = [
    "cash_days","cash_expenses","debts","clients","salary","kons",
    "employees","suppliers","fin_categories","fin_accounts","fin_ops","fin_favs",
    "monthly_costs","app_settings","firms",
  ];
  for (const t of tables) {
    backup[t] = await sql.query(`SELECT * FROM ${t}`);
  }
  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2), "utf-8");
  console.log("  бэкап записан, строк всего:", Object.values(backup).reduce((s, r) => s + r.length, 0));

  // ── ЭТАП 2.2 ОЧИСТКА (только согласованное тестовое) ──
  console.log("▶ Очистка тест-операций…");
  await sql`DELETE FROM cash_expenses`;
  await sql`DELETE FROM cash_days`;
  await sql`DELETE FROM debts`;
  await sql`DELETE FROM salary`;
  await sql`DELETE FROM kons`;
  await sql`DELETE FROM monthly_costs`;
  await sql`DELETE FROM clients`;
  await sql`DELETE FROM employees`;
  await sql`DELETE FROM suppliers`;
  // fin_accounts, fin_categories, app_settings — НЕ трогаем

  // ── ЭТАП 2.3 ИМПОРТ ──
  console.log("▶ Импорт клиентов:", clientNames.size);
  await bulkInsert(
    "clients",
    ["name", "phone"],
    [...clientNames].map((n) => ({ name: n, phone: clientBase.get(n) ?? null }))
  );
  const clientRows = await sql`SELECT id, name FROM clients`;
  const clientId = new Map(clientRows.map((c) => [c.name, c.id]));

  console.log("▶ Импорт справочников: работники", employees.length, "| поставщики", suppliers.length);
  await bulkInsert("employees", ["name"], employees.map((n) => ({ name: n })));
  await bulkInsert("suppliers", ["name"], suppliers.map((n) => ({ name: n })));

  console.log("▶ Импорт кассы:", kassaDates.length, "дней");
  const now = new Date();
  const dayRows = kassaDates.map((d) => {
    const m = kassa[d].man;
    return {
      date: d,
      klaud_obshch: m.klaud_obshch ?? 0,
      nalichnye: m.nalichnye ?? 0,
      kaspi: m.kaspi ?? 0,
      halyk: m.halyk ?? 0,
      inkas_nalichka: m.inkas_nalichka ?? 0,
      vozvrat: m.vozvrat ?? 0,
      zakup_tovar: m.zakup_tovar ?? 0,
      comment: "",
      closed: true,
      closed_at: now,
      closed_by: "import",
    };
  });
  await bulkInsert(
    "cash_days",
    ["date","klaud_obshch","nalichnye","kaspi","halyk","inkas_nalichka","vozvrat","zakup_tovar","comment","closed","closed_at","closed_by"],
    dayRows
  );

  const expRows = [];
  for (const d of kassaDates) {
    for (const [cat, amt] of Object.entries(kassa[d].exp)) {
      expRows.push({ date: d, category: cat, amount: amt, comment: "" });
    }
  }
  console.log("▶ Импорт расходов кассы:", expRows.length);
  await bulkInsert("cash_expenses", ["date", "category", "amount", "comment"], expRows);

  console.log("▶ Импорт долгов:", debts.length);
  const debtRows = debts.map((d) => ({
    date: d.date,
    client_id: clientId.get(d.name) ?? null,
    debt_amount: d.debt,
    payment_amount: d.pay,
    comment: d.comment,
    return_date: d.ret,
  }));
  const missing = debtRows.filter((r) => r.client_id == null).length;
  if (missing) throw new Error(`❌ ${missing} долгов без client_id — прервано`);
  await bulkInsert("debts", ["date","client_id","debt_amount","payment_amount","comment","return_date"], debtRows);

  console.log("▶ Импорт КОНС:", kons.length);
  await bulkInsert(
    "kons",
    ["date", "supplier", "prihod", "rashod", "comment"],
    kons.map((k) => ({ date: k.date, supplier: k.supplier, prihod: k.prihod, rashod: k.rashod, comment: k.comment }))
  );

  console.log("▶ Импорт зарплаты:", salary.length);
  await bulkInsert(
    "salary",
    ["date", "employee", "amount", "comment"],
    salary.map((s) => ({ date: s.date, employee: s.employee, amount: s.amount, comment: s.comment }))
  );

  // ── ЭТАП 2.4 СВЕРКА ──
  console.log("\n═══════════ СВЕРКА «файл vs база» ═══════════");
  // файл
  const fileDebtOstatok = round2(debts.reduce((s, d) => s + d.debt - d.pay, 0));
  const fileKonsOstatok = round2(kons.reduce((s, k) => s + k.prihod - k.rashod, 0));
  const fileSalary = round2(salary.reduce((s, x) => s + x.amount, 0));
  const fileInkas = round2(kassaDates.reduce((s, d) => s + (kassa[d].man.inkas_nalichka ?? 0), 0));
  // база
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
    ["Записей долгов", debts.length, dbDebtCnt],
    ["ОСТАТОК долгов", fileDebtOstatok, Number(dbDebtOst)],
    ["Записей КОНС", kons.length, dbKonsCnt],
    ["ОСТАТОК КОНС", fileKonsOstatok, Number(dbKonsOst)],
    ["Записей зарплаты", salary.length, dbSalCnt],
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

  // 3 клиента по остатку
  console.log("\n--- Выборочно 3 клиента (остаток файл vs база) ---");
  const fileBal = {};
  for (const d of debts) fileBal[d.name] = round2((fileBal[d.name] || 0) + d.debt - d.pay);
  const top3 = Object.entries(fileBal).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [name, fv] of top3) {
    const id = clientId.get(name);
    const dv = (await sql`SELECT COALESCE(SUM(debt_amount),0)-COALESCE(SUM(payment_amount),0) v FROM debts WHERE client_id=${id}`)[0].v;
    const ok = Number(fv) === Number(dv);
    console.log(`  ${name.padEnd(24)} файл=${String(fv).padStart(10)}  база=${String(dv).padStart(10)} ${ok ? "✓" : "✗"}`);
  }

  console.log("\n" + (allOk ? "✅ ВСЁ СОШЛОСЬ 1-в-1" : "❌ ЕСТЬ РАСХОЖДЕНИЯ — СМОТРИ ВЫШЕ"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
