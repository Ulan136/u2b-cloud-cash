"use client";

import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type MonthRow = {
  month: number;
  klaud: number;
  obshchReal: number;
  nalichnye: number;
  kaspi: number;
  halyk: number;
  rashod: number;
  raznica: number;
  sebestoimost: number;
  gross: number;
  net: number;
};
type YearData = { year: number; months: MonthRow[]; totals: Omit<MonthRow, "month"> };
type PerDay = {
  date: string;
  klaud: number;
  sebestoimost: number;
  obshchReal: number;
  minPlus: number;
  closed: boolean;
  closedBy: string | null;
};
type MonthAnalysis = {
  gap: { accumulated: number; perDay: PerDay[] };
  summary: { expensesByCategory: { category: string; amount: number }[] };
};

type RowKey = keyof Omit<MonthRow, "month">;
const ROWS: { key: RowKey; label: string; kind?: "diff" | "edit" }[] = [
  { key: "klaud", label: "Клауд шоп" },
  { key: "obshchReal", label: "Общ реал" },
  { key: "nalichnye", label: "Наличные" },
  { key: "kaspi", label: "Кас" },
  { key: "halyk", label: "Хал" },
  { key: "rashod", label: "Расход" },
  { key: "raznica", label: "Разница +/−", kind: "diff" },
  { key: "sebestoimost", label: "Себестоимость", kind: "edit" },
  { key: "gross", label: "Валовый прибыль" },
  { key: "net", label: "Чистый прибыль" },
];
const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const diffColor = (n: number) =>
  n < 0 ? "text-[#eb5757]" : n > 0 ? "text-[#f2994a]" : "text-[#27ae60]";

export default function ReportsPage() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [yearData, setYearData] = useState<YearData | null>(null);
  const [monthData, setMonthData] = useState<MonthAnalysis | null>(null);
  const [sebEdits, setSebEdits] = useState<Record<number, string>>({});

  const monthRange = useMemo(() => {
    const mm = String(selectedMonth).padStart(2, "0");
    const last = new Date(year, selectedMonth, 0).getDate();
    return {
      from: `${year}-${mm}-01`,
      to: `${year}-${mm}-${String(last).padStart(2, "0")}`,
    };
  }, [year, selectedMonth]);

  const loadYear = useCallback(async () => {
    const res = await fetch(`/api/reports?year=${year}`);
    setYearData(await res.json());
  }, [year]);

  const loadMonth = useCallback(async () => {
    const res = await fetch(`/api/reports?from=${monthRange.from}&to=${monthRange.to}`);
    setMonthData(await res.json());
  }, [monthRange]);

  const load = useCallback(
    async ({ background }: { background: boolean }) => {
      await Promise.all([loadYear(), loadMonth()]);
      if (!background) setSebEdits({});
    },
    [loadYear, loadMonth]
  );

  const { refreshing, lastUpdated } = useLiveData("reports", load, [year, selectedMonth]);

  async function saveSebestoimost(month: number, value: string) {
    await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, sebestoimost: value === "" ? "0" : value }),
    });
    setSebEdits((s) => {
      const next = { ...s };
      delete next[month];
      return next;
    });
    await loadYear();
  }

  const monthAcc = monthData?.gap.accumulated ?? 0;

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">Отчёты</h1>
          <div className="flex items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-1">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="px-2 py-1 text-[#6b7280] hover:text-[#1f2933]"
            >
              ◀
            </button>
            <span className="min-w-[3.5rem] text-center text-sm font-bold tabular-nums">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="px-2 py-1 text-[#6b7280] hover:text-[#1f2933]"
            >
              ▶
            </button>
          </div>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ГОДОВАЯ ТАБЛИЦА */}
          <section className="lg:col-span-2">
            <div className="overflow-x-auto rounded-2xl border border-[#e5e7eb]">
              <table className="w-full border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="bg-white text-[#6b7280]">
                    <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium">
                      Показатель
                    </th>
                    {MONTHS.map((m, i) => (
                      <th
                        key={m}
                        onClick={() => setSelectedMonth(i + 1)}
                        className={
                          "cursor-pointer px-2 py-2 text-right font-medium select-none hover:text-[#1f2933] " +
                          (selectedMonth === i + 1 ? "bg-[#eaf1fd] text-[#2f80ed]" : "")
                        }
                      >
                        {m}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-[#1f2933]">Год</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.key} className="border-t border-[#e5e7eb]">
                      <td className="sticky left-0 z-10 bg-[#f0f2f5] px-3 py-1.5 text-left text-[#374151]">
                        {row.label}
                      </td>
                      {(yearData?.months ?? []).map((mo) => {
                        const v = mo[row.key];
                        if (row.kind === "edit") {
                          return (
                            <td key={mo.month} className="px-1 py-1 text-right">
                              <input
                                inputMode="decimal"
                                value={sebEdits[mo.month] ?? (v ? String(v) : "")}
                                onChange={(e) =>
                                  setSebEdits((s) => ({ ...s, [mo.month]: e.target.value }))
                                }
                                onBlur={(e) => {
                                  const nv = e.target.value;
                                  if (nv !== String(v) && !(nv === "" && v === 0))
                                    saveSebestoimost(mo.month, nv);
                                }}
                                placeholder="0"
                                className="w-16 rounded bg-[#eef4ff] border border-[#cfe0fb] px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-[#2f80ed]"
                              />
                            </td>
                          );
                        }
                        return (
                          <td
                            key={mo.month}
                            className={
                              "px-2 py-1.5 text-right " +
                              (row.kind === "diff"
                                ? diffColor(v) + " font-semibold"
                                : v === 0
                                  ? "text-[#b0b6bf]"
                                  : "")
                            }
                          >
                            {row.kind === "diff" && v > 0 ? "+" : ""}
                            {fmt(v)}
                          </td>
                        );
                      })}
                      {/* Итого за год */}
                      <td
                        className={
                          "px-3 py-1.5 text-right font-bold " +
                          (row.kind === "diff" ? diffColor(yearData?.totals[row.key] ?? 0) : "")
                        }
                      >
                        {yearData
                          ? (row.kind === "diff" && yearData.totals[row.key] > 0 ? "+" : "") +
                            fmt(yearData.totals[row.key])
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-[#9ca3af]">
              Клик по месяцу — анализ справа. Себестоимость — редактируемая ячейка (сохраняется помесячно).
            </p>
          </section>

          {/* ПРАВАЯ ПАНЕЛЬ — анализ месяца */}
          <section className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Анализ — {MONTHS[selectedMonth - 1]} {year}
            </div>

            <div className="rounded-xl border border-[#e5e7eb] bg-[#f0f2f5] p-4 text-center">
              <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                МИН/ПЛЮС месяца
              </div>
              <div className={"mt-1 text-3xl font-extrabold tabular-nums " + diffColor(monthAcc)}>
                {monthAcc > 0 ? "+" : ""}
                {fmt(monthAcc)}
              </div>
            </div>

            <GapChart perDay={monthData?.gap.perDay ?? []} />

            <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-white text-[#6b7280]">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Дата</th>
                    <th className="px-2 py-1.5 text-right font-medium">Claud</th>
                    <th className="px-2 py-1.5 text-right font-medium">ОБЩ РЕАЛ</th>
                    <th className="px-2 py-1.5 text-right font-medium">МИН/ПЛЮС</th>
                  </tr>
                </thead>
                <tbody>
                  {(monthData?.gap.perDay ?? []).map((d) => (
                    <tr key={d.date} className="border-t border-[#e5e7eb]">
                      <td className="px-2 py-1.5 text-left text-[#6b7280]">
                        {d.date.slice(8)}
                        {d.closed && (
                          <span
                            title={d.closedBy === "auto" ? "закрыта автоматически" : "закрыта вручную"}
                            className="ml-1"
                          >
                            {d.closedBy === "auto" ? "🕘" : "🔒"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">{fmt(d.klaud)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(d.obshchReal)}</td>
                      <td className={"px-2 py-1.5 text-right font-semibold " + diffColor(d.minPlus)}>
                        {d.minPlus > 0 ? "+" : ""}
                        {fmt(d.minPlus)}
                      </td>
                    </tr>
                  ))}
                  {monthData && monthData.gap.perDay.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-center text-[#9ca3af]">
                        Нет данных за месяц
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-[#e5e7eb] bg-[#f0f2f5] p-3">
              <div className="mb-1 text-[11px] uppercase text-[#6b7280]">Расходы по категориям</div>
              <div className="space-y-1">
                {(monthData?.summary.expensesByCategory ?? []).map((c) => (
                  <div key={c.category} className="flex items-center justify-between text-sm">
                    <span className="text-[#6b7280]">{c.category}</span>
                    <span className="tabular-nums font-medium">{fmt(c.amount)}</span>
                  </div>
                ))}
                {monthData && monthData.summary.expensesByCategory.length === 0 && (
                  <p className="text-sm text-[#9ca3af]">Нет расходов</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function GapChart({ perDay }: { perDay: PerDay[] }) {
  if (perDay.length === 0) return null;
  const H = 120;
  const mid = H / 2;
  const maxAbs = Math.max(1, ...perDay.map((d) => Math.abs(d.minPlus)));
  const step = 10;
  const barW = 8;
  return (
    <div>
      <div className="mb-1 text-[11px] text-[#9ca3af]">
        МИН/ПЛЮС по дням (вверх — излишек, вниз — недостача)
      </div>
      <svg
        viewBox={`0 0 ${perDay.length * step} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="rounded-xl border border-[#e5e7eb] bg-[#f0f2f5]"
      >
        <line x1={0} y1={mid} x2={perDay.length * step} y2={mid} stroke="#cbd1d9" strokeWidth={0.5} />
        {perDay.map((d, i) => {
          const h = (Math.abs(d.minPlus) / maxAbs) * (mid - 5);
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
