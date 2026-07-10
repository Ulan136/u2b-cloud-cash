"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type Category = { id: number; name: string; icon: string | null };
type Account = { id: number; name: string; categoryId: number | null; icon: string | null; balance: number; archived: boolean };
type ChartDay = { date: string; minPlus: number };
type Op = { type: string; name: string; amount: number; tone: "in" | "out" | "transfer"; date: string };
type Dashboard = {
  today: { klaud: number; obshchReal: number; minPlus: number };
  shift: { closed: boolean; closedAt: string | null; closedBy: string | null };
  debts: { grandOstatok: number; todayIssued: number; todayReceived: number };
  kons: { grandOstatok: number };
  salaryToday: number;
  finance: { categories: Category[]; accounts: Account[]; total: number };
  chart: ChartDay[];
  recentOps: Op[];
};

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const diffColor = (n: number) => (n < 0 ? "text-[#eb5757]" : n > 0 ? "text-[#f2994a]" : "text-[#27ae60]");

function fmtLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const card = "rounded-lg border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4";

export default function DashboardPage() {
  const today = useMemo(() => fmtLocal(new Date()), []);
  const chartFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return fmtLocal(d);
  }, []);
  const [data, setData] = useState<Dashboard | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard?date=${today}&from=${chartFrom}`);
    setData(await res.json());
  }, [today, chartFrom]);

  const { refreshing, lastUpdated } = useLiveData("dashboard", load, []);

  const mp = data?.today.minPlus ?? 0;
  const shiftLabel = data?.shift.closed
    ? `Закрыта${
        data.shift.closedAt
          ? " в " + new Date(data.shift.closedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
          : ""
      }`
    : "Открыта";

  // чипы по категориям
  const chips = useMemo(() => {
    if (!data) return [];
    const groups = new Map<number | "none", { cat: Category | null; sum: number }>();
    data.finance.accounts
      .filter((a) => !a.archived)
      .forEach((a) => {
        const key = a.categoryId ?? "none";
        if (!groups.has(key)) groups.set(key, { cat: data.finance.categories.find((c) => c.id === a.categoryId) ?? null, sum: 0 });
        groups.get(key)!.sum += a.balance;
      });
    return Array.from(groups.values());
  }, [data]);

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">🏠 Дашборд</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        {/* Ряд 1 — сегодня */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link href="/kassa" className={card + " text-center"}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">МИН/ПЛЮС сегодня</div>
            <div className={"mt-1 text-3xl font-extrabold tabular-nums " + diffColor(mp)}>
              {mp > 0 ? "+" : ""}
              {fmt(mp)}
            </div>
          </Link>
          <Link href="/kassa" className={card + " text-center"}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">ОБЩ РЕАЛ</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums">{fmt(data?.today.obshchReal ?? 0)}</div>
          </Link>
          <Link href="/kassa" className={card + " text-center"}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">касса Claud</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums">{fmt(data?.today.klaud ?? 0)}</div>
          </Link>
          <Link href="/kassa" className={card + " text-center"}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">Смена</div>
            <div className={"mt-1 text-lg font-extrabold " + (data?.shift.closed ? "text-[#eb5757]" : "text-[#27ae60]")}>
              {shiftLabel}
            </div>
            {data?.shift.closed && (
              <div className="text-[10px] text-[#9ca3af]">{data.shift.closedBy === "auto" ? "авто" : "вручную"}</div>
            )}
          </Link>
        </div>

        {/* Ряд 2 */}
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link href="/dolgi" className={card}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">Долги клиентов (остаток)</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-[#eb5757]">{fmt(data?.debts.grandOstatok ?? 0)}</div>
          </Link>
          <Link href="/dolgi" className={card}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">Долг / оплата сегодня</div>
            <div className="mt-1 text-lg font-extrabold tabular-nums">
              <span className="text-[#eb5757]">{fmt(data?.debts.todayIssued ?? 0)}</span>
              <span className="text-[#9ca3af]"> / </span>
              <span className="text-[#27ae60]">{fmt(data?.debts.todayReceived ?? 0)}</span>
            </div>
          </Link>
          <Link href="/kons" className={card}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">КОНС — должны поставщикам</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-[#8b5cf6]">{fmt(data?.kons.grandOstatok ?? 0)}</div>
          </Link>
          <Link href="/salary" className={card}>
            <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">ЗП за сегодня</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-[#27ae60]">{fmt(data?.salaryToday ?? 0)}</div>
          </Link>
        </div>

        {/* Ряд 3 — балансы счетов */}
        <Link href="/finance" className={"mt-3 block " + card}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-[#6b7280]">Балансы счетов (Финансы)</span>
            <span className="text-sm font-extrabold tabular-nums text-[#2f80ed]">Итого {fmt(data?.finance.total ?? 0)}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chips.map((g, i) => (
              <div key={i} className="min-w-[120px] shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f0f2f5] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">
                  {g.cat?.icon ?? "📦"} {g.cat?.name ?? "Без категории"}
                </div>
                <div className="text-base font-extrabold tabular-nums">{fmt(g.sum)}</div>
              </div>
            ))}
            {chips.length === 0 && <span className="py-2 text-sm text-[#9ca3af]">Нет счетов</span>}
          </div>
        </Link>

        {/* Низ: график + операции */}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className={card}>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-[#6b7280]">МИН/ПЛЮС за 14 дней</div>
            <Bars data={data?.chart ?? []} />
          </div>
          <div className={card}>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-[#6b7280]">Последние операции</div>
            <div className="divide-y divide-[#e5e7eb]">
              {(data?.recentOps ?? []).map((o, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-[#6b7280]">{o.type}</span>
                    {o.name && o.name !== "—" ? <span> · {o.name}</span> : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-[#9ca3af]">{o.date.slice(5)}</span>
                  <span
                    className={
                      "w-24 shrink-0 text-right font-semibold tabular-nums " +
                      (o.tone === "in" ? "text-[#27ae60]" : o.tone === "transfer" ? "text-[#2f80ed]" : "text-[#eb5757]")
                    }
                  >
                    {o.tone === "in" ? "+" : o.tone === "out" ? "−" : ""}
                    {fmt(o.amount)}
                  </span>
                </div>
              ))}
              {(data?.recentOps ?? []).length === 0 && <div className="py-3 text-sm text-[#9ca3af]">Операций нет</div>}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Bars({ data }: { data: ChartDay[] }) {
  if (data.length === 0) return <div className="py-6 text-center text-sm text-[#9ca3af]">Нет данных</div>;
  const H = 130;
  const mid = H / 2;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.minPlus)));
  const step = 100 / data.length;
  const bw = step * 0.6;
  return (
    <svg viewBox={`0 0 100 ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <line x1={0} y1={mid} x2={100} y2={mid} stroke="#e5e7eb" strokeWidth={0.5} />
      {data.map((d, i) => {
        const h = (Math.abs(d.minPlus) / maxAbs) * (mid - 4);
        const x = i * step + (step - bw) / 2;
        const up = d.minPlus >= 0;
        return (
          <rect key={d.date} x={x} y={up ? mid - h : mid} width={bw} height={h} fill={d.minPlus < 0 ? "#eb5757" : "#f2994a"}>
            <title>
              {d.date}: {d.minPlus > 0 ? "+" : ""}
              {d.minPlus.toLocaleString("ru-RU")}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
