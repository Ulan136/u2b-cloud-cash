"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type PerDay = {
  date: string;
  klaud: number;
  sebestoimost: number;
  obshchReal: number;
  minPlus: number;
};
type Report = {
  from: string;
  to: string;
  gap: { accumulated: number; perDay: PerDay[] };
  profit: {
    sales: number;
    sebestoimost: number;
    gross: number;
    expenses: number;
    salary: number;
    net: number;
  };
  summary: {
    nalichnye: number;
    kaspi: number;
    halyk: number;
    expensesByCategory: { category: string; amount: number }[];
    debts: { issued: number; received: number; delta: number };
    salaryTotal: number;
    kons: { prihod: number; rashod: number };
  };
};

const fmt = (v: number) =>
  v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function fmtLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function weekRange() {
  const t = new Date();
  const f = new Date();
  f.setDate(t.getDate() - 6);
  return { from: fmtLocal(f), to: fmtLocal(t) };
}
function monthRange() {
  const t = new Date();
  return { from: fmtLocal(new Date(t.getFullYear(), t.getMonth(), 1)), to: fmtLocal(t) };
}
function yearRange() {
  const t = new Date();
  return { from: fmtLocal(new Date(t.getFullYear(), 0, 1)), to: fmtLocal(t) };
}

const input =
  "w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 text-base";

export default function ReportsPage() {
  const init = monthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [preset, setPreset] = useState("month");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  // Черновики редактируемой себестоимости по датам
  const [sebEdits, setSebEdits] = useState<Record<string, string>>({});

  // Фон обновляет только data (просмотр). Черновики sebEdits при фоне НЕ сбрасываем —
  // иначе затрём то, что админ сейчас правит; в ячейке всё равно показывается черновик.
  const load = useCallback(
    async ({ background }: { background: boolean }) => {
      if (!background) setLoading(true);
      try {
        const res = await fetch(`/api/reports?from=${from}&to=${to}`);
        setData(await res.json());
        if (!background) setSebEdits({});
      } finally {
        if (!background) setLoading(false);
      }
    },
    [from, to]
  );

  const { refreshing, lastUpdated } = useLiveData("reports", load, [from, to]);

  async function saveSebestoimost(date: string, value: string) {
    await fetch("/api/kassa", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, sebestoimost: value === "" ? "0" : value }),
    });
    setSebEdits((s) => {
      const next = { ...s };
      delete next[date];
      return next;
    });
    await load({ background: true });
  }

  function applyPreset(name: string, range: { from: string; to: string }) {
    setPreset(name);
    setFrom(range.from);
    setTo(range.to);
  }

  const gapState = useMemo(() => {
    const a = data?.gap.accumulated ?? 0;
    if (a === 0)
      return {
        cls: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
        label: "Касса сходится",
      };
    if (a < 0)
      return {
        cls: "text-red-400 border-red-800 bg-red-950/40",
        label: "Недостача",
      };
    return {
      cls: "text-orange-400 border-orange-800 bg-orange-950/40",
      label: "Излишек",
    };
  }, [data]);

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
          <h1 className="text-2xl font-bold">Отчёты</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        {/* Период */}
        <section className="mb-5">
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              { k: "week", label: "Неделя", r: weekRange },
              { k: "month", label: "Месяц", r: monthRange },
              { k: "year", label: "Год", r: yearRange },
            ].map((b) => (
              <button
                key={b.k}
                type="button"
                onClick={() => applyPreset(b.k, b.r())}
                className={
                  "rounded-xl py-3 text-sm font-semibold border " +
                  (preset === b.k
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-300")
                }
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">с</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
                className={input}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">по</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
                className={input}
              />
            </label>
          </div>
        </section>

        {loading && (
          <p className="py-4 text-center text-sm text-neutral-500">Загрузка…</p>
        )}

        {data && (
          <>
            {/* БЛОК 1 — РАЗРЫВ КАССЫ */}
            <div className={`mb-4 rounded-2xl border p-5 text-center ${gapState.cls}`}>
              <div className="text-xs uppercase tracking-wide opacity-80">
                Накопленный разрыв кассы с CloudShop
              </div>
              <div className="my-1 text-4xl font-extrabold tabular-nums">
                {data.gap.accumulated > 0 ? "+" : ""}
                {fmt(data.gap.accumulated)}
              </div>
              <div className="text-sm font-medium">{gapState.label}</div>
            </div>

            <GapChart perDay={data.gap.perDay} />

            {/* Таблица по дням */}
            <div className="mb-6 overflow-x-auto rounded-xl border border-neutral-800">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-neutral-900 text-neutral-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Дата</th>
                    <th className="px-2 py-2 text-right font-medium">Клауд</th>
                    <th className="px-2 py-2 text-right font-medium">Себест.</th>
                    <th className="px-2 py-2 text-right font-medium">ОБЩ РЕАЛ</th>
                    <th className="px-3 py-2 text-right font-medium">МИН/ПЛЮС</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gap.perDay.map((d) => (
                    <tr key={d.date} className="border-t border-neutral-800">
                      <td className="px-3 py-2 text-left text-neutral-400">
                        {d.date.slice(5)}
                      </td>
                      <td className="px-2 py-2 text-right">{fmt(d.klaud)}</td>
                      <td className="px-1 py-1 text-right">
                        <input
                          inputMode="decimal"
                          value={sebEdits[d.date] ?? (d.sebestoimost ? String(d.sebestoimost) : "")}
                          onChange={(e) =>
                            setSebEdits((s) => ({ ...s, [d.date]: e.target.value }))
                          }
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== String(d.sebestoimost) && !(v === "" && d.sebestoimost === 0))
                              saveSebestoimost(d.date, v);
                          }}
                          placeholder="0"
                          className="w-20 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-emerald-600"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">{fmt(d.obshchReal)}</td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold " +
                          (d.minPlus < 0
                            ? "text-red-400"
                            : d.minPlus > 0
                              ? "text-orange-400"
                              : "text-neutral-300")
                        }
                      >
                        {d.minPlus > 0 ? "+" : ""}
                        {fmt(d.minPlus)}
                      </td>
                    </tr>
                  ))}
                  {data.gap.perDay.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-neutral-500">
                        Нет данных за период
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* БЛОК 2 — ПРИБЫЛЬ */}
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Прибыль
              </h2>
              <div className="space-y-2 rounded-xl bg-neutral-900 border border-neutral-800 p-4">
                <Row label="Продажи (Клауд общ)" value={fmt(data.profit.sales)} />
                <Row label="Себестоимость" value={fmt(data.profit.sebestoimost)} />
                <div className="my-1 border-t border-neutral-800" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-300">Валовая прибыль</span>
                  <span className="text-2xl font-bold tabular-nums text-emerald-400">
                    {fmt(data.profit.gross)}
                  </span>
                </div>
                <div className="my-1 border-t border-neutral-800" />
                <Row label="− Расходы за период" value={fmt(data.profit.expenses)} />
                <Row label="− Зарплата" value={fmt(data.profit.salary)} />
                <div className="my-1 border-t border-neutral-800" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-200">
                    ЧИСТЫМИ
                  </span>
                  <span
                    className={
                      "text-2xl font-extrabold tabular-nums " +
                      (data.profit.net >= 0 ? "text-emerald-400" : "text-red-400")
                    }
                  >
                    {fmt(data.profit.net)}
                  </span>
                </div>
              </div>
            </section>

            {/* БЛОК 3 — СВОДКА */}
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Сводка за период
              </h2>

              <div className="mb-3 grid grid-cols-3 gap-2">
                <Tile label="Наличные" value={fmt(data.summary.nalichnye)} />
                <Tile label="Каспи" value={fmt(data.summary.kaspi)} />
                <Tile label="Халык" value={fmt(data.summary.halyk)} />
              </div>

              <div className="mb-3 rounded-xl bg-neutral-900 border border-neutral-800 p-4">
                <div className="mb-2 text-xs uppercase text-neutral-400">
                  Расходы по категориям
                </div>
                <div className="space-y-1">
                  {data.summary.expensesByCategory.map((c) => (
                    <Row key={c.category} label={c.category} value={fmt(c.amount)} />
                  ))}
                  {data.summary.expensesByCategory.length === 0 && (
                    <p className="text-sm text-neutral-500">Нет расходов</p>
                  )}
                </div>
              </div>

              <div className="mb-3 rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-1">
                <div className="mb-1 text-xs uppercase text-neutral-400">Долги</div>
                <Row label="Выдано" value={fmt(data.summary.debts.issued)} />
                <Row label="Получено" value={fmt(data.summary.debts.received)} />
                <Row
                  label="Дельта (выдано − получено)"
                  value={fmt(data.summary.debts.delta)}
                  strong
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
                  <div className="mb-1 text-xs uppercase text-neutral-400">
                    Зарплата (итого)
                  </div>
                  <div className="text-xl font-bold tabular-nums">
                    {fmt(data.summary.salaryTotal)}
                  </div>
                </div>
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-1">
                  <div className="mb-1 text-xs uppercase text-neutral-400">КОНС</div>
                  <Row label="Приход" value={fmt(data.summary.kons.prihod)} />
                  <Row label="Оплаты" value={fmt(data.summary.kons.rashod)} />
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-neutral-400">{label}</span>
      <span
        className={
          "tabular-nums " + (strong ? "text-lg font-bold" : "font-medium")
        }
      >
        {value}
      </span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3 text-center">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function GapChart({ perDay }: { perDay: PerDay[] }) {
  if (perDay.length === 0) return null;
  const H = 160;
  const mid = H / 2;
  const maxAbs = Math.max(1, ...perDay.map((d) => Math.abs(d.minPlus)));
  const step = 10;
  const barW = 8;

  return (
    <div className="mb-4">
      <div className="mb-1 text-xs text-neutral-500">
        МИН/ПЛЮС по дням (вверх — излишек, вниз — недостача)
      </div>
      <svg
        viewBox={`0 0 ${perDay.length * step} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="rounded-xl bg-neutral-900 border border-neutral-800"
      >
        {/* нулевая линия */}
        <line x1={0} y1={mid} x2={perDay.length * step} y2={mid} stroke="#404040" strokeWidth={0.5} />
        {perDay.map((d, i) => {
          const h = (Math.abs(d.minPlus) / maxAbs) * (mid - 6);
          const x = i * step + (step - barW) / 2;
          const up = d.minPlus >= 0;
          return (
            <rect
              key={d.date}
              x={x}
              y={up ? mid - h : mid}
              width={barW}
              height={h}
              fill={d.minPlus < 0 ? "#f87171" : "#fb923c"}
            >
              <title>
                {d.date}: {d.minPlus > 0 ? "+" : ""}
                {d.minPlus.toLocaleString("ru-RU")}
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
