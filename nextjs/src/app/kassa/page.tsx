"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const MONEY_FIELDS = [
  { key: "klaudObshch", label: "Клауд общ", hint: "продажи CloudShop" },
  { key: "nalichnye", label: "НАЛИЧНЫЕ" },
  { key: "kaspi", label: "КАС" },
  { key: "halyk", label: "ХАЛ" },
  { key: "inkasNalichka", label: "инкас наличка" },
  { key: "vozvrat", label: "возврат" },
  { key: "zakupTovar", label: "закуп товар" },
] as const;

type DayKey = (typeof MONEY_FIELDS)[number]["key"];

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

export default function KassaPage() {
  const [date, setDate] = useState(todayStr());
  const [day, setDay] = useState<Day>(emptyDay());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState({ debt: "0", payment: "0" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`/api/kassa?date=${d}`);
      const data = await res.json();
      const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
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
      setTotals(data.totals ?? { debt: "0", payment: "0" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

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

  // Автополя и главные формулы (C7 «ОБЩ РЕАЛ» и C17 «МИН/ПЛЮС»)
  const calc = useMemo(() => {
    const nal = num(day.nalichnye);
    const kas = num(day.kaspi);
    const hal = num(day.halyk);
    const inkas = num(day.inkasNalichka);
    const vozvrat = num(day.vozvrat);
    const zakup = num(day.zakupTovar);
    const klaud = num(day.klaudObshch);
    const debt = num(totals.debt); // ДОЛГ
    const vozvratDolg = num(totals.payment); // Возврат долг
    const rashod = expensesTotal; // Расход
    const zpDay = expenses
      .filter((e) => e.category === "ЗАРПЛАТА")
      .reduce((s, e) => s + num(e.amount), 0); // ЗП за день

    const obshchReal =
      nal + kas + hal + (rashod + zakup + inkas + debt + vozvrat) - vozvratDolg;
    const minPlus = Math.round((obshchReal - klaud) * 100) / 100;

    return { debt, vozvratDolg, rashod, zpDay, obshchReal, minPlus };
  }, [day, totals, expenses, expensesTotal]);

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
      await load(date);
    } catch {
      setStatus("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
          >
            ← Меню
          </Link>
          <h1 className="text-2xl font-bold">Касса</h1>
        </header>

        {/* Дата */}
        <label className="block mb-6">
          <span className="mb-1 block text-sm text-neutral-400">Дата</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-lg"
          />
        </label>

        {/* МИН/ПЛЮС — разрыв кассы с CloudShop (главное число страницы) */}
        {(() => {
          const mp = calc.minPlus;
          const state =
            mp === 0
              ? {
                  cls: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
                  label: "Касса сходится",
                }
              : mp < 0
                ? {
                    cls: "text-red-400 border-red-800 bg-red-950/40",
                    label: "Недостача",
                  }
                : {
                    cls: "text-orange-400 border-orange-800 bg-orange-950/40",
                    label: "Излишек",
                  };
          return (
            <div className={`mb-6 rounded-2xl border p-5 text-center ${state.cls}`}>
              <div className="text-xs uppercase tracking-wide opacity-80">
                Разрыв кассы с CloudShop
              </div>
              <div className="my-1 text-5xl font-extrabold tabular-nums">
                {mp > 0 ? "+" : ""}
                {fmt(mp)}
              </div>
              <div className="text-sm font-medium">{state.label}</div>
            </div>
          );
        })()}

        {/* Ручной ввод */}
        <section className="mb-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Ввод
          </h2>
          {MONEY_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 flex items-baseline justify-between text-sm text-neutral-300">
                <span>{f.label}</span>
                {"hint" in f && f.hint ? (
                  <span className="text-xs text-neutral-500">{f.hint}</span>
                ) : null}
              </span>
              <input
                inputMode="decimal"
                value={day[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder="0"
                className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-4 text-xl tabular-nums"
              />
            </label>
          ))}
        </section>

        {/* Расходы дня */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Расходы дня
            </h2>
            <span className="text-sm tabular-nums text-neutral-300">
              Σ {fmt(expensesTotal)}
            </span>
          </div>

          <div className="space-y-3">
            {expenses.map((row, i) => (
              <div
                key={i}
                className="rounded-xl bg-neutral-900 border border-neutral-800 p-3 space-y-2"
              >
                <div className="flex gap-2">
                  <select
                    value={row.category}
                    onChange={(e) => updateExpense(i, { category: e.target.value })}
                    className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-3"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeExpense(i)}
                    className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 text-red-400"
                    aria-label="Удалить расход"
                  >
                    ✕
                  </button>
                </div>
                <input
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => updateExpense(i, { amount: e.target.value })}
                  placeholder="Сумма"
                  className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-3 text-lg tabular-nums"
                />
                <input
                  value={row.comment}
                  onChange={(e) => updateExpense(i, { comment: e.target.value })}
                  placeholder="Комментарий"
                  className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-3 text-sm"
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addExpense}
            className="mt-3 w-full rounded-xl border border-dashed border-neutral-700 py-3 text-neutral-300 active:bg-neutral-900"
          >
            + расход
          </button>
        </section>

        {/* Автополя */}
        <section className="mb-6 rounded-xl bg-neutral-900/60 border border-neutral-800 p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Автополя
          </h2>
          <Auto label="ДОЛГ" value={fmt(calc.debt)} />
          <Auto label="Возврат долг" value={fmt(calc.vozvratDolg)} />
          <Auto label="Расход" value={fmt(calc.rashod)} />
          <Auto label="ЗП за день" value={fmt(calc.zpDay)} />
          <div className="my-1 border-t border-neutral-800" />
          <Auto label="ОБЩ РЕАЛ" value={fmt(calc.obshchReal)} />
          <Auto label="МИН/ПЛЮС" value={fmt(calc.minPlus)} />
        </section>

        {/* Комментарий дня */}
        <label className="block mb-6">
          <span className="mb-1 block text-sm text-neutral-400">Комментарий дня</span>
          <textarea
            value={day.comment}
            onChange={(e) => setField("comment", e.target.value)}
            rows={2}
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3"
          />
        </label>

        {/* Сохранить */}
        <div className="sticky bottom-4">
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white disabled:opacity-50 active:bg-emerald-700"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {status && (
            <p className="mt-2 text-center text-sm text-neutral-300">{status}</p>
          )}
          {loading && (
            <p className="mt-2 text-center text-sm text-neutral-500">Загрузка…</p>
          )}
        </div>
      </div>
    </main>
  );
}

function Auto({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
