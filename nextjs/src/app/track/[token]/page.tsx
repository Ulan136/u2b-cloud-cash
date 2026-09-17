"use client";

import { useCallback, useEffect, useState } from "react";

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "U2B Cloud Cash";

type Ev = { date: string; debt: number; payment: number; comment: string; returnDate: string | null };
type Track = { name: string; ostatok: number; events: Ev[] };

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}.${m}.${y}` : d;
};
const pad = (n: number) => String(n).padStart(2, "0");
// Границы текущего месяца (по умолчанию для фильтра истории).
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function TrackPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [data, setData] = useState<Track | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Фильтр истории по датам. По умолчанию — текущий месяц. Пусто = за всё время.
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayStr);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/track?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
      setState("ok");
      setUpdatedAt(new Date());
    } catch {
      setState((s) => (s === "ok" ? "ok" : "error"));
    }
  }, [token]);

  // Первичная загрузка + автообновление (сумма обновляется сама).
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const owes = (data?.ostatok ?? 0) > 0;
  // История, отфильтрованная по выбранному периоду (остаток остаётся полным).
  const shownEvents = (data?.events ?? []).filter(
    (e) => (!from || e.date >= from) && (!to || e.date <= to)
  );

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933]">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 px-4 pb-10 pt-5">
        {/* Шапка */}
        <div className="flex items-center gap-2 pb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2f80ed] text-lg font-bold text-white">
            ₸
          </div>
          <div className="text-[15px] font-extrabold tracking-wide text-[#1f2933]">{STORE_NAME}</div>
        </div>

        {state === "loading" && (
          <div className="rounded-2xl bg-white p-7 text-center text-sm font-semibold text-[#6b7280] shadow-sm">
            Загрузка…
          </div>
        )}

        {state === "error" && (
          <div className="rounded-2xl bg-white p-7 text-center shadow-sm">
            <div className="text-4xl">🔗</div>
            <div className="mt-2 font-semibold text-[#6b7280]">Ссылка не найдена или устарела</div>
          </div>
        )}

        {state === "ok" && data && (
          <>
            <div className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">Ваш долг</div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-lg font-extrabold">{data.name}</div>
              <div className="mt-4 text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                Остаток
              </div>
              <div
                className={
                  "mt-0.5 text-[32px] font-extrabold tabular-nums " +
                  (owes ? "text-[#c81e1e]" : "text-[#047857]")
                }
              >
                {fmt(data.ostatok)} ₸
              </div>
              {!owes && (
                <div className="mt-1 text-sm font-bold text-[#047857]">✓ Долг погашен</div>
              )}
            </div>

            <div className="mt-1 flex items-center justify-between">
              <div className="text-[13px] font-bold text-[#1f2933]">История</div>
              {(from || to) && (
                <button
                  type="button"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="text-[12px] font-semibold text-[#2f80ed] underline"
                >
                  за всё время
                </button>
              )}
            </div>

            {/* Фильтр по датам (по умолчанию — текущий месяц) */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col">
                <span className="mb-1 text-[10px] text-[#9ca3af]">с</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-xs"
                />
              </label>
              <label className="flex flex-col">
                <span className="mb-1 text-[10px] text-[#9ca3af]">по</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-xs"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              {shownEvents.length === 0 && (
                <div className="rounded-xl bg-white p-4 text-center text-sm text-[#9ca3af] shadow-sm">
                  {data.events.length === 0 ? "Пока нет операций" : "Нет операций за период"}
                </div>
              )}
              {shownEvents.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[#374151]">{fmtDate(ev.date)}</div>
                    {ev.comment && (
                      <div className="mt-0.5 truncate text-[11.5px] text-[#9ca3af]">{ev.comment}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {ev.debt > 0 && (
                      <div className="text-[15px] font-extrabold tabular-nums text-[#c81e1e]">
                        +{fmt(ev.debt)}
                      </div>
                    )}
                    {ev.payment > 0 && (
                      <div className="text-[15px] font-extrabold tabular-nums text-[#047857]">
                        −{fmt(ev.payment)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-center text-[11.5px] text-[#9ca3af]">
              Сумма обновляется автоматически
              {updatedAt
                ? ` · ${updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
