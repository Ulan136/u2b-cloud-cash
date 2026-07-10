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

// Фиксированный список категорий (как строки в листе), без селектов.
const CATEGORIES = [
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
  const [totals, setTotals] = useState({ debt: "0", payment: "0" });
  const [archive, setArchive] = useState<ArchiveDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [closed, setClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [closedBy, setClosedBy] = useState<string | null>(null);

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
        setArchive(arch.days ?? []);
        // статус смены обновляем всегда (в т.ч. если авто-закрытие произошло в фоне)
        setClosed(Boolean(data.day?.closed));
        setClosedAt(data.day?.closedAt ?? null);
        setClosedBy(data.day?.closedBy ?? null);

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
          const map: Exp = {};
          for (const c of CATEGORIES) map[c] = { amount: "", comment: "" };
          const extras: string[] = [];
          for (const e of data.expenses ?? []) {
            const cat = String(e.category ?? "");
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

  const setField = (key: DayKey | "comment", value: string) =>
    setDay((d) => ({ ...d, [key]: value }));
  const updateExp = (cat: string, patch: Partial<{ amount: string; comment: string }>) =>
    setExp((m) => ({ ...m, [cat]: { ...(m[cat] ?? { amount: "", comment: "" }), ...patch } }));

  const expensesTotal = useMemo(
    () => displayCats.reduce((s, c) => s + num(exp[c]?.amount ?? ""), 0),
    [displayCats, exp]
  );

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

  async function submit(action: "save" | "close" | "reopen") {
    if (action === "close" && !window.confirm("Закрыть смену? День станет доступен только для просмотра."))
      return;
    if (action === "reopen" && !window.confirm("Переоткрыть смену для исправлений?")) return;
    setSaving(true);
    setStatus("");
    try {
      const expenses = displayCats
        .map((c) => ({
          category: c,
          amount: exp[c]?.amount ?? "",
          comment: exp[c]?.comment ?? "",
        }))
        .filter((e) => num(e.amount) !== 0);
      const res = await fetch("/api/kassa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, day, expenses, action }),
      });
      if (!res.ok) throw new Error();
      setStatus(
        action === "close" ? "Смена закрыта ✓" : action === "reopen" ? "Смена переоткрыта" : "Сохранено ✓"
      );
      await load({ background: false });
    } catch {
      setStatus("Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const inputRow = (key: DayKey, label: string) => (
    <div
      className="flex h-10 items-center border-l-4"
      style={{ borderLeftColor: STRIPE[key] ?? "transparent", background: "#f2f7ff" }}
    >
      <span className="flex-1 truncate pl-3 pr-2 text-[13px] text-[#374151]">{label}</span>
      <input
        inputMode="decimal"
        value={day[key]}
        onChange={(e) => setField(key, e.target.value)}
        placeholder="0"
        disabled={closed}
        className="h-full w-32 bg-transparent pr-3 text-right text-sm tabular-nums outline-none focus:bg-[#eaf1fd] disabled:opacity-60"
      />
    </div>
  );

  const autoRow = (label: string, value: number, highlight = false) => (
    <div
      className={
        "flex h-10 items-center border-l-4 border-transparent " +
        (highlight ? "bg-[#f3f4f6]" : "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]")
      }
    >
      <span className="flex-1 truncate pl-3 pr-2 text-[13px] text-[#6b7280]">{label}</span>
      <span className="w-32 pr-3 text-right text-sm font-semibold tabular-nums">{fmt(value)}</span>
    </div>
  );

  const mp = calc.minPlus;
  const mpColor = mp < 0 ? "text-[#eb5757]" : mp > 0 ? "text-[#f2994a]" : "text-[#27ae60]";

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-3 py-4">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-3 flex items-center gap-2">
          <h1 className="text-xl font-bold">Касса</h1>
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
            <span className="shrink-0 rounded-lg border border-cyan-800 bg-cyan-950/40 px-3 py-2 text-xs font-semibold text-cyan-300">
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
            <div className="flex h-14 items-center border-l-4 border-transparent bg-[#eaf1fd]">
              <span className="flex-1 pl-3 pr-2 text-sm font-bold text-[#1f2933]">МИН/ПЛЮС</span>
              <span className={"w-36 pr-3 text-right text-2xl font-extrabold tabular-nums " + mpColor}>
                {mp > 0 ? "+" : ""}
                {fmt(mp)}
              </span>
            </div>
          </div>

          {/* ПРАВАЯ — расходы фиксированным списком */}
          <div>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Расходы дня
              </span>
              <span className="text-xs tabular-nums text-[#374151]">Σ {fmt(expensesTotal)}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-[#e5e7eb] divide-y divide-[#e5e7eb]">
              {displayCats.map((cat) => (
                <div key={cat}>
                  <div
                    className="flex h-10 items-center"
                    style={{ background: "#f2f7ff" }}
                  >
                    <span className="flex-1 truncate pl-3 pr-2 text-[13px] text-[#374151]">
                      {cat}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenComments((o) => ({ ...o, [cat]: !o[cat] }))
                      }
                      title="Комментарий"
                      className={
                        "px-1 text-xs " +
                        (exp[cat]?.comment || openComments[cat]
                          ? "text-[#27ae60]"
                          : "text-[#b0b6bf] hover:text-[#374151]")
                      }
                    >
                      💬
                    </button>
                    <input
                      inputMode="decimal"
                      value={exp[cat]?.amount ?? ""}
                      onChange={(e) => updateExp(cat, { amount: e.target.value })}
                      placeholder="0"
                      disabled={closed}
                      className="h-full w-28 bg-transparent pr-3 text-right text-sm tabular-nums outline-none focus:bg-[#eaf1fd] disabled:opacity-60"
                    />
                  </div>
                  {openComments[cat] && (
                    <input
                      value={exp[cat]?.comment ?? ""}
                      onChange={(e) => updateExp(cat, { comment: e.target.value })}
                      placeholder="комментарий"
                      disabled={closed}
                      className="w-full bg-white px-3 py-1.5 text-xs outline-none disabled:opacity-60"
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

        {/* Архив дней */}
        <section className="mt-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Архив дней
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {archive.map((d) => {
              const c = d.minPlus < 0 ? "text-[#eb5757]" : d.minPlus > 0 ? "text-[#f2994a]" : "text-[#27ae60]";
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
