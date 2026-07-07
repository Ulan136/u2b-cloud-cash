"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: number;
  date: string;
  employee: string;
  amount: string;
  comment: string | null;
};
type ByEmployee = { employee: string; total: number };

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const monthStartStr = () => todayStr().slice(0, 7) + "-01";

const input =
  "w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-lg";

export default function SalaryPage() {
  // форма
  const [formDate, setFormDate] = useState(todayStr());
  const [employee, setEmployee] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");

  // период
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());

  // данные
  const [entries, setEntries] = useState<Entry[]>([]);
  const [byEmployee, setByEmployee] = useState<ByEmployee[]>([]);
  const [totalPeriod, setTotalPeriod] = useState(0);
  const [dayTotal, setDayTotal] = useState(0);
  const [employees, setEmployees] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async (f: string, t: string, d: string) => {
    const res = await fetch(`/api/salary?from=${f}&to=${t}&date=${d}`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setByEmployee(data.byEmployee ?? []);
    setTotalPeriod(data.totalPeriod ?? 0);
    setDayTotal(data.dayTotal ?? 0);
    setEmployees(data.employees ?? []);
  }, []);

  useEffect(() => {
    load(from, to, formDate);
  }, [from, to, formDate, load]);

  async function save() {
    if (!employee.trim()) {
      setStatus("Укажите сотрудника");
      return;
    }
    if (amount === "") {
      setStatus("Укажите сумму");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formDate,
          employee: employee.trim(),
          amount,
          comment,
        }),
      });
      if (!res.ok) throw new Error();
      setAmount("");
      setComment("");
      setStatus("Записано ✓");
      await load(from, to, formDate);
    } catch {
      setStatus("Ошибка записи");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm("Удалить запись?")) return;
    const res = await fetch(`/api/salary?id=${id}`, { method: "DELETE" });
    if (res.ok) await load(from, to, formDate);
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
          <h1 className="text-2xl font-bold">Зарплата</h1>
        </header>

        {/* Форма */}
        <section className="mb-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-400">Дата</span>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className={input}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-400">Сотрудник</span>
            <input
              list="employees"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              placeholder="Имя сотрудника"
              className={input}
            />
            <datalist id="employees">
              {employees.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-400">Сумма</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={input + " text-xl tabular-nums"}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-400">Комментарий</span>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={input + " text-base"}
            />
          </label>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white disabled:opacity-50 active:bg-emerald-700"
          >
            {saving ? "Запись…" : "Записать"}
          </button>
          {status && (
            <p className="text-center text-sm text-neutral-300">{status}</p>
          )}
        </section>

        {/* ЗП за сегодня */}
        <section className="mb-6 rounded-xl bg-neutral-900 border border-neutral-800 p-4 text-center">
          <div className="text-xs uppercase text-neutral-400">
            ЗП за {formDate}
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-400">
            {fmt(dayTotal)}
          </div>
        </section>

        {/* Период */}
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Период
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">с</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={input + " text-base"}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">по</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={input + " text-base"}
              />
            </label>
          </div>
        </section>

        {/* Сводка по сотрудникам */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Сводка по сотрудникам
          </h2>
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Сотрудник</th>
                  <th className="px-3 py-2 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((b) => (
                  <tr key={b.employee} className="border-t border-neutral-800">
                    <td className="px-3 py-2 text-left">{b.employee}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {fmt(b.total)}
                    </td>
                  </tr>
                ))}
                {byEmployee.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-4 text-center text-neutral-500"
                    >
                      Нет данных за период
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3">
            <span className="text-sm text-neutral-400">Общий итог за период</span>
            <span className="text-xl font-bold tabular-nums text-emerald-400">
              {fmt(totalPeriod)}
            </span>
          </div>
        </section>

        {/* Журнал за период */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Журнал за период
          </h2>
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-2 rounded-xl bg-neutral-900 border border-neutral-800 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-neutral-500">{e.date}</span>
                    <span className="font-medium truncate">{e.employee}</span>
                  </div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-400">
                    {fmt(num(e.amount))}
                  </div>
                  {e.comment ? (
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {e.comment}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(e.id)}
                  className="shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-red-400"
                  aria-label="Удалить"
                >
                  ✕
                </button>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="py-4 text-center text-sm text-neutral-500">
                Записей за период нет
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
