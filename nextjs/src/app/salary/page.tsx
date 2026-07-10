"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { useHideAmounts } from "@/lib/useHideAmounts";
import { LiveIndicator } from "@/components/LiveIndicator";

type ByEmployee = { employee: string; total: number; count: number };
type HistoryRow = { id: number; date: string; amount: string; comment: string | null };
type SortKey = "employee" | "count" | "total";

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
function todayStr() {
  return fmtLocal(new Date());
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
  "w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm";
const panel = "rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4";

export default function SalaryPage() {
  const today = useMemo(() => todayStr(), []);
  const curMonth = today.slice(0, 7);
  const { hidden, toggle } = useHideAmounts("hideSalary");
  const money = (n: number) => (hidden ? "••••••" : fmt(n));

  const [employees, setEmployees] = useState<string[]>([]);

  // левая панель
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedRef = useRef<string | null>(null);

  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  // форма выплаты
  const [formEmployee, setFormEmployee] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // правая панель
  const [byEmployee, setByEmployee] = useState<ByEmployee[]>([]);
  const [totalPeriod, setTotalPeriod] = useState(0);
  const initRange = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);
  const [preset, setPreset] = useState("month");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadReport = useCallback(async () => {
    const res = await fetch(`/api/salary?from=${from}&to=${to}`);
    const d = await res.json();
    setByEmployee(d.byEmployee ?? []);
    setTotalPeriod(d.totalPeriod ?? 0);
    setEmployees(d.employees ?? []);
  }, [from, to]);

  const loadHistory = useCallback(async (employee: string) => {
    const res = await fetch(`/api/salary?employee=${encodeURIComponent(employee)}`);
    const d = await res.json();
    setHistory(d.history ?? []);
  }, []);

  // Живое обновление: просмотр (сводка, история выбранного) обновляем, форму не трогаем.
  const load = useCallback(async () => {
    await loadReport();
    if (selectedRef.current) await loadHistory(selectedRef.current);
  }, [loadReport, loadHistory]);

  const { refreshing, lastUpdated } = useLiveData("salary", load, [from, to]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? employees.filter((e) => e.toLowerCase().includes(q)) : employees;
    return list.slice(0, 30);
  }, [employees, query]);

  const monthTotal = useMemo(() => {
    if (!history) return 0;
    return history
      .filter((h) => h.date.startsWith(curMonth))
      .reduce((s, h) => s + num(h.amount), 0);
  }, [history, curMonth]);

  function selectEmployee(name: string) {
    selectedRef.current = name;
    setSelected(name);
    setFormEmployee(name);
    setQuery(name);
    setMenuOpen(false);
    setHistory(null);
    loadHistory(name);
  }

  function applyPreset(name: string, range: { from: string; to: string }) {
    setPreset(name);
    setFrom(range.from);
    setTo(range.to);
  }

  async function save() {
    const employee = formEmployee.trim();
    if (!employee) return setStatus("Укажите сотрудника");
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
      setStatus("Записано ✓");
      selectedRef.current = employee;
      setSelected(employee);
      await Promise.all([loadReport(), loadHistory(employee)]);
    } catch {
      setStatus("Ошибка записи");
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

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "employee" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    let r = byEmployee;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((b) => b.employee.toLowerCase().includes(q));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...r].sort((a, b) =>
      sortKey === "employee"
        ? dir * a.employee.localeCompare(b.employee, "ru")
        : dir * ((a[sortKey] as number) - (b[sortKey] as number))
    );
  }, [byEmployee, search, sortKey, sortDir]);

  const shownFund = useMemo(() => rows.reduce((s, b) => s + b.total, 0), [rows]);
  const sortMark = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

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
          {/* ЛЕВАЯ ПАНЕЛЬ — сотрудник */}
          <section className="space-y-4">
            <div className={panel}>
              <div ref={comboRef} className="relative">
                <span className="mb-1 block text-xs text-neutral-400">Сотрудник</span>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setMenuOpen(true);
                  }}
                  onFocus={() => setMenuOpen(true)}
                  placeholder="Поиск по имени…"
                  className={input}
                />
                {menuOpen && filteredEmployees.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
                    {filteredEmployees.map((e) => (
                      <li key={e}>
                        <button
                          type="button"
                          onClick={() => selectEmployee(e)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-800"
                        >
                          {e}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Карточка сотрудника */}
            {selected ? (
              <div className={panel}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-lg font-bold">{selected}</div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-neutral-400">
                      Выплачено за месяц
                    </div>
                    <div className="text-2xl font-extrabold tabular-nums text-emerald-400">
                      {money(monthTotal)}
                    </div>
                  </div>
                </div>

                <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-800">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-neutral-900 text-neutral-400">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Дата</th>
                        <th className="px-2 py-1.5 text-right font-medium">Сумма</th>
                        <th className="px-2 py-1.5 text-left font-medium">Комментарий</th>
                        <th className="px-1 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history ?? []).map((h) => (
                        <tr key={h.id} className="border-t border-neutral-800">
                          <td className="px-2 py-1.5 text-left text-neutral-400">{h.date}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-emerald-400">
                            {money(num(h.amount))}
                          </td>
                          <td className="px-2 py-1.5 text-left text-neutral-400">{h.comment}</td>
                          <td className="px-1 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeEntry(h.id)}
                              className="text-neutral-600 hover:text-red-400"
                              aria-label="Удалить"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                      {history !== null && history.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-3 text-center text-neutral-500">
                            Выплат нет
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={panel + " text-center text-sm text-neutral-500"}>
                Выберите сотрудника слева или справа в таблице
              </div>
            )}

            {/* Форма выплаты */}
            <div className={panel}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Выплата
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Сотрудник</span>
                <input
                  list="salary-employees"
                  value={formEmployee}
                  onChange={(e) => setFormEmployee(e.target.value)}
                  placeholder="Имя (можно новый)"
                  className={input}
                />
                <datalist id="salary-employees">
                  {employees.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Сумма</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className={input + " text-right tabular-nums"}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Дата</span>
                  <input
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    className={input}
                  />
                </label>
              </div>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий"
                className={input + " mt-2"}
              />
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 active:bg-emerald-700"
              >
                {saving ? "Запись…" : "Записать выплату"}
              </button>
              {status && <p className="mt-2 text-center text-xs text-neutral-300">{status}</p>}
            </div>
          </section>

          {/* ПРАВАЯ ПАНЕЛЬ — анализ */}
          <section className={panel + " space-y-3"}>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Анализ за период
            </div>
            {/* ИТОГО фонд — крупно сверху */}
            <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                Фонд за период{search ? " (по фильтру)" : ""}
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-emerald-400">
                {money(search ? shownFund : totalPeriod)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
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
                    "rounded-lg border py-2 text-xs font-semibold " +
                    (preset === b.k
                      ? "border-emerald-600 bg-emerald-600/20 text-emerald-300"
                      : "border-neutral-800 bg-neutral-900 text-neutral-400")
                  }
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-neutral-500">с</span>
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
                <span className="mb-1 block text-[11px] text-neutral-500">по</span>
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени…"
              className={input}
            />

            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-neutral-900 text-neutral-400">
                  <tr>
                    {(
                      [
                        ["employee", "ФИО", "text-left"],
                        ["total", "Выплачено", "text-right"],
                      ] as [SortKey, string, string][]
                    ).map(([k, label, align]) => (
                      <th
                        key={k}
                        onClick={() => toggleSort(k)}
                        className={`cursor-pointer select-none px-3 py-2 font-medium ${align} hover:text-neutral-200`}
                      >
                        {label}
                        {sortMark(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr
                      key={b.employee}
                      onClick={() => selectEmployee(b.employee)}
                      className={
                        "cursor-pointer border-t border-neutral-800 active:bg-neutral-900 " +
                        (selected === b.employee ? "bg-neutral-800/60" : "")
                      }
                    >
                      <td className="px-3 py-2 text-left">{b.employee}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-400">
                        {money(b.total)}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-4 text-center text-neutral-500">
                        Нет данных за период
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </section>
        </div>
      </div>
    </main>
  );
}
