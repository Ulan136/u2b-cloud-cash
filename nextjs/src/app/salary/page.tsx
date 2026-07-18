"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { useHideAmounts } from "@/lib/useHideAmounts";
import { LiveIndicator } from "@/components/LiveIndicator";
import { DirectorySelect, type DirItem } from "@/components/DirectorySelect";

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
  "w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm";
const panel = "rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4";

export default function SalaryPage() {
  const today = useMemo(() => todayStr(), []);
  // Глазок раскрывает суммы работников, помеченных «скрыть ЗП» (серверный флаг).
  const { hidden: reveal, toggle } = useHideAmounts("salaryReveal");
  const [hiddenEmps, setHiddenEmps] = useState<Set<string>>(new Set());
  const money = (name: string, n: number) =>
    !reveal && hiddenEmps.has(name) ? "••••••" : fmt(n);

  const [dirEmployees, setDirEmployees] = useState<DirItem[]>([]);
  const [byEmployee, setByEmployee] = useState<ByEmployee[]>([]);
  const [totalPeriod, setTotalPeriod] = useState(0);
  const [dayTotal, setDayTotal] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);

  // выбранный работник
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedRef = useRef<string | null>(null);

  // редактирование записи выплаты
  const [editId, setEditId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editComment, setEditComment] = useState("");

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
    setEntries(d.entries ?? []);
  }, [from, to, today]);

  const loadDir = useCallback(async () => {
    const res = await fetch("/api/settings/employees?archived=0");
    const d = await res.json();
    const items = (d.items ?? []) as {
      id: number;
      name: string;
      phone: string | null;
      hidden?: boolean;
    }[];
    setDirEmployees(items.map((i) => ({ id: i.id, name: i.name, phone: i.phone })));
    setHiddenEmps(new Set(items.filter((i) => i.hidden).map((i) => i.name)));
  }, []);

  const loadHistory = useCallback(async (employee: string) => {
    const res = await fetch(`/api/salary?employee=${encodeURIComponent(employee)}`);
    const d = await res.json();
    setHistory(d.history ?? []);
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadReport(), loadDir()]);
    if (selectedRef.current) await loadHistory(selectedRef.current);
  }, [loadReport, loadDir, loadHistory]);

  async function createEmployee(name: string, phone: string): Promise<DirItem | null> {
    const res = await fetch("/api/settings/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });
    if (!res.ok) {
      setStatus(res.status === 409 ? "Такой работник уже есть" : "Ошибка создания");
      return null;
    }
    const { item } = await res.json();
    await loadDir();
    return { id: item.id, name: item.name, phone: item.phone };
  }

  const { refreshing, lastUpdated } = useLiveData("salary", load, [from, to]);

  const byEmpMap = useMemo(
    () => new Map(byEmployee.map((b) => [b.employee, b.total])),
    [byEmployee]
  );

  // Постоянный список ВСЕХ работников из справочника (включая 0 за период), сорт по сумме убыв.
  const roster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dirEmployees
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .map((e) => ({ employee: e.name, total: byEmpMap.get(e.name) ?? 0 }))
      .sort((a, b) => b.total - a.total || a.employee.localeCompare(b.employee, "ru"));
  }, [dirEmployees, byEmpMap, search]);

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

  function startEdit(row: { id: number; amount: string; comment: string | null }) {
    setEditId(row.id);
    setEditAmount(num(row.amount) ? String(num(row.amount)) : "");
    setEditComment(row.comment ?? "");
  }

  async function saveEdit() {
    if (editId == null) return;
    const password = window.prompt("Пароль для изменения записи:");
    if (password === null) return; // отмена ввода пароля
    const res = await fetch("/api/salary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, amount: editAmount, comment: editComment, password }),
    });
    if (res.status === 403) return setStatus("Неверный пароль — изменение не применено");
    if (!res.ok) return setStatus("Ошибка изменения");
    setEditId(null);
    setStatus("Изменено ✓");
    await loadReport();
    if (selectedRef.current) await loadHistory(selectedRef.current);
  }

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">Зарплата</h1>
          <button
            type="button"
            onClick={toggle}
            title={reveal ? "Скрыть закрытые ЗП" : "Показать закрытые ЗП"}
            className="rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-sm"
          >
            {reveal ? "👁" : "🙈"}
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
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Дата</span>
                  <input
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    className={input}
                  />
                </label>
                <label className="block min-w-[160px] flex-1">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Работник</span>
                  <DirectorySelect
                    items={dirEmployees}
                    value={formEmployee}
                    onPick={(it) => setFormEmployee(it.name)}
                    onCreate={createEmployee}
                    placeholder="Выберите или создайте"
                  />
                </label>
                <label className="block w-28">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Сумма</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="аванс"
                    className={input + " text-right tabular-nums"}
                  />
                </label>
                <label className="block min-w-[120px] flex-1">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Комментарий</span>
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
                  className="rounded-lg bg-[#2f80ed] px-5 py-2 text-sm font-bold text-white disabled:opacity-50 active:bg-[#2568c9]"
                >
                  {saving ? "…" : "ВНЕСТИ"}
                </button>
              </div>
              {status && <p className="mt-2 text-xs text-[#374151]">{status}</p>}
            </div>

            {/* Журнал за период / история выбранного */}
            <div className={panel}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  {selected ? `История: ${selected}` : "Журнал за период"}
                </span>
                {selected && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[11px] text-[#27ae60] underline"
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
                            ? "border-[#2f80ed] bg-[#eaf1fd] text-[#2f80ed]"
                            : "border-[#e5e7eb] bg-white text-[#6b7280]")
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

              <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-white text-[#6b7280]">
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
                      ? (history ?? []).map((h) => {
                          const editing = editId === h.id;
                          return (
                            <tr key={h.id} className="border-t border-[#e5e7eb]">
                              <td className="px-2 py-1.5 text-left text-[#6b7280]">{h.date}</td>
                              {editing ? (
                                <>
                                  <td className="px-1 py-1.5 text-right">
                                    <input inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="0" className="w-20 rounded border border-[#e5e7eb] px-1.5 py-1 text-right tabular-nums" />
                                  </td>
                                  <td className="px-1 py-1.5">
                                    <input value={editComment} onChange={(e) => setEditComment(e.target.value)} placeholder="Комментарий" className="w-full min-w-[90px] rounded border border-[#e5e7eb] px-1.5 py-1" />
                                  </td>
                                  <td className="px-1 py-1.5 text-right whitespace-nowrap">
                                    <button type="button" onClick={saveEdit} className="font-bold text-[#0e9f4f] hover:opacity-80" aria-label="Сохранить">✓</button>
                                    <button type="button" onClick={() => setEditId(null)} className="ml-1.5 text-[#9ca3af] hover:text-[#eb5757]" aria-label="Отмена">✕</button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-2 py-1.5 text-right font-semibold text-[#27ae60]">
                                    {money(selected ?? "", num(h.amount))}
                                  </td>
                                  <td className="px-2 py-1.5 text-left text-[#6b7280]">{h.comment}</td>
                                  <td className="px-1 py-1.5 text-right">
                                    <button type="button" onClick={() => startEdit(h)} className="text-[#b0b6bf] hover:text-[#2f80ed]" aria-label="Изменить">✎</button>
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })
                      : entries.map((e) => {
                          const editing = editId === e.id;
                          return (
                            <tr key={e.id} className="border-t border-[#e5e7eb]">
                              <td className="px-2 py-1.5 text-left text-[#6b7280]">{e.date}</td>
                              <td className="px-2 py-1.5 text-left">
                                <button type="button" onClick={() => selectEmployee(e.employee)} className="hover:text-[#27ae60]">
                                  {e.employee}
                                </button>
                              </td>
                              {editing ? (
                                <>
                                  <td className="px-1 py-1.5 text-right">
                                    <input inputMode="decimal" value={editAmount} onChange={(ev) => setEditAmount(ev.target.value)} placeholder="0" className="w-20 rounded border border-[#e5e7eb] px-1.5 py-1 text-right tabular-nums" />
                                  </td>
                                  <td className="px-1 py-1.5">
                                    <input value={editComment} onChange={(ev) => setEditComment(ev.target.value)} placeholder="Комментарий" className="w-full min-w-[90px] rounded border border-[#e5e7eb] px-1.5 py-1" />
                                  </td>
                                  <td className="px-1 py-1.5 text-right whitespace-nowrap">
                                    <button type="button" onClick={saveEdit} className="font-bold text-[#0e9f4f] hover:opacity-80" aria-label="Сохранить">✓</button>
                                    <button type="button" onClick={() => setEditId(null)} className="ml-1.5 text-[#9ca3af] hover:text-[#eb5757]" aria-label="Отмена">✕</button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-2 py-1.5 text-right font-semibold text-[#27ae60]">
                                    {money(e.employee, num(e.amount))}
                                  </td>
                                  <td className="px-2 py-1.5 text-left text-[#6b7280]">{e.comment}</td>
                                  <td className="px-1 py-1.5 text-right">
                                    <button type="button" onClick={() => startEdit(e)} className="text-[#b0b6bf] hover:text-[#2f80ed]" aria-label="Изменить">✎</button>
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                    {((selected && history !== null && history.length === 0) ||
                      (!selected && entries.length === 0)) && (
                      <tr>
                        <td colSpan={selected ? 4 : 5} className="px-2 py-3 text-center text-[#9ca3af]">
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
              <div className="rounded-xl border border-[#cfe0fb] bg-[#eef4ff] p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                  Зарплата за период
                </div>
                <div className="text-2xl font-extrabold tabular-nums text-[#27ae60]">
                  {fmt(totalPeriod)}
                </div>
              </div>
              <div className="rounded-xl border border-[#e5e7eb] bg-[#f0f2f5] p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                  ЗП за день (сегодня)
                </div>
                <div className="text-2xl font-extrabold tabular-nums">{fmt(dayTotal)}</div>
              </div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск работника…"
              className={input}
            />

            <div className="overflow-hidden rounded-lg border border-[#e5e7eb] divide-y divide-[#e5e7eb]">
              {roster.map((r) => (
                <button
                  key={r.employee}
                  type="button"
                  onClick={() => selectEmployee(r.employee)}
                  className={
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm active:bg-white " +
                    (selected === r.employee ? "bg-[#eaf1fd]" : "")
                  }
                >
                  <span className="truncate">{r.employee}</span>
                  <span
                    className={
                      "ml-2 shrink-0 tabular-nums font-semibold " +
                      (r.total > 0 ? "text-[#27ae60]" : "text-[#b0b6bf]")
                    }
                  >
                    {money(r.employee, r.total)}
                  </span>
                </button>
              ))}
              {roster.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-[#9ca3af]">
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
