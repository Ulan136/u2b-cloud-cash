"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type Entry = {
  id: number;
  date: string;
  supplier: string;
  prihod: string;
  rashod: string;
  comment: string | null;
};
type Balance = {
  supplier: string;
  prihod: number;
  rashod: number;
  ostatok: number;
};
type HistoryRow = {
  id: number;
  date: string;
  prihod: string;
  rashod: string;
  comment: string | null;
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
const monthStartStr = () => todayStr().slice(0, 7) + "-01";

const input =
  "w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-lg";

export default function KonsPage() {
  // форма
  const [formDate, setFormDate] = useState(todayStr());
  const [supplier, setSupplier] = useState("");
  const [prihod, setPrihod] = useState("");
  const [rashod, setRashod] = useState("");
  const [comment, setComment] = useState("");

  // период
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());

  // данные
  const [entries, setEntries] = useState<Entry[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [totalOstatok, setTotalOstatok] = useState(0);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [balanceSearch, setBalanceSearch] = useState("");

  // история поставщика
  const [historySup, setHistorySup] = useState<Balance | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Данные страницы — просмотровые (журнал, остатки, подсказки поставщиков);
  // поля формы хранятся отдельно, поэтому фон можно перезагружать целиком.
  const load = useCallback(async () => {
    const res = await fetch(`/api/kons?from=${from}&to=${to}`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setBalances(data.balances ?? []);
    setTotalOstatok(data.totalOstatok ?? 0);
    setSuppliers(data.suppliers ?? []);
  }, [from, to]);

  const { refreshing, lastUpdated } = useLiveData("kons", load, [from, to]);

  const filteredBalances = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    if (!q) return balances;
    return balances.filter((b) => b.supplier.toLowerCase().includes(q));
  }, [balances, balanceSearch]);

  async function save() {
    if (!supplier.trim()) {
      setStatus("Укажите поставщика");
      return;
    }
    if (prihod === "" && rashod === "") {
      setStatus("Укажите приход или расход");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/kons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: formDate,
          supplier: supplier.trim(),
          prihod,
          rashod,
          comment,
        }),
      });
      if (!res.ok) throw new Error();
      setPrihod("");
      setRashod("");
      setComment("");
      setStatus("Записано ✓");
      await load();
    } catch {
      setStatus("Ошибка записи");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm("Удалить запись?")) return;
    const res = await fetch(`/api/kons?id=${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function openHistory(b: Balance) {
    setHistorySup(b);
    setHistory(null);
    const res = await fetch(`/api/kons?supplier=${encodeURIComponent(b.supplier)}`);
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
          <h1 className="text-2xl font-bold">КОНС</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
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
            <span className="mb-1 block text-sm text-neutral-400">Поставщик</span>
            <input
              list="suppliers"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Название поставщика"
              className={input}
            />
            <datalist id="suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-400">
                Приход
              </span>
              <input
                inputMode="decimal"
                value={prihod}
                onChange={(e) => setPrihod(e.target.value)}
                placeholder="0"
                className={input + " text-xl tabular-nums"}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-400">
                Расход (оплата)
              </span>
              <input
                inputMode="decimal"
                value={rashod}
                onChange={(e) => setRashod(e.target.value)}
                placeholder="0"
                className={input + " text-xl tabular-nums"}
              />
            </label>
          </div>

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

        {/* Остатки по поставщикам */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Остатки по поставщикам
          </h2>
          <input
            value={balanceSearch}
            onChange={(e) => setBalanceSearch(e.target.value)}
            placeholder="Поиск по названию…"
            className={input + " mb-3 text-base"}
          />
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Поставщик</th>
                  <th className="px-2 py-2 text-right font-medium">Приход</th>
                  <th className="px-2 py-2 text-right font-medium">Оплачено</th>
                  <th className="px-3 py-2 text-right font-medium">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {filteredBalances.map((b) => (
                  <tr
                    key={b.supplier}
                    onClick={() => openHistory(b)}
                    className="cursor-pointer border-t border-neutral-800 active:bg-neutral-900"
                  >
                    <td className="px-3 py-2 text-left">{b.supplier}</td>
                    <td className="px-2 py-2 text-right text-neutral-400">
                      {fmt(b.prihod)}
                    </td>
                    <td className="px-2 py-2 text-right text-neutral-400">
                      {fmt(b.rashod)}
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

        {/* Период */}
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Период журнала
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
                    <span className="font-medium truncate">{e.supplier}</span>
                  </div>
                  <div className="mt-0.5 flex gap-3 text-sm tabular-nums">
                    {num(e.prihod) > 0 && (
                      <span className="text-red-400">
                        приход {fmt(num(e.prihod))}
                      </span>
                    )}
                    {num(e.rashod) > 0 && (
                      <span className="text-emerald-400">
                        расход {fmt(num(e.rashod))}
                      </span>
                    )}
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

      {/* Модалка истории поставщика */}
      {historySup && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setHistorySup(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-auto rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-800 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">{historySup.supplier}</div>
                <div className="text-sm text-neutral-400 tabular-nums">
                  Остаток:{" "}
                  <span
                    className={
                      historySup.ostatok > 0
                        ? "text-red-400"
                        : "text-emerald-400"
                    }
                  >
                    {fmt(historySup.ostatok)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistorySup(null)}
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
                        {num(h.prihod) > 0 && (
                          <span className="text-red-400">
                            +приход {fmt(num(h.prihod))}{" "}
                          </span>
                        )}
                        {num(h.rashod) > 0 && (
                          <span className="text-emerald-400">
                            −оплата {fmt(num(h.rashod))}
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
