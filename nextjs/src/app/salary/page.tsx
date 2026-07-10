"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { useHideAmounts } from "@/lib/useHideAmounts";
import { LiveIndicator } from "@/components/LiveIndicator";

type ByEmployee = { employee: string; total: number; count: number };
type Entry = { id: number; date: string; employee: string; amount: string; comment: string | null };
type HistoryRow = { id: number; date: string; amount: string; comment: string | null };

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function fmtLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const todayStr = () => fmtLocal(new Date());
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
  "w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm";
const panel = "rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4";

export default function SalaryPage() {
  const today = useMemo(() => todayStr(), []);
  const { hidden, toggle } = useHideAmounts("hideSalary");
  const money = (n: number) => (hidden ? "••••••" : fmt(n));

  const [employees, setEmployees] = useState<string[]>([]);
  const [byEmployee, setByEmployee] = useState<ByEmployee[]>([]);
  const [totalPeriod, setTotalPeriod] = useState(0);
  const [dayTotal, setDayTotal] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);

  // выбранный работник
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedRef = useRef<string | null>(null);

  // форма-строка
  const [formEmployee, setFormEmployee] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // период
  const initRange = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);
  const [preset, setPreset] = useState("month");
  const [search, setSearch] = useState("");

  const loadReport = useCallback(async () => {
    const res = await fetch(`/api/salary?from=${from}&to=${to}&date=${today}`);
    const d = await res.json();
    setByEmployee(d.byEmployee ?? []);
    setTotalPeriod(d.totalPeriod ?? 0);
    setDayTotal(d.dayTotal ?? 0);
    setEmployees(d.employees ?? []);
    setEntries(d.entries ?? []);
  }, [from, to, today]);

  const loadHistory = useCallback(async (employee: string) => {
    const res = await fetch(`/api/salary?employee=${encodeURIComponent(employee)}`);
    const d = await res.json();
    setHistory(d.history ?? []);
  }, []);

  const load = useCallback(async () => {
    await loadReport();
    if (selectedRef.current) await loadHistory(selectedRef.current);
  }, [loadReport, loadHistory]);

  const { refreshing, lastUpdated } = useLiveData("salary", load, [from, to]);

  const byEmpMap = useMemo(
    () => new Map(byEmployee.map((b) => [b.employee, b.total])),
    [byEmployee]
  );

  // Постоянный список ВСЕХ работников (включая 0 за период), сорт по сумме убыв.
  const roster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => !q || e.toLowerCase().includes(q))
      .map((e) => ({ employee: e, total: byEmpMap.get(e) ?? 0 }))
      .sort((a, b) => b.total - a.total || a.employee.localeCompare(b.employee, "ru"));
  }, [employees, byEmpMap, search]);

  function applyPreset(name: string, range: { from: string; to: string }) {
    setPreset(name);
    setFrom(range.from);
    setTo(range.to);
  }

  function selectEmployee(name: string) {
    selectedRef.current = name;
    setSelected(name);
    setFormEmployee(name);
    setHistory(null);
    loadHistory(name);
  }
  function clearSelection() {
    selectedRef.current = null;
    setSelected(null);
    setHistory(null);
  }

  async function save() {
    const employee = formEmployee.trim();
    if (!employee) return setStatus("Укажите работника");
    if (amount === "") return setStatus("Укажите сумму");
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: recordDate, employee, amount, comment }),
      });
      if (!res.ok) throw new Error();
      setAmount("");
      setComment("");
      setStatus("Внесено ✓");
      selectedRef.current = employee;
      setSelected(employee);
      await Promise.all([loadReport(), loadHistory(employee)]);
    } catch {
      setStatus("Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm("Удалить выплату?")) return;
    const res = await fetch(`/api/salary?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadReport();
      if (selectedRef.current) await loadHistory(selectedRef.current);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">Зарплата</h1>
          <button
            type="button"
            onClick={toggle}
            title={hidden ? "Показать суммы" : "Скрыть суммы"}
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm"
          >
            {hidden ? "🙈" : "👁"}
          </button>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ЛЕВАЯ: форма + журнал */}
          <section className="space-y-4">
            {/* Форма одной строкой */}
            <div className={panel}>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block w-32">
                  <span className="mb-1 block text-[11px] text-neutral-400">Дата</span>
                  <input
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    className={input}
                  />
                </label>
                <label className="block min-w-[140px] flex-1">
                  <span className="mb-1 block text-[11px] text-neutral-400">Работник</span>
                  <input
                    list="salary-employees"
                    value={formEmployee}
                    onChange={(e) => setFormEmployee(e.target.value)}
                    placeholder="Имя (или новый)"
                    className={input}
                  />
                  <datalist id="salary-employees">
                    {employees.map((e) => (
                      <option key={e} value={e} />
                    ))}
                  </datalist>
                </label>
                <label className="block w-28">
                  <span className="mb-1 block text-[11px] text-neutral-400">Сумма</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="аванс"
                    className={input + " text-right tabular-nums"}
                  />
                </label>
                <label className="block min-w-[120px] flex-1">
                  <span className="mb-1 block text-[11px] text-neutral-400">Комментарий</span>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="необязательно"
                    className={input}
                  />
                </label>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50 active:bg-emerald-700"
                >
                  {saving ? "…" : "ВНЕСТИ"}
                </button>
              </div>
              {status && <p className="mt-2 text-xs text-neutral-300">{status}</p>}
            </div>

            {/* Журнал за период / история выбранного */}
            <div className={panel}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {selected ? `История: ${selected}` : "Журнал за период"}
                </span>
                {selected && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[11px] text-emerald-400 underline"
                  >
                    ← весь журнал
                  </button>
                )}
              </div>

              {!selected && (
                <>
                  <div className="mb-2 grid grid-cols-3 gap-2">
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
                          "rounded-lg border py-1.5 text-xs font-semibold " +
                          (preset === b.k
                            ? "border-emerald-600 bg-emerald-600/20 text-emerald-300"
                            : "border-neutral-800 bg-neutral-900 text-neutral-400")
                        }
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className={input} />
                    <input type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className={input} />
                  </div>
                </>
              )}

              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-neutral-900 text-neutral-400">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Дата</th>
                      {!selected && <th className="px-2 py-1.5 text-left font-medium">Работник</th>}
                      <th className="px-2 py-1.5 text-right font-medium">Сумма</th>
                      <th className="px-2 py-1.5 text-left font-medium">Комментарий</th>
                      <th className="px-1 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected
                      ? (history ?? []).map((h) => (
                          <tr key={h.id} className="border-t border-neutral-800">
                            <td className="px-2 py-1.5 text-left text-neutral-400">{h.date}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-emerald-400">
                              {money(num(h.amount))}
                            </td>
                            <td className="px-2 py-1.5 text-left text-neutral-400">{h.comment}</td>
                            <td className="px-1 py-1.5 text-right">
                              <button type="button" onClick={() => removeEntry(h.id)} className="text-neutral-600 hover:text-red-400">✕</button>
                            </td>
                          </tr>
                        ))
                      : entries.map((e) => (
                          <tr key={e.id} className="border-t border-neutral-800">
                            <td className="px-2 py-1.5 text-left text-neutral-400">{e.date}</td>
                            <td className="px-2 py-1.5 text-left">
                              <button type="button" onClick={() => selectEmployee(e.employee)} className="hover:text-emerald-400">
                                {e.employee}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-right font-semibold text-emerald-400">
                              {money(num(e.amount))}
                            </td>
                            <td className="px-2 py-1.5 text-left text-neutral-400">{e.comment}</td>
                            <td className="px-1 py-1.5 text-right">
                              <button type="button" onClick={() => removeEntry(e.id)} className="text-neutral-600 hover:text-red-400">✕</button>
                            </td>
                          </tr>
                        ))}
                    {((selected && history !== null && history.length === 0) ||
                      (!selected && entries.length === 0)) && (
                      <tr>
                        <td colSpan={selected ? 4 : 5} className="px-2 py-3 text-center text-neutral-500">
                          Нет выплат
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ПРАВАЯ: постоянный список работников */}
          <section className={panel + " space-y-3"}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                  Зарплата за период
                </div>
                <div className="text-2xl font-extrabold tabular-nums text-emerald-400">
                  {money(totalPeriod)}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                  ЗП за день (сегодня)
                </div>
                <div className="text-2xl font-extrabold tabular-nums">{money(dayTotal)}</div>
              </div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск работника…"
              className={input}
            />

            <div className="overflow-hidden rounded-lg border border-neutral-800 divide-y divide-neutral-800">
              {roster.map((r) => (
                <button
                  key={r.employee}
                  type="button"
                  onClick={() => selectEmployee(r.employee)}
                  className={
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm active:bg-neutral-900 " +
                    (selected === r.employee ? "bg-neutral-800/60" : "")
                  }
                >
                  <span className="truncate">{r.employee}</span>
                  <span
                    className={
                      "ml-2 shrink-0 tabular-nums font-semibold " +
                      (r.total > 0 ? "text-emerald-400" : "text-neutral-600")
                    }
                  >
                    {money(r.total)}
                  </span>
                </button>
              ))}
              {roster.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-neutral-500">
                  Пока нет работников
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
