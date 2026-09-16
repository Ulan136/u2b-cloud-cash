"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { notifyLive } from "@/lib/live/transport";
import { LiveIndicator } from "@/components/LiveIndicator";

const DAY_KEYS = [
  "klaudObshch",
  "nalichnye",
  "kaspi",
  "halyk",
  "inkasNalichka",
  "vozvrat",
  "zakupTovar",
] as const;
type DayKey = (typeof DAY_KEYS)[number];

// Фиксированный список категорий (как строки в листе), без селектов.
// «ЗАРПЛАТА» здесь НЕТ — она авто из журнала Зарплаты за день (см. salaryDayTotal).
const CATEGORIES = [
  "расход БРАК",
  "Логистика",
  "Расходы разн",
  "Налог",
  "Интернет",
  "су/жылу",
  "Мусор",
  "Свет",
  "Мега кошелек",
  "Кимбай",
  "резерв2",
  "резерв3",
];

type Day = Record<DayKey, string> & { comment: string };
type Exp = Record<string, { amount: string; comment: string }>;
type ArchiveDay = { date: string; klaud: number; minPlus: number };

const emptyDay = (): Day => ({
  klaudObshch: "",
  nalichnye: "",
  kaspi: "",
  halyk: "",
  inkasNalichka: "",
  vozvrat: "",
  zakupTovar: "",
  comment: "",
});

function fmtLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const todayStr = () => fmtLocal(new Date());

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

// Калькулятор: значение ячейки может быть выражением «42000+20000» → 62000.
// Безопасный разбор (+ − * / и скобки), без eval.
function evalExpr(input: string): number {
  const s = String(input ?? "").replace(/\s/g, "").replace(/,/g, ".");
  if (!s) return 0;
  if (!/^[0-9.+\-*/()]+$/.test(s)) return num(s);
  let i = 0;
  const peek = () => s[i];
  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const t = parseTerm();
      v = op === "+" ? v + t : v - t;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const f = parseFactor();
      v = op === "*" ? v * f : f === 0 ? 0 : v / f;
    }
    return v;
  };
  const parseFactor = (): number => {
    if (peek() === "+") { i++; return parseFactor(); }
    if (peek() === "-") { i++; return -parseFactor(); }
    if (peek() === "(") { i++; const v = parseExpr(); if (peek() === ")") i++; return v; }
    let n = "";
    while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
    if (n === "") { i++; return 0; }
    const val = Number(n);
    return Number.isFinite(val) ? val : 0;
  };
  const r = parseExpr();
  return Number.isFinite(r) ? Math.round(r * 100) / 100 : 0;
}
// Есть ли в строке арифметика (чтобы показать «= сумму» и карандаш).
const hasExpr = (v: string) => /[+\-*/]/.test(String(v ?? "").replace(/^\s*-/, ""));

const STRIPE: Partial<Record<DayKey, string>> = {
  nalichnye: "#3b6ea5",
  kaspi: "#a55b5b",
  halyk: "#4e8a5f",
};

export default function KassaPage() {
  const [date, setDate] = useState(todayStr());
  const [day, setDay] = useState<Day>(emptyDay());
  const [exp, setExp] = useState<Exp>(() => {
    const m: Exp = {};
    for (const c of CATEGORIES) m[c] = { amount: "", comment: "" };
    return m;
  });
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  // Комментарии к полям кассы (Наличные/КАС/ХАЛ и т.д.) + какие раскрыты
  const [dayComments, setDayComments] = useState<Record<string, string>>({});
  const [openDayComments, setOpenDayComments] = useState<Record<string, boolean>>({});
  const [totals, setTotals] = useState({ debt: "0", payment: "0" });
  const [archive, setArchive] = useState<ArchiveDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [closed, setClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [closedBy, setClosedBy] = useState<string | null>(null);
  // Авто-расход «ЗАРПЛАТА» = сумма выплат из журнала Зарплаты за выбранный день.
  const [salaryDayTotal, setSalaryDayTotal] = useState(0);
  // ОБЩ РЕАЛ, зафиксированный в БД для загруженного дня (импорт/прошлое закрытие).
  // Пока день не редактируют — показываем его; при правках считаем формулой вживую.
  const [storedObshchReal, setStoredObshchReal] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  // Автосохранение: флажок «идёт», чтобы не запускать два сохранения сразу,
  // и таймер debounce (сохраняем через паузу после последнего ввода).
  const savingRef = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const archRange = useMemo(() => {
    const t = new Date();
    const f = new Date();
    f.setDate(t.getDate() - 60);
    return { from: fmtLocal(f), to: fmtLocal(t) };
  }, []);

  const displayCats = useMemo(() => [...CATEGORIES, ...extraCats], [extraCats]);

  // Фон (polling/focus) обновляет только просмотр: totals (ДОЛГ/Возврат долг → авто-МИН/ПЛЮС)
  // и архив дней. day и exp — форма пользователя, при фоне не перезаписываем.
  const load = useCallback(
    async ({ background }: { background: boolean }) => {
      if (!background) {
        setLoading(true);
        setStatus("");
      }
      try {
        const [dayRes, archRes] = await Promise.all([
          fetch(`/api/kassa?date=${date}`),
          fetch(`/api/kassa?from=${archRange.from}&to=${archRange.to}`),
        ]);
        const data = await dayRes.json();
        const arch = await archRes.json();
        const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

        setTotals(data.totals ?? { debt: "0", payment: "0" });
        setSalaryDayTotal(Number(data.salaryDayTotal ?? 0));
        setArchive(arch.days ?? []);
        // статус смены обновляем всегда (в т.ч. если авто-закрытие произошло в фоне)
        setClosed(Boolean(data.day?.closed));
        setClosedAt(data.day?.closedAt ?? null);
        setClosedBy(data.day?.closedBy ?? null);

        if (!background) {
          setStoredObshchReal(
            data.day?.obshchReal != null ? Number(data.day.obshchReal) : null
          );
          setDirty(false);
          // Заметки по полям: expr (для показа «из чего сумма») + комментарий.
          let notes: Record<string, { expr?: string; comment?: string }> = {};
          try {
            notes = data.day?.fieldNotes ? JSON.parse(data.day.fieldNotes) : {};
          } catch {
            notes = {};
          }
          const val = (key: DayKey, raw: unknown) => notes[key]?.expr ?? s(raw);
          setDay(
            data.day
              ? {
                  klaudObshch: val("klaudObshch", data.day.klaudObshch),
                  nalichnye: val("nalichnye", data.day.nalichnye),
                  kaspi: val("kaspi", data.day.kaspi),
                  halyk: val("halyk", data.day.halyk),
                  inkasNalichka: val("inkasNalichka", data.day.inkasNalichka),
                  vozvrat: val("vozvrat", data.day.vozvrat),
                  zakupTovar: val("zakupTovar", data.day.zakupTovar),
                  comment: s(data.day.comment),
                }
              : emptyDay()
          );
          const dc: Record<string, string> = {};
          for (const k of DAY_KEYS) if (notes[k]?.comment) dc[k] = String(notes[k]!.comment);
          setDayComments(dc);
          setOpenDayComments({});
          const map: Exp = {};
          for (const c of CATEGORIES) map[c] = { amount: "", comment: "" };
          const extras: string[] = [];
          for (const e of data.expenses ?? []) {
            const cat = String(e.category ?? "");
            if (cat === "ЗАРПЛАТА") continue; // авто из журнала Зарплаты
            map[cat] = { amount: s(e.amount), comment: s(e.comment) };
            if (!CATEGORIES.includes(cat)) extras.push(cat);
          }
          setExp(map);
          setExtraCats(extras);
        }
      } finally {
        if (!background) setLoading(false);
      }
    },
    [date, archRange]
  );

  const { refreshing, lastUpdated } = useLiveData("kassa", load, [date]);

  const setField = (key: DayKey | "comment", value: string) => {
    setDirty(true);
    setDay((d) => ({ ...d, [key]: value }));
  };
  const updateExp = (cat: string, patch: Partial<{ amount: string; comment: string }>) => {
    setDirty(true);
    setExp((m) => ({ ...m, [cat]: { ...(m[cat] ?? { amount: "", comment: "" }), ...patch } }));
  };

  const expensesTotal = useMemo(
    () => salaryDayTotal + displayCats.reduce((s, c) => s + evalExpr(exp[c]?.amount ?? ""), 0),
    [displayCats, exp, salaryDayTotal]
  );

  const calc = useMemo(() => {
    const nal = evalExpr(day.nalichnye);
    const kas = evalExpr(day.kaspi);
    const hal = evalExpr(day.halyk);
    const inkas = evalExpr(day.inkasNalichka);
    const vozvrat = evalExpr(day.vozvrat);
    const zakup = evalExpr(day.zakupTovar);
    const klaud = evalExpr(day.klaudObshch);
    const debt = num(totals.debt);
    const vozvratDolg = num(totals.payment);
    const rashod = expensesTotal;
    const computed =
      nal + kas + hal + (rashod + zakup + inkas + debt + vozvrat) - vozvratDolg;
    // Замороженное значение используем ТОЛЬКО для закрытого дня (импорт/прошлое —
    // там пересчёт по таблице долгов не совпал бы). Открытый (текущий) день всегда
    // считаем вживую по формуле — как в Google-таблице, автоматом в течение дня.
    const obshchReal =
      closed && storedObshchReal != null ? storedObshchReal : Math.round(computed * 100) / 100;
    const minPlus = Math.round((obshchReal - klaud) * 100) / 100;
    return { debt, vozvratDolg, rashod, obshchReal, minPlus };
  }, [day, totals, expensesTotal, closed, storedObshchReal]);

  // Сформировать тело запроса из текущей формы (выражения → числа).
  const buildBody = useCallback(
    (action: "save" | "close" | "reopen") => {
      const dayEval = {
        klaudObshch: String(evalExpr(day.klaudObshch)),
        obshchReal: String(calc.obshchReal),
        nalichnye: String(evalExpr(day.nalichnye)),
        kaspi: String(evalExpr(day.kaspi)),
        halyk: String(evalExpr(day.halyk)),
        inkasNalichka: String(evalExpr(day.inkasNalichka)),
        vozvrat: String(evalExpr(day.vozvrat)),
        zakupTovar: String(evalExpr(day.zakupTovar)),
        comment: day.comment,
      };
      const expenses = displayCats
        .map((c) => ({
          category: c,
          amount: String(evalExpr(exp[c]?.amount ?? "")),
          comment: exp[c]?.comment ?? "",
        }))
        .filter((e) => Number(e.amount) !== 0);
      // ЗАРПЛАТА — авто из журнала Зарплаты за день (сохраняем как расход дня).
      if (salaryDayTotal !== 0) {
        expenses.push({ category: "ЗАРПЛАТА", amount: String(salaryDayTotal), comment: "" });
      }
      // Заметки по полям: выражение ввода (для «из чего сумма») + комментарий.
      const notes: Record<string, { expr?: string; comment?: string }> = {};
      for (const k of DAY_KEYS) {
        const expr = hasExpr(day[k]) ? day[k] : undefined;
        const cm = dayComments[k]?.trim() || undefined;
        if (expr || cm) notes[k] = { ...(expr ? { expr } : {}), ...(cm ? { comment: cm } : {}) };
      }
      const fieldNotes = Object.keys(notes).length ? JSON.stringify(notes) : "";
      return { date, day: dayEval, expenses, fieldNotes, action };
    },
    [date, day, exp, displayCats, dayComments, salaryDayTotal, calc.obshchReal]
  );

  // Единая запись в БД. silent=true — тихое автосохранение (без перезагрузки формы,
  // чтобы не сбить набор текста); иначе — ручное сохранение/закрытие с перезагрузкой.
  const persist = useCallback(
    async (action: "save" | "close" | "reopen", opts: { silent: boolean }) => {
      if (savingRef.current) return;
      savingRef.current = true;
      if (!opts.silent) setSaving(true);
      setStatus(opts.silent ? "сохранение…" : "");
      try {
        const res = await fetch("/api/kassa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody(action)),
        });
        if (!res.ok) throw new Error();
        setDirty(false);
        // Фиксируем показанное ОБЩ РЕАЛ, чтобы после автосейва оно не «прыгало».
        setStoredObshchReal(calc.obshchReal);
        notifyLive(); // отчёты/другие вкладки сразу подхватят изменения кассы
        setStatus(
          action === "close"
            ? "Смена закрыта ✓"
            : action === "reopen"
              ? "Смена переоткрыта"
              : "Сохранено ✓"
        );
        // Ручные действия перезагружают день; автосохранение — нет.
        if (!opts.silent) await load({ background: false });
      } catch {
        setStatus("Ошибка сохранения — проверьте связь");
      } finally {
        savingRef.current = false;
        if (!opts.silent) setSaving(false);
      }
    },
    [buildBody, load, calc.obshchReal]
  );

  async function submit(action: "save" | "close" | "reopen") {
    if (action === "close" && !window.confirm("Закрыть смену? День станет доступен только для просмотра."))
      return;
    if (action === "reopen" && !window.confirm("Переоткрыть смену для исправлений?")) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    await persist(action, { silent: false });
  }

  // Автосохранение: через 1.5 с после последнего изменения тихо пишем день в БД,
  // чтобы введённые данные не терялись, даже если не нажать «Сохранить».
  useEffect(() => {
    if (!dirty || closed || loading) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      persist("save", { silent: true });
    }, 1500);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [dirty, day, exp, dayComments, closed, loading, persist]);

  const setDayComment = (key: DayKey, v: string) => {
    setDirty(true);
    setDayComments((m) => ({ ...m, [key]: v }));
  };

  const inputRow = (key: DayKey, label: string) => {
    const expr = hasExpr(day[key]);
    const hasComment = !!dayComments[key];
    return (
      <div>
        <div
          className="flex h-12 items-center border-l-4"
          style={{ borderLeftColor: STRIPE[key] ?? "transparent", background: "#f2f7ff" }}
        >
          <span className="flex-1 truncate pl-4 pr-2 text-[15px] text-[#374151]">{label}</span>
          {expr && (
            <span
              title="Сумма выражения (разбивка сохраняется)"
              className="mr-1 shrink-0 whitespace-nowrap text-xs font-semibold text-[#2f80ed]"
            >
              = {fmt(evalExpr(day[key]))}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpenDayComments((o) => ({ ...o, [key]: !o[key] }))}
            title="Комментарий"
            className={
              "px-1.5 text-base " +
              (hasComment || openDayComments[key] ? "text-[#047857]" : "text-[#b0b6bf] hover:text-[#374151]")
            }
          >
            💬
          </button>
          <input
            inputMode="text"
            value={day[key]}
            onChange={(e) => setField(key, e.target.value)}
            placeholder="0"
            disabled={closed}
            className="h-full w-44 bg-transparent pr-4 text-right text-lg font-semibold tabular-nums outline-none focus:bg-[#eaf1fd] disabled:opacity-60"
          />
        </div>
        {openDayComments[key] && (
          <input
            value={dayComments[key] ?? ""}
            onChange={(e) => setDayComment(key, e.target.value)}
            placeholder="комментарий — из чего сумма и т.п."
            disabled={closed}
            className="w-full bg-white px-4 py-2 text-sm outline-none disabled:opacity-60"
          />
        )}
      </div>
    );
  };

  const autoRow = (label: string, value: number, highlight = false) => (
    <div
      className={
        "flex h-12 items-center border-l-4 border-transparent " +
        (highlight ? "bg-[#f3f4f6]" : "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]")
      }
    >
      <span className="flex-1 truncate pl-4 pr-2 text-[15px] text-[#6b7280]">{label}</span>
      <span className="w-44 pr-4 text-right text-base font-semibold tabular-nums">{fmt(value)}</span>
    </div>
  );

  const mp = calc.minPlus;
  const mpColor = mp < 0 ? "text-[#c81e1e]" : mp > 0 ? "text-[#c2410c]" : "text-[#047857]";

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-3 flex items-center gap-2">
          <h1 className="text-2xl font-bold">Касса</h1>
          <span className="ml-auto flex items-center gap-2 text-xs text-[#9ca3af]">
            {status && <span>{status}</span>}
            {loading ? (
              <span>загрузка…</span>
            ) : (
              <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
            )}
          </span>
        </header>

        {/* Дата + бейдж закрытия */}
        <div className="mb-3 flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm"
          />
          {closed && (
            <span className="shrink-0 rounded-lg border border-[#7dd3fc] bg-[#ecfeff] px-3 py-2 text-xs font-semibold text-[#155e75]">
              🔒 Смена закрыта
              {closedAt
                ? ` в ${new Date(closedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                : ""}{" "}
              ({closedBy === "auto" ? "авто" : "вручную"})
            </span>
          )}
        </div>

        {/* Две колонки: слева касса, справа расходы */}
        <div className="grid gap-3 md:grid-cols-2">
          {/* ЛЕВАЯ — таблица дня */}
          <div className="overflow-hidden rounded-xl border border-[#e5e7eb] divide-y divide-[#e5e7eb]">
            {inputRow("klaudObshch", "касса Claud")}
            {autoRow("ОБЩ РЕАЛ", calc.obshchReal, true)}
            {inputRow("nalichnye", "НАЛИЧНЫЕ")}
            {inputRow("kaspi", "КАС")}
            {inputRow("halyk", "ХАЛ")}
            {inputRow("inkasNalichka", "инкас наличка")}
            {inputRow("vozvrat", "возврат")}
            {autoRow("ДОЛГ", calc.debt)}
            {autoRow("Расход", calc.rashod)}
            {inputRow("zakupTovar", "закуп товар")}
            {autoRow("Возврат долг", calc.vozvratDolg)}
            <div className="flex h-16 items-center border-l-4 border-transparent bg-[#eaf1fd]">
              <span className="flex-1 pl-4 pr-2 text-lg font-bold text-[#1f2933]">МИН/ПЛЮС</span>
              <span className={"w-52 pr-4 text-right text-3xl font-extrabold tabular-nums " + mpColor}>
                {mp > 0 ? "+" : ""}
                {fmt(mp)}
              </span>
            </div>
          </div>

          {/* ПРАВАЯ — расходы фиксированным списком */}
          <div>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-sm font-semibold uppercase tracking-wide text-[#6b7280]">
                Расходы дня
              </span>
              <span className="text-sm tabular-nums text-[#374151]">Σ {fmt(expensesTotal)}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-[#e5e7eb] divide-y divide-[#e5e7eb]">
              {/* ЗАРПЛАТА — авто из журнала Зарплаты за день, только для просмотра */}
              <div className="flex h-12 items-center" style={{ background: "#eef7ff" }}>
                <span className="flex-1 truncate pl-4 pr-2 text-[15px] text-[#374151]">
                  ЗАРПЛАТА <span className="text-[11px] text-[#9ca3af]">· из журнала</span>
                </span>
                <span className="w-36 pr-4 text-right text-base font-semibold tabular-nums text-[#374151]">
                  {fmt(salaryDayTotal)}
                </span>
              </div>
              {displayCats.map((cat) => (
                <div key={cat}>
                  <div
                    className="flex h-12 items-center"
                    style={{ background: "#f2f7ff" }}
                  >
                    <span className="flex-1 truncate pl-4 pr-2 text-[15px] text-[#374151]">
                      {cat}
                    </span>
                    {hasExpr(exp[cat]?.amount ?? "") && (
                      <span
                        title="Сумма выражения (разбивка сохраняется)"
                        className="mr-1 shrink-0 whitespace-nowrap text-xs font-semibold text-[#2f80ed]"
                      >
                        = {fmt(evalExpr(exp[cat]?.amount ?? ""))}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setOpenComments((o) => ({ ...o, [cat]: !o[cat] }))
                      }
                      title="Комментарий"
                      className={
                        "px-1.5 text-base " +
                        (exp[cat]?.comment || openComments[cat]
                          ? "text-[#047857]"
                          : "text-[#b0b6bf] hover:text-[#374151]")
                      }
                    >
                      💬
                    </button>
                    <input
                      inputMode="text"
                      value={exp[cat]?.amount ?? ""}
                      onChange={(e) => updateExp(cat, { amount: e.target.value })}
                      placeholder="0"
                      disabled={closed}
                      className="h-full w-36 bg-transparent pr-4 text-right text-base font-semibold tabular-nums outline-none focus:bg-[#eaf1fd] disabled:opacity-60"
                    />
                  </div>
                  {openComments[cat] && (
                    <input
                      value={exp[cat]?.comment ?? ""}
                      onChange={(e) => updateExp(cat, { comment: e.target.value })}
                      placeholder="комментарий"
                      disabled={closed}
                      className="w-full bg-white px-4 py-2 text-sm outline-none disabled:opacity-60"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Комментарий дня */}
        <input
          value={day.comment}
          onChange={(e) => setField("comment", e.target.value)}
          placeholder="Комментарий дня"
          disabled={closed}
          className="mt-3 w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm disabled:opacity-60"
        />

        {/* Кнопки: черновик + закрытие, либо переоткрытие */}
        {closed ? (
          <button
            type="button"
            onClick={() => submit("reopen")}
            disabled={saving}
            className="mt-3 w-full rounded-lg border border-[#e5e7eb] bg-white py-3 text-base font-semibold text-[#1f2933] disabled:opacity-50 active:bg-[#f3f4f6]"
          >
            🔓 Переоткрыть смену
          </button>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => submit("save")}
              disabled={saving || loading}
              className="rounded-lg bg-[#2f80ed] py-3 text-base font-semibold text-white disabled:opacity-50 active:bg-[#2568c9]"
            >
              {saving ? "…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => submit("close")}
              disabled={saving || loading}
              className="rounded-lg bg-[#17b6a7] py-3 text-base font-extrabold text-white disabled:opacity-50 active:bg-[#0f9b8e]"
            >
              ЗАКРЫТЬ СМЕНУ
            </button>
          </div>
        )}
        {!closed && (
          <p className="mt-2 text-center text-xs text-[#6b7280]">
            💾 Данные сохраняются автоматически — можно не нажимать «Сохранить»
          </p>
        )}

        {/* Архив дней */}
        <section className="mt-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Архив дней
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {archive.map((d) => {
              const c = d.minPlus < 0 ? "text-[#c81e1e]" : d.minPlus > 0 ? "text-[#c2410c]" : "text-[#047857]";
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setDate(d.date)}
                  className={
                    "shrink-0 rounded-lg border px-3 py-2 text-center " +
                    (d.date === date
                      ? "border-[#2f80ed] bg-[#2f80ed]/10"
                      : "border-[#e5e7eb] bg-white")
                  }
                >
                  <div className="text-[11px] text-[#6b7280]">{d.date.slice(5)}</div>
                  <div className={"text-sm font-bold tabular-nums " + c}>
                    {d.minPlus > 0 ? "+" : ""}
                    {fmt(d.minPlus)}
                  </div>
                </button>
              );
            })}
            {archive.length === 0 && (
              <span className="py-3 text-sm text-[#9ca3af]">Нет сохранённых дней</span>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
