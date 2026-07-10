"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type Balance = { supplier: string; prihod: number; rashod: number; ostatok: number };
type HistoryRow = {
  id: number;
  date: string;
  prihod: string;
  rashod: string;
  comment: string | null;
};
type SortKey = "supplier" | "prihod" | "rashod" | "ostatok";
type StatusFilter = "all" | "nonzero";

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const input =
  "w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm";
const panel = "rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4";

export default function KonsPage() {
  const today = useMemo(() => todayStr(), []);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  // левая панель
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedRef = useRef<string | null>(null);

  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  // форма внесения
  const [formSupplier, setFormSupplier] = useState("");
  const [prihod, setPrihod] = useState("");
  const [rashod, setRashod] = useState("");
  const [comment, setComment] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // правая панель
  const [balances, setBalances] = useState<Balance[]>([]);
  const [totalOstatok, setTotalOstatok] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("ostatok");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadAnalysis = useCallback(async () => {
    const qs = new URLSearchParams();
    if (from && to) {
      qs.set("from", from);
      qs.set("to", to);
    }
    const res = await fetch(`/api/kons?${qs.toString()}`);
    const d = await res.json();
    setBalances(d.balances ?? []);
    setTotalOstatok(d.totalOstatok ?? 0);
    setSuppliers(d.suppliers ?? []);
  }, [from, to]);

  const loadHistory = useCallback(async (supplier: string) => {
    const res = await fetch(`/api/kons?supplier=${encodeURIComponent(supplier)}`);
    const d = await res.json();
    setHistory(d.history ?? []);
  }, []);

  const load = useCallback(async () => {
    await loadAnalysis();
    if (selectedRef.current) await loadHistory(selectedRef.current);
  }, [loadAnalysis, loadHistory]);

  const { refreshing, lastUpdated } = useLiveData("kons", load, [from, to]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? suppliers.filter((s) => s.toLowerCase().includes(q)) : suppliers;
    return list.slice(0, 30);
  }, [suppliers, query]);

  const supplierOstatok = useMemo(() => {
    if (!history) return 0;
    return history.reduce((s, h) => s + num(h.prihod) - num(h.rashod), 0);
  }, [history]);

  function selectSupplier(name: string) {
    selectedRef.current = name;
    setSelected(name);
    setFormSupplier(name);
    setQuery(name);
    setMenuOpen(false);
    setHistory(null);
    loadHistory(name);
  }

  async function save() {
    const supplier = formSupplier.trim();
    if (!supplier) return setStatus("Укажите поставщика");
    if (prihod === "" && rashod === "") return setStatus("Укажите приход или расход");
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/kons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: recordDate, supplier, prihod, rashod, comment }),
      });
      if (!res.ok) throw new Error();
      setPrihod("");
      setRashod("");
      setComment("");
      setStatus("Записано ✓");
      selectedRef.current = supplier;
      setSelected(supplier);
      await Promise.all([loadAnalysis(), loadHistory(supplier)]);
    } catch {
      setStatus("Ошибка записи");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm("Удалить запись?")) return;
    const res = await fetch(`/api/kons?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadAnalysis();
      if (selectedRef.current) await loadHistory(selectedRef.current);
    }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "supplier" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    let r = balances;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((b) => b.supplier.toLowerCase().includes(q));
    if (statusFilter === "nonzero") r = r.filter((b) => b.ostatok !== 0);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...r].sort((a, b) =>
      sortKey === "supplier"
        ? dir * a.supplier.localeCompare(b.supplier, "ru")
        : dir * ((a[sortKey] as number) - (b[sortKey] as number))
    );
  }, [balances, search, statusFilter, sortKey, sortDir]);

  const shownTotal = useMemo(() => rows.reduce((s, b) => s + b.ostatok, 0), [rows]);
  const sortMark = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">КОНС</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ЛЕВАЯ ПАНЕЛЬ — поставщик */}
          <section className="space-y-4">
            <div className={panel}>
              <div ref={comboRef} className="relative">
                <span className="mb-1 block text-xs text-neutral-400">Поставщик</span>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setMenuOpen(true);
                  }}
                  onFocus={() => setMenuOpen(true)}
                  placeholder="Поиск по названию…"
                  className={input}
                />
                {menuOpen && filteredSuppliers.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
                    {filteredSuppliers.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => selectSupplier(s)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-800"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Карточка поставщика */}
            {selected ? (
              <div className={panel}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-lg font-bold">{selected}</div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-neutral-400">Остаток</div>
                    <div
                      className={
                        "text-2xl font-extrabold tabular-nums " +
                        (supplierOstatok > 0
                          ? "text-red-400"
                          : supplierOstatok < 0
                            ? "text-emerald-400"
                            : "text-neutral-300")
                      }
                    >
                      {fmt(supplierOstatok)}
                    </div>
                  </div>
                </div>

                <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-800">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-neutral-900 text-neutral-400">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Дата</th>
                        <th className="px-2 py-1.5 text-right font-medium">Приход</th>
                        <th className="px-2 py-1.5 text-right font-medium">Расход</th>
                        <th className="px-2 py-1.5 text-left font-medium">Комментарий</th>
                        <th className="px-1 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history ?? []).map((h) => (
                        <tr key={h.id} className="border-t border-neutral-800">
                          <td className="px-2 py-1.5 text-left text-neutral-400">{h.date}</td>
                          <td className="px-2 py-1.5 text-right text-red-400">
                            {num(h.prihod) ? fmt(num(h.prihod)) : ""}
                          </td>
                          <td className="px-2 py-1.5 text-right text-emerald-400">
                            {num(h.rashod) ? fmt(num(h.rashod)) : ""}
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
                          <td colSpan={5} className="px-2 py-3 text-center text-neutral-500">
                            Записей нет
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={panel + " text-center text-sm text-neutral-500"}>
                Выберите поставщика слева или справа в таблице
              </div>
            )}

            {/* Форма внесения */}
            <div className={panel}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Внести
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Поставщик</span>
                <input
                  list="kons-suppliers"
                  value={formSupplier}
                  onChange={(e) => setFormSupplier(e.target.value)}
                  placeholder="Название (можно новый)"
                  className={input}
                />
                <datalist id="kons-suppliers">
                  {suppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Приход</span>
                  <input
                    inputMode="decimal"
                    value={prihod}
                    onChange={(e) => setPrihod(e.target.value)}
                    placeholder="0"
                    className={input + " text-right tabular-nums"}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Расход (оплата)</span>
                  <input
                    inputMode="decimal"
                    value={rashod}
                    onChange={(e) => setRashod(e.target.value)}
                    placeholder="0"
                    className={input + " text-right tabular-nums"}
                  />
                </label>
              </div>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий"
                className={input + " mt-2"}
              />
              <label className="mt-2 block">
                <span className="mb-1 block text-xs text-neutral-400">Дата записи</span>
                <input
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  className={input}
                />
              </label>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 active:bg-emerald-700"
              >
                {saving ? "Запись…" : "Записать"}
              </button>
              {status && <p className="mt-2 text-center text-xs text-neutral-300">{status}</p>}
            </div>
          </section>

          {/* ПРАВАЯ ПАНЕЛЬ — анализ */}
          <section className={panel + " space-y-3"}>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Анализ остатков
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-neutral-500">период с</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-neutral-500">по</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
              </label>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию…"
              className={input}
            />
            <div className="flex gap-2">
              {(
                [
                  ["all", "Все"],
                  ["nonzero", "С остатком"],
                ] as [StatusFilter, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={
                    "flex-1 rounded-lg border py-1.5 text-xs font-semibold " +
                    (statusFilter === k
                      ? "border-emerald-600 bg-emerald-600/20 text-emerald-300"
                      : "border-neutral-800 bg-neutral-900 text-neutral-400")
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-neutral-900 text-neutral-400">
                  <tr>
                    {(
                      [
                        ["supplier", "Поставщик", "text-left"],
                        ["prihod", "Приход", "text-right"],
                        ["rashod", "Оплачено", "text-right"],
                        ["ostatok", "Остаток", "text-right"],
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
                      key={b.supplier}
                      onClick={() => selectSupplier(b.supplier)}
                      className={
                        "cursor-pointer border-t border-neutral-800 active:bg-neutral-900 " +
                        (selected === b.supplier ? "bg-neutral-800/60" : "")
                      }
                    >
                      <td className="px-3 py-2 text-left">{b.supplier}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">{fmt(b.prihod)}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">{fmt(b.rashod)}</td>
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
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-neutral-500">
                        Нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2">
              <span className="text-sm text-neutral-400">
                Итого{search || statusFilter !== "all" ? " (по фильтру)" : ""}
              </span>
              <span className="text-lg font-bold tabular-nums text-red-400">
                {fmt(search || statusFilter !== "all" ? shownTotal : totalOstatok)}
              </span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
