"use client";

import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
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

const EXPENSE_CATEGORIES = [
  "ЗАРПЛАТА",
  "расход БРАК",
  "Логистика",
  "Расходы разн",
  "Налог",
  "Интернет",
  "су/жылу",
  "Мусор",
  "Свет",
  "Мега кошелек",
  "прочее",
];

type Day = Record<DayKey, string> & { comment: string };
type Expense = { category: string; amount: string; comment: string };

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

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

// приглушённые метки строк (как цветные ячейки в листе)
const STRIPE: Partial<Record<DayKey, string>> = {
  nalichnye: "#3b6ea5",
  kaspi: "#a55b5b",
  halyk: "#4e8a5f",
};

export default function KassaPage() {
  const [date, setDate] = useState(todayStr());
  const [day, setDay] = useState<Day>(emptyDay());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState({ debt: "0", payment: "0" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Фоновое обновление (polling/focus) трогает только просмотр — totals (ДОЛГ/Возврат
  // долг из debts, влияют на авто-МИН/ПЛЮС). day и expenses — форма пользователя,
  // при фоне их НЕ перезаписываем, чтобы не затереть несохранённый ввод.
  const load = useCallback(
    async ({ background }: { background: boolean }) => {
      if (!background) {
        setLoading(true);
        setStatus("");
      }
      try {
        const res = await fetch(`/api/kassa?date=${date}`);
        const data = await res.json();
        const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
        setTotals(data.totals ?? { debt: "0", payment: "0" });
        if (!background) {
          setDay(
            data.day
              ? {
                  klaudObshch: s(data.day.klaudObshch),
                  nalichnye: s(data.day.nalichnye),
                  kaspi: s(data.day.kaspi),
                  halyk: s(data.day.halyk),
                  inkasNalichka: s(data.day.inkasNalichka),
                  vozvrat: s(data.day.vozvrat),
                  zakupTovar: s(data.day.zakupTovar),
                  comment: s(data.day.comment),
                }
              : emptyDay()
          );
          setExpenses(
            (data.expenses ?? []).map((e: Record<string, unknown>) => ({
              category: String(e.category ?? ""),
              amount: s(e.amount),
              comment: s(e.comment),
            }))
          );
        }
      } finally {
        if (!background) setLoading(false);
      }
    },
    [date]
  );

  const { refreshing, lastUpdated } = useLiveData("kassa", load, [date]);

  const setField = (key: DayKey | "comment", value: string) =>
    setDay((d) => ({ ...d, [key]: value }));

  const addExpense = () =>
    setExpenses((e) => [...e, { category: EXPENSE_CATEGORIES[0], amount: "", comment: "" }]);
  const updateExpense = (i: number, patch: Partial<Expense>) =>
    setExpenses((e) => e.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeExpense = (i: number) =>
    setExpenses((e) => e.filter((_, idx) => idx !== i));

  const expensesTotal = useMemo(
    () => expenses.reduce((s, e) => s + num(e.amount), 0),
    [expenses]
  );

  // Автополя и формулы (C7 «ОБЩ РЕАЛ» и C17 «МИН/ПЛЮС»)
  const calc = useMemo(() => {
    const nal = num(day.nalichnye);
    const kas = num(day.kaspi);
    const hal = num(day.halyk);
    const inkas = num(day.inkasNalichka);
    const vozvrat = num(day.vozvrat);
    const zakup = num(day.zakupTovar);
    const klaud = num(day.klaudObshch);
    const debt = num(totals.debt);
    const vozvratDolg = num(totals.payment);
    const rashod = expensesTotal;

    const obshchReal =
      nal + kas + hal + (rashod + zakup + inkas + debt + vozvrat) - vozvratDolg;
    const minPlus = Math.round((obshchReal - klaud) * 100) / 100;
    return { debt, vozvratDolg, rashod, obshchReal, minPlus };
  }, [day, totals, expensesTotal]);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/kassa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          day,
          expenses: expenses.filter((e) => e.amount !== "" && e.category),
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("Сохранено ✓");
      await load({ background: false });
    } catch {
      setStatus("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const inputRow = (key: DayKey, label: string) => (
    <div
      className="flex h-10 items-center border-l-4"
      style={{ borderLeftColor: STRIPE[key] ?? "transparent", background: "rgba(16,64,36,0.18)" }}
    >
      <span className="flex-1 truncate pl-3 pr-2 text-[13px] text-neutral-300">{label}</span>
      <input
        inputMode="decimal"
        value={day[key]}
        onChange={(e) => setField(key, e.target.value)}
        placeholder="0"
        className="h-full w-36 bg-transparent pr-3 text-right text-sm tabular-nums outline-none focus:bg-emerald-900/30"
      />
    </div>
  );

  const autoRow = (label: string, value: number, highlight = false) => (
    <div
      className={
        "flex h-10 items-center border-l-4 border-transparent " +
        (highlight ? "bg-neutral-800" : "bg-neutral-900/40")
      }
    >
      <span className="flex-1 truncate pl-3 pr-2 text-[13px] text-neutral-400">{label}</span>
      <span className="w-36 pr-3 text-right text-sm font-semibold tabular-nums">
        {fmt(value)}
      </span>
    </div>
  );

  const mp = calc.minPlus;
  const mpColor = mp < 0 ? "text-red-400" : mp > 0 ? "text-orange-400" : "text-cyan-400";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-3 py-4">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-3 flex items-center gap-2">
          <h1 className="text-xl font-bold">Касса</h1>
          <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
            {status && <span>{status}</span>}
            {loading ? (
              <span>загрузка…</span>
            ) : (
              <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
            )}
          </span>
        </header>

        {/* Дата + сохранить — компактно сверху */}
        <div className="mb-3 flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 active:bg-emerald-700"
          >
            {saving ? "…" : "Сохранить"}
          </button>
        </div>

        {/* Компактная таблица дня — как в листе */}
        <div className="overflow-hidden rounded-xl border border-neutral-800 divide-y divide-neutral-800">
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
          {/* МИН/ПЛЮС — крупнее, цвет */}
          <div className="flex h-14 items-center border-l-4 border-transparent bg-neutral-900">
            <span className="flex-1 pl-3 pr-2 text-sm font-bold text-neutral-300">
              МИН/ПЛЮС
            </span>
            <span className={"w-40 pr-3 text-right text-2xl font-extrabold tabular-nums " + mpColor}>
              {mp > 0 ? "+" : ""}
              {fmt(mp)}
            </span>
          </div>
        </div>

        {/* Расходы дня — компактно ниже таблицы */}
        <section className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Расходы дня
            </span>
            <span className="text-xs tabular-nums text-neutral-300">Σ {fmt(expensesTotal)}</span>
          </div>
          <div className="space-y-1.5">
            {expenses.map((row, i) => (
              <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <select
                    value={row.category}
                    onChange={(e) => updateExpense(i, { category: e.target.value })}
                    className="flex-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateExpense(i, { amount: e.target.value })}
                    placeholder="сумма"
                    className="w-24 rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-right text-sm tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => removeExpense(i)}
                    className="rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-red-400"
                    aria-label="Удалить расход"
                  >
                    ✕
                  </button>
                </div>
                <input
                  value={row.comment}
                  onChange={(e) => updateExpense(i, { comment: e.target.value })}
                  placeholder="комментарий"
                  className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addExpense}
            className="mt-2 w-full rounded-lg border border-dashed border-neutral-700 py-2 text-sm text-neutral-300 active:bg-neutral-900"
          >
            + расход
          </button>
        </section>

        {/* Комментарий дня + сохранить снизу */}
        <input
          value={day.comment}
          onChange={(e) => setField("comment", e.target.value)}
          placeholder="Комментарий дня"
          className="mt-3 w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white disabled:opacity-50 active:bg-emerald-700"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </main>
  );
}
