"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

type Client = { id: number; name: string; phone: string | null };
type Balance = {
  id: number;
  name: string;
  debts: number;
  payments: number;
  ostatok: number;
  overdue: boolean;
};
type HistoryRow = {
  id: number;
  date: string;
  debtAmount: string;
  paymentAmount: string;
  comment: string | null;
  returnDate: string | null;
};
type SortKey = "name" | "debts" | "payments" | "ostatok";
type StatusFilter = "all" | "debt" | "overdue";

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
  "w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm";
const panel = "rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4";

export default function DolgiPage() {
  const today = useMemo(() => todayStr(), []);
  const [clients, setClients] = useState<Client[]>([]);

  // левая панель
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedIdRef = useRef<number | null>(null);

  const [clientQuery, setClientQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // форма внесения
  const [debtAmount, setDebtAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [comment, setComment] = useState("");
  const [returnDate, setReturnDate] = useState("");
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

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/clients");
    const d = await res.json();
    setClients(d.clients ?? []);
  }, []);

  const loadAnalysis = useCallback(async () => {
    const qs = new URLSearchParams({ today });
    if (from && to) {
      qs.set("from", from);
      qs.set("to", to);
    }
    const res = await fetch(`/api/dolgi?${qs.toString()}`);
    const d = await res.json();
    setBalances(d.balances ?? []);
    setTotalOstatok(d.totalOstatok ?? 0);
  }, [from, to, today]);

  const loadHistory = useCallback(async (id: number) => {
    const res = await fetch(`/api/dolgi?clientId=${id}`);
    const d = await res.json();
    setHistory(d.history ?? []);
  }, []);

  // Живое обновление: перезагружаем просмотр (клиенты, анализ, история выбранного),
  // форму и выбор клиента НЕ трогаем.
  const load = useCallback(async () => {
    await Promise.all([loadClients(), loadAnalysis()]);
    if (selectedIdRef.current != null) await loadHistory(selectedIdRef.current);
  }, [loadClients, loadAnalysis, loadHistory]);

  const { refreshing, lastUpdated } = useLiveData("dolgi", load, [from, to]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
    return list.slice(0, 30);
  }, [clients, clientQuery]);

  const selectedPhone = useMemo(
    () => clients.find((c) => c.id === selected?.id)?.phone ?? null,
    [clients, selected]
  );

  const clientOstatok = useMemo(() => {
    if (!history) return 0;
    return history.reduce((s, h) => s + num(h.debtAmount) - num(h.paymentAmount), 0);
  }, [history]);

  function selectClient(c: { id: number; name: string }) {
    selectedIdRef.current = c.id;
    setSelected(c);
    setClientQuery(c.name);
    setMenuOpen(false);
    setHistory(null);
    loadHistory(c.id);
  }

  async function createClient() {
    if (!newName.trim()) return;
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() }),
    });
    if (!res.ok) return setStatus("Ошибка создания клиента");
    const { client } = await res.json();
    await loadClients();
    selectClient(client);
    setShowNew(false);
    setNewName("");
    setNewPhone("");
  }

  async function save() {
    if (!selected) return setStatus("Выберите клиента");
    if (debtAmount === "" && paymentAmount === "")
      return setStatus("Укажите сумму долга или оплаты");
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/dolgi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: recordDate,
          clientId: selected.id,
          debtAmount,
          paymentAmount,
          comment,
          returnDate,
        }),
      });
      if (!res.ok) throw new Error();
      setDebtAmount("");
      setPaymentAmount("");
      setComment("");
      setReturnDate("");
      setStatus("Записано ✓");
      await Promise.all([loadAnalysis(), loadHistory(selected.id)]);
    } catch {
      setStatus("Ошибка записи");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm("Удалить запись?")) return;
    const res = await fetch(`/api/dolgi?id=${id}`, { method: "DELETE" });
    if (res.ok && selected) await Promise.all([loadAnalysis(), loadHistory(selected.id)]);
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    let r = balances;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((b) => b.name.toLowerCase().includes(q));
    if (statusFilter === "debt") r = r.filter((b) => b.ostatok > 0);
    else if (statusFilter === "overdue") r = r.filter((b) => b.overdue);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...r].sort((a, b) =>
      sortKey === "name"
        ? dir * a.name.localeCompare(b.name, "ru")
        : dir * ((a[sortKey] as number) - (b[sortKey] as number))
    );
  }, [balances, search, statusFilter, sortKey, sortDir]);

  const shownTotal = useMemo(() => rows.reduce((s, b) => s + b.ostatok, 0), [rows]);
  const sortMark = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">Долги</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ЛЕВАЯ ПАНЕЛЬ — клиент */}
          <section className="space-y-4">
            {/* Выбор клиента */}
            <div className={panel}>
              <div ref={comboRef} className="relative">
                <span className="mb-1 block text-xs text-[#6b7280]">Клиент</span>
                <div className="flex gap-2">
                  <input
                    value={clientQuery}
                    onChange={(e) => {
                      setClientQuery(e.target.value);
                      setMenuOpen(true);
                    }}
                    onFocus={() => setMenuOpen(true)}
                    placeholder="Поиск по имени…"
                    className={input + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="shrink-0 rounded-lg border border-[#f2994a] px-3 text-sm font-semibold text-[#f2994a]"
                  >
                    + новый
                  </button>
                </div>
                {menuOpen && filteredClients.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#e5e7eb] bg-white shadow-xl">
                    {filteredClients.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectClient(c)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#f3f4f6]"
                        >
                          <span>{c.name}</span>
                          {c.phone ? (
                            <span className="text-xs text-[#9ca3af]">{c.phone}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {showNew && (
                <div className="mt-2 space-y-2 rounded-lg border border-[#e5e7eb] bg-white p-3">
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
                    className="w-full rounded-lg bg-[#f2994a] py-2 text-sm font-semibold text-white"
                  >
                    Добавить клиента
                  </button>
                </div>
              )}
            </div>

            {/* Карточка клиента */}
            {selected ? (
              <div className={panel}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-lg font-bold">{selected.name}</div>
                    {selectedPhone && (
                      <div className="text-xs text-[#9ca3af]">{selectedPhone}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-[#6b7280]">Остаток</div>
                    <div
                      className={
                        "text-2xl font-extrabold tabular-nums " +
                        (clientOstatok > 0
                          ? "text-[#eb5757]"
                          : clientOstatok < 0
                            ? "text-[#27ae60]"
                            : "text-[#374151]")
                      }
                    >
                      {fmt(clientOstatok)}
                    </div>
                  </div>
                </div>

                <div className="mt-2 overflow-x-auto rounded-lg border border-[#e5e7eb]">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-white text-[#6b7280]">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Дата</th>
                        <th className="px-2 py-1.5 text-right font-medium">Долг</th>
                        <th className="px-2 py-1.5 text-right font-medium">Оплата</th>
                        <th className="px-2 py-1.5 text-left font-medium">Комментарий</th>
                        <th className="px-1 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history ?? []).map((h) => (
                        <tr key={h.id} className="border-t border-[#e5e7eb]">
                          <td className="px-2 py-1.5 text-left text-[#6b7280]">
                            {h.date}
                            {h.returnDate && (
                              <span
                                className={
                                  "ml-1 " +
                                  (h.returnDate < today ? "text-[#eb5757]" : "text-[#9ca3af]")
                                }
                              >
                                (↩{h.returnDate})
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[#eb5757]">
                            {num(h.debtAmount) ? fmt(num(h.debtAmount)) : ""}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[#27ae60]">
                            {num(h.paymentAmount) ? fmt(num(h.paymentAmount)) : ""}
                          </td>
                          <td className="px-2 py-1.5 text-left text-[#6b7280]">
                            {h.comment}
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeEntry(h.id)}
                              className="text-[#b0b6bf] hover:text-[#eb5757]"
                              aria-label="Удалить"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                      {history !== null && history.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-3 text-center text-[#9ca3af]">
                            Записей нет
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={panel + " text-center text-sm text-[#9ca3af]"}>
                Выберите клиента слева или справа в таблице
              </div>
            )}

            {/* Форма внесения */}
            <div className={panel}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Внести {selected ? `— ${selected.name}` : ""}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-[#6b7280]">Долг (взял)</span>
                  <input
                    inputMode="decimal"
                    value={debtAmount}
                    onChange={(e) => setDebtAmount(e.target.value)}
                    placeholder="0"
                    className={input + " text-right tabular-nums"}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[#6b7280]">Оплата (вернул)</span>
                  <input
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
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
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-[#6b7280]">Дата возврата</span>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className={input}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-[#6b7280]">Дата записи</span>
                  <input
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    className={input}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-[#2f80ed] py-2.5 text-sm font-semibold text-white disabled:opacity-50 active:bg-[#2568c9]"
              >
                {saving ? "Запись…" : "Записать"}
              </button>
              {status && <p className="mt-2 text-center text-xs text-[#374151]">{status}</p>}
            </div>
          </section>

          {/* ПРАВАЯ ПАНЕЛЬ — анализ */}
          <section className={panel + " space-y-3"}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Анализ остатков
            </div>
            {/* ОБЩИЙ ОСТАТОК — крупно сверху */}
            <div className="rounded-xl border border-[#f5c6c6] bg-[#fdecec] p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                Общий остаток (на руках у клиентов)
                {search || statusFilter !== "all" ? " · по фильтру" : ""}
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-[#eb5757]">
                {fmt(search || statusFilter !== "all" ? shownTotal : totalOstatok)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-[#9ca3af]">период с</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-[#9ca3af]">по</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
              </label>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени…"
              className={input}
            />
            <div className="flex gap-2">
              {(
                [
                  ["all", "Все"],
                  ["debt", "С долгом"],
                  ["overdue", "Просроченные"],
                ] as [StatusFilter, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={
                    "flex-1 rounded-lg border py-1.5 text-xs font-semibold " +
                    (statusFilter === k
                      ? "border-[#2f80ed] bg-[#eaf1fd] text-[#2f80ed]"
                      : "border-[#e5e7eb] bg-white text-[#6b7280]")
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-white text-[#6b7280]">
                  <tr>
                    {(
                      [
                        ["name", "Клиент", "text-left"],
                        ["debts", "Долги", "text-right"],
                        ["payments", "Оплаты", "text-right"],
                        ["ostatok", "Остаток", "text-right"],
                      ] as [SortKey, string, string][]
                    ).map(([k, label, align]) => (
                      <th
                        key={k}
                        onClick={() => toggleSort(k)}
                        className={`cursor-pointer select-none px-3 py-2 font-medium ${align} hover:text-[#1f2933]`}
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
                      key={b.id}
                      onClick={() => selectClient({ id: b.id, name: b.name })}
                      className={
                        "cursor-pointer border-t border-[#e5e7eb] active:bg-white " +
                        (selected?.id === b.id ? "bg-[#eaf1fd]" : "")
                      }
                    >
                      <td className="px-3 py-2 text-left">
                        {b.overdue && <span title="просрочено">🔴 </span>}
                        {b.name}
                      </td>
                      <td className="px-3 py-2 text-right text-[#6b7280]">{fmt(b.debts)}</td>
                      <td className="px-3 py-2 text-right text-[#6b7280]">{fmt(b.payments)}</td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold " +
                          (b.ostatok > 0
                            ? "text-[#eb5757]"
                            : b.ostatok < 0
                              ? "text-[#27ae60]"
                              : "text-[#374151]")
                        }
                      >
                        {fmt(b.ostatok)}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-[#9ca3af]">
                        Нет данных
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
