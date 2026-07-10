"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type Client = { id: number; name: string; phone: string | null };
type Entry = {
  id: number;
  date: string;
  clientId: number | null;
  clientName: string | null;
  debtAmount: string;
  paymentAmount: string;
  comment: string | null;
  returnDate: string | null;
};
type Balance = {
  id: number;
  name: string;
  debts: number;
  payments: number;
  ostatok: number;
};
type HistoryRow = {
  id: number;
  date: string;
  debtAmount: string;
  paymentAmount: string;
  comment: string | null;
  returnDate: string | null;
};

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

const input =
  "w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-lg";

export default function DolgiPage() {
  const [date, setDate] = useState(todayStr());
  const [clients, setClients] = useState<Client[]>([]);

  // форма
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [debtAmount, setDebtAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [comment, setComment] = useState("");
  const [returnDate, setReturnDate] = useState("");

  // новый клиент
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // данные дня
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dayTotals, setDayTotals] = useState({ debt: "0", payment: "0" });
  const [balances, setBalances] = useState<Balance[]>([]);
  const [totalOstatok, setTotalOstatok] = useState(0);
  const [balanceSearch, setBalanceSearch] = useState("");

  // история клиента
  const [historyClient, setHistoryClient] = useState<Balance | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const comboRef = useRef<HTMLDivElement>(null);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/clients");
    const data = await res.json();
    setClients(data.clients ?? []);
  }, []);

  const loadDay = useCallback(async (d: string) => {
    const res = await fetch(`/api/dolgi?date=${d}`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setDayTotals(data.dayTotals ?? { debt: "0", payment: "0" });
    setBalances(data.balances ?? []);
    setTotalOstatok(data.totalOstatok ?? 0);
  }, []);

  // Все данные страницы (журнал, итоги, остатки, список клиентов) — просмотровые,
  // форма хранится в отдельных состояниях, поэтому фон можно перезагружать целиком.
  const load = useCallback(async () => {
    await Promise.all([loadDay(date), loadClients()]);
  }, [date, loadDay, loadClients]);

  const { refreshing, lastUpdated } = useLiveData("dolgi", load, [date]);

  // закрытие выпадашки по клику вне
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 20);
    return clients
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [clients, clientQuery]);

  const filteredBalances = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    if (!q) return balances;
    return balances.filter((b) => b.name.toLowerCase().includes(q));
  }, [balances, balanceSearch]);

  function selectClient(c: Client) {
    setClientId(c.id);
    setClientQuery(c.name);
    setMenuOpen(false);
  }

  async function createClient() {
    if (!newName.trim()) return;
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() }),
    });
    if (!res.ok) {
      setStatus("Ошибка создания клиента");
      return;
    }
    const { client } = await res.json();
    await loadClients();
    selectClient(client);
    setShowNew(false);
    setNewName("");
    setNewPhone("");
  }

  function resetForm() {
    setClientId(null);
    setClientQuery("");
    setDebtAmount("");
    setPaymentAmount("");
    setComment("");
    setReturnDate("");
  }

  async function save() {
    if (!clientId) {
      setStatus("Выберите клиента");
      return;
    }
    if (debtAmount === "" && paymentAmount === "") {
      setStatus("Укажите сумму долга или оплаты");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/dolgi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          clientId,
          debtAmount,
          paymentAmount,
          comment,
          returnDate,
        }),
      });
      if (!res.ok) throw new Error();
      resetForm();
      setStatus("Записано ✓");
      await loadDay(date);
    } catch {
      setStatus("Ошибка записи");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm("Удалить запись?")) return;
    const res = await fetch(`/api/dolgi?id=${id}`, { method: "DELETE" });
    if (res.ok) await loadDay(date);
  }

  async function openHistory(b: Balance) {
    setHistoryClient(b);
    setHistory(null);
    const res = await fetch(`/api/dolgi?clientId=${b.id}`);
    const data = await res.json();
    setHistory(data.history ?? []);
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
          <h1 className="text-2xl font-bold">Долги</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        {/* Форма внесения */}
        <section className="mb-6 space-y-3">
          {/* Клиент */}
          <div ref={comboRef} className="relative">
            <span className="mb-1 block text-sm text-neutral-400">Клиент</span>
            <div className="flex gap-2">
              <input
                value={clientQuery}
                onChange={(e) => {
                  setClientQuery(e.target.value);
                  setClientId(null);
                  setMenuOpen(true);
                }}
                onFocus={() => setMenuOpen(true)}
                placeholder="Поиск по имени…"
                className={input + " flex-1"}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="shrink-0 rounded-xl bg-neutral-800 border border-neutral-700 px-3 text-sm"
              >
                + новый
              </button>
            </div>
            {menuOpen && filteredClients.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
                {filteredClients.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectClient(c)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-800"
                    >
                      <span>{c.name}</span>
                      {c.phone ? (
                        <span className="text-xs text-neutral-500">{c.phone}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {clientId && (
              <p className="mt-1 text-xs text-emerald-500">Клиент выбран ✓</p>
            )}
          </div>

          {/* Новый клиент */}
          {showNew && (
            <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Имя клиента"
                className={input}
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Телефон (необязательно)"
                inputMode="tel"
                className={input}
              />
              <button
                type="button"
                onClick={createClient}
                className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white active:bg-blue-700"
              >
                Добавить клиента
              </button>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-400">
              Сумма ДОЛГА (взял)
            </span>
            <input
              inputMode="decimal"
              value={debtAmount}
              onChange={(e) => setDebtAmount(e.target.value)}
              placeholder="0"
              className={input + " text-xl tabular-nums"}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-400">
              Сумма ОПЛАТЫ (вернул)
            </span>
            <input
              inputMode="decimal"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
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

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-400">
                Дата возврата
              </span>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className={input + " text-base"}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-400">
                Дата записи
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={input + " text-base"}
              />
            </label>
          </div>

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

        {/* Итоги за день */}
        <section className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 text-center">
            <div className="text-xs uppercase text-neutral-400">Долг за день</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-red-400">
              {fmt(num(dayTotals.debt))}
            </div>
          </div>
          <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 text-center">
            <div className="text-xs uppercase text-neutral-400">Оплата за день</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
              {fmt(num(dayTotals.payment))}
            </div>
          </div>
        </section>

        {/* Остатки по клиентам */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Остатки по клиентам
          </h2>
          <input
            value={balanceSearch}
            onChange={(e) => setBalanceSearch(e.target.value)}
            placeholder="Поиск по имени…"
            className={input + " mb-3 text-base"}
          />
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Клиент</th>
                  <th className="px-2 py-2 text-right font-medium">Долги</th>
                  <th className="px-2 py-2 text-right font-medium">Оплаты</th>
                  <th className="px-3 py-2 text-right font-medium">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {filteredBalances.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => openHistory(b)}
                    className="cursor-pointer border-t border-neutral-800 active:bg-neutral-900"
                  >
                    <td className="px-3 py-2 text-left">{b.name}</td>
                    <td className="px-2 py-2 text-right text-neutral-400">
                      {fmt(b.debts)}
                    </td>
                    <td className="px-2 py-2 text-right text-neutral-400">
                      {fmt(b.payments)}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right font-semibold " +
                        (b.ostatok > 0
                          ? "text-red-400"
                          : b.ostatok < 0
                            ? "text-emerald-400"
                            : "text-neutral-300")
                      }
                    >
                      {fmt(b.ostatok)}
                    </td>
                  </tr>
                ))}
                {filteredBalances.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-neutral-500"
                    >
                      Нет данных
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3">
            <span className="text-sm text-neutral-400">Общий остаток</span>
            <span className="text-xl font-bold tabular-nums text-red-400">
              {fmt(totalOstatok)}
            </span>
          </div>
        </section>

        {/* Журнал за дату */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Журнал за {date}
          </h2>
          <div className="space-y-2">
            {entries.map((e) => (
              <div
                key={e.id}
                className="rounded-xl bg-neutral-900 border border-neutral-800 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {e.clientName ?? "—"}
                    </div>
                    <div className="mt-0.5 flex gap-3 text-sm tabular-nums">
                      {num(e.debtAmount) > 0 && (
                        <span className="text-red-400">
                          долг {fmt(num(e.debtAmount))}
                        </span>
                      )}
                      {num(e.paymentAmount) > 0 && (
                        <span className="text-emerald-400">
                          оплата {fmt(num(e.paymentAmount))}
                        </span>
                      )}
                    </div>
                    {e.comment ? (
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {e.comment}
                      </div>
                    ) : null}
                    {e.returnDate ? (
                      <div className="text-xs text-neutral-500">
                        возврат до {e.returnDate}
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
              </div>
            ))}
            {entries.length === 0 && (
              <p className="py-4 text-center text-sm text-neutral-500">
                Записей за день нет
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Модалка истории клиента */}
      {historyClient && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setHistoryClient(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-auto rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-800 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">{historyClient.name}</div>
                <div className="text-sm text-neutral-400 tabular-nums">
                  Остаток:{" "}
                  <span
                    className={
                      historyClient.ostatok > 0
                        ? "text-red-400"
                        : "text-emerald-400"
                    }
                  >
                    {fmt(historyClient.ostatok)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryClient(null)}
                className="rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
              >
                Закрыть
              </button>
            </div>
            {history === null ? (
              <p className="py-4 text-center text-neutral-500">Загрузка…</p>
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-neutral-500">Нет записей</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-lg bg-neutral-800/60 border border-neutral-700 p-3"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-400">{h.date}</span>
                      <span className="tabular-nums">
                        {num(h.debtAmount) > 0 && (
                          <span className="text-red-400">
                            +долг {fmt(num(h.debtAmount))}{" "}
                          </span>
                        )}
                        {num(h.paymentAmount) > 0 && (
                          <span className="text-emerald-400">
                            −оплата {fmt(num(h.paymentAmount))}
                          </span>
                        )}
                      </span>
                    </div>
                    {h.comment ? (
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {h.comment}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
