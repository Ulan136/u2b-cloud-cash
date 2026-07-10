"use client";

import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type CatRow = { category: string; amount: number };
type Analytics = {
  expensesTotal: number;
  expensesByCategory: CatRow[];
  period: { debtIssued: number; debtReceived: number };
  grand: { clientsOstatok: number; konsOstatok: number };
};

// Порядок строк как в листе «АНАЛИЗ»
const CATEGORY_ROWS = [
  "Мега кошелек",
  "Кимбай",
  "ЗАРПЛАТА",
  "расход БРАК",
  "Логистика",
  "Расходы разн",
  "Свет",
  "Налог",
  "Интернет",
  "су/жылу",
  "Мусор",
];

const CAT_COLORS = [
  "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#3b82f6",
  "#10b981", "#eab308", "#14b8a6", "#f97316", "#a855f7",
  "#64748b", "#0ea5e9", "#d946ef",
];

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

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

const input = "rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm";

export default function AnalyticsPage() {
  const initRange = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);
  const [preset, setPreset] = useState("month");
  const [data, setData] = useState<Analytics | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/analytics?from=${from}&to=${to}`);
    setData(await res.json());
  }, [from, to]);

  const { refreshing, lastUpdated } = useLiveData("analytics", load, [from, to]);

  function applyPreset(name: string, range: { from: string; to: string }) {
    setPreset(name);
    setFrom(range.from);
    setTo(range.to);
  }

  const catMap = useMemo(() => {
    const m = new Map<string, number>();
    (data?.expensesByCategory ?? []).forEach((c) => m.set(c.category, c.amount));
    return m;
  }, [data]);

  const total = data?.expensesTotal ?? 0;
  const mega = catMap.get("Мега кошелек") ?? 0;
  const kimbay = catMap.get("Кимбай") ?? 0;
  const zarplata = catMap.get("ЗАРПЛАТА") ?? 0;
  const itogBezMega = total - mega;

  // Сегменты пончика расходов
  const donutSegments = useMemo(
    () =>
      (data?.expensesByCategory ?? [])
        .filter((c) => c.amount > 0)
        .map((c, i) => ({ label: c.category, value: c.amount, color: CAT_COLORS[i % CAT_COLORS.length] })),
    [data]
  );

  const dolgKonsSegments = [
    { label: "Общий долг", value: data?.grand.clientsOstatok ?? 0, color: "#ef4444" },
    { label: "Общий конс", value: data?.grand.konsOstatok ?? 0, color: "#8b5cf6" },
  ];
  const dolgOplataSegments = [
    { label: "Долг (выдано)", value: data?.period.debtIssued ?? 0, color: "#ef4444" },
    { label: "Оплата (получено)", value: data?.period.debtReceived ?? 0, color: "#22c55e" },
  ];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">📈 Анализы</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        {/* Период */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
                "rounded-lg border px-3 py-2 text-sm font-semibold " +
                (preset === b.k
                  ? "border-emerald-600 bg-emerald-600/20 text-emerald-300"
                  : "border-neutral-800 bg-neutral-900 text-neutral-400")
              }
            >
              {b.label}
            </button>
          ))}
          <input type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className={input} />
          <span className="text-neutral-500">—</span>
          <input type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className={input} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ЛЕВАЯ — таблица расходов */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Расходы за период
            </div>
            <div className="overflow-hidden rounded-lg border border-neutral-800 divide-y divide-neutral-800">
              <Row label="ЗАРПЛАТА С КИМБАЙ" value={zarplata + kimbay} strong accent="text-amber-300" bg="bg-amber-950/20" />
              {CATEGORY_ROWS.map((cat) => {
                const di = (data?.expensesByCategory ?? []).findIndex((c) => c.category === cat);
                return (
                  <Row
                    key={cat}
                    label={cat}
                    value={catMap.get(cat) ?? 0}
                    dot={di >= 0 ? CAT_COLORS[di % CAT_COLORS.length] : undefined}
                    muted={(catMap.get(cat) ?? 0) === 0}
                  />
                );
              })}
              <Row label="ИТОГ без МЕГА" value={itogBezMega} strong accent="text-emerald-300" bg="bg-emerald-950/25" />
              <div className="h-1 bg-neutral-900" />
              <Row label="Долг (за период)" value={data?.period.debtIssued ?? 0} accent="text-red-400" />
              <Row label="Оплата (за период)" value={data?.period.debtReceived ?? 0} accent="text-emerald-400" />
              <div className="h-1 bg-neutral-900" />
              <Row label="Общий конс (за всё время)" value={data?.grand.konsOstatok ?? 0} strong accent="text-violet-400" />
              <Row label="Общий долг (за всё время)" value={data?.grand.clientsOstatok ?? 0} strong accent="text-red-400" />
            </div>
          </section>

          {/* ПРАВАЯ — три диаграммы */}
          <section className="space-y-4">
            <ChartCard title="Расходы по категориям" segments={donutSegments} total={total} donut />
            <ChartCard title="Общий долг / Общий конс" segments={dolgKonsSegments} />
            <ChartCard title="Долг / Оплата за период" segments={dolgOplataSegments} />
          </section>
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
  bg,
  dot,
  muted,
}: {
  label: string;
  value: number;
  strong?: boolean;
  accent?: string;
  bg?: string;
  dot?: string;
  muted?: boolean;
}) {
  return (
    <div className={"flex h-9 items-center px-3 " + (bg ?? "")}>
      <span className="flex flex-1 items-center gap-2 truncate text-[13px] text-neutral-300">
        {dot && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: dot }} />}
        <span className={strong ? "font-bold text-neutral-100" : ""}>{label}</span>
      </span>
      <span
        className={
          "tabular-nums " +
          (strong ? "text-base font-extrabold " : "text-sm ") +
          (accent ?? (muted ? "text-neutral-600" : "text-neutral-200"))
        }
      >
        {fmt(value)}
      </span>
    </div>
  );
}

type Segment = { label: string; value: number; color: string };

function ChartCard({
  title,
  segments,
  total: totalOverride,
  donut,
}: {
  title: string;
  segments: Segment[];
  total?: number;
  donut?: boolean;
}) {
  const total = totalOverride ?? segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const legend = segments
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }));

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</div>
      <div className="flex items-center gap-4">
        <Donut segments={segments} pie={!donut} center={donut ? fmt(total) : undefined} />
        <div className="min-w-0 flex-1 space-y-1">
          {legend.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-neutral-300">{s.label}</span>
              <span className="tabular-nums text-neutral-200">{fmt(s.value)}</span>
              <span className="w-12 text-right tabular-nums text-neutral-500">
                {s.pct.toFixed(1)}%
              </span>
            </div>
          ))}
          {legend.length === 0 && <div className="text-sm text-neutral-500">Нет данных</div>}
        </div>
      </div>
    </div>
  );
}

function Donut({
  segments,
  size = 140,
  pie,
  center,
}: {
  segments: Segment[];
  size?: number;
  pie?: boolean;
  center?: string;
}) {
  const pad = 3;
  const outer = size / 2 - pad;
  const stroke = pie ? outer : 24;
  const r = outer - stroke / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  let offset = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      {total <= 0 ? (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3f3f46" strokeWidth={stroke} />
      ) : (
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((seg, i) => {
            const v = Math.max(0, seg.value);
            if (v <= 0) return null;
            const len = (v / total) * circ;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
      )}
      {!pie && center != null && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#e5e5e5"
          fontSize="11"
          fontWeight="700"
        >
          {center}
        </text>
      )}
    </svg>
  );
}
