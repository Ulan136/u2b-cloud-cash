"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { notifyLive } from "@/lib/live/transport";
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
  prepayment?: boolean;
  author?: string | null;
};
type DayRow = HistoryRow & {
  clientId: number | null;
  clientName: string | null;
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

// ── Умный поиск клиента: терпит опечатки/пропуски ──
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();
// Подпоследовательность + метрика компактности: если буквы запроса идут по порядку,
// возвращаем «разброс» (last-first) и старт; чем компактнее и раньше — тем лучше.
function subseqSpan(q: string, n: string): { ok: boolean; span: number; first: number } {
  let i = 0, first = -1, last = -1;
  for (let j = 0; j < n.length && i < q.length; j++) {
    if (n[j] === q[i]) {
      if (first < 0) first = j;
      last = j;
      i++;
    }
  }
  return { ok: i === q.length, span: last - first, first: Math.max(0, first) };
}
function lev(a: string, b: string) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
/** Оценка совпадения запроса с именем: >=0 совпало (больше=лучше), -1 нет. */
function matchScore(query: string, name: string): number {
  const q = norm(query), n = norm(name);
  if (!q) return 0;
  const idx = n.indexOf(q);
  if (idx >= 0) return 1000 - idx; // подстрока — лучший вариант
  const ss = subseqSpan(q, n);
  if (ss.ok) return 600 - ss.span - ss.first; // компактнее и раньше = выше
  const words = n.split(/\s+/).filter(Boolean);
  const tol = q.length <= 3 ? 1 : q.length <= 6 ? 2 : 3;
  let best = lev(q, n);
  for (const w of words) best = Math.min(best, lev(q, w));
  if (best <= tol) return 200 - best * 10; // опечатки по слову/строке
  // скользящее окно с опечаткой: «блан» ~ «баглан»
  for (const w of words) {
    for (let s = 0; s + q.length <= w.length; s++) {
      if (lev(q, w.slice(s, s + q.length)) <= tol) return 120 - best;
    }
  }
  return -1;
}

/** Бейдж «предоплата» — синий, помечает осознанный уход остатка в минус. */
function PrepayBadge() {
  return (
    <span
      className="mr-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold align-middle"
      style={{ background: "#e7eefe", color: "#1d4ed8" }}
    >
      предоплата
    </span>
  );
}

/** Сумма-бейдж: долг — красный «+», оплата — зелёный «−». Пустая при нуле. */
function AmtBadge({ v, kind }: { v: number; kind: "debt" | "pay" }) {
  if (!v) return null;
  const debt = kind === "debt";
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-sm font-bold tabular-nums"
      style={
        debt
          ? { background: "#fdecec", color: "#c81e1e" }
          : { background: "#e7f6ee", color: "#047857" }
      }
    >
      {debt ? "+" : "−"}
      {fmt(v)}
    </span>
  );
}

export default function DolgiPage() {
  const today = useMemo(() => todayStr(), []);
  const [clients, setClients] = useState<Client[]>([]);

  // левая панель — выбранный клиент
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedIdRef = useRef<number | null>(null);

  // «История дня» — показывается, когда клиент не выбран
  const [dayDate, setDayDate] = useState(today);
  const [dayHistory, setDayHistory] = useState<DayRow[] | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const showDayRef = useRef(false);
  const dayDateRef = useRef(today);

  const [clientQuery, setClientQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // фильтр периода истории (по умолчанию — вся история)
  // История клиента — за всё время (остаток накопительный, должен сходиться со списком).
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");

  // редактирование записи истории
  const [editId, setEditId] = useState<number | null>(null);
  const [editDebt, setEditDebt] = useState("");
  const [editPay, setEditPay] = useState("");
  const [editComment, setEditComment] = useState("");

  // форма внесения
  const [debtAmount, setDebtAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [comment, setComment] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // модалка «Это предоплата?» — когда оплата уводит остаток клиента в минус
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [prepayInfo, setPrepayInfo] = useState<{ newOstatok: number } | null>(null);

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

  const loadDay = useCallback(async (date: string) => {
    setDayLoading(true);
    try {
      const res = await fetch(`/api/dolgi?day=${date}`);
      const d = await res.json();
      setDayHistory(d.dayHistory ?? []);
    } finally {
      setDayLoading(false);
    }
  }, []);

  function openDay() {
    showDayRef.current = true;
    dayDateRef.current = dayDate;
    loadDay(dayDate);
  }
  function closeDay() {
    showDayRef.current = false;
    setDayHistory(null);
  }
  function changeDayDate(date: string) {
    setDayDate(date);
    dayDateRef.current = date;
    if (showDayRef.current) loadDay(date);
  }

  // Живое обновление: перезагружаем просмотр (клиенты, анализ, история выбранного),
  // форму и выбор клиента НЕ трогаем.
  const load = useCallback(async () => {
    await Promise.all([loadClients(), loadAnalysis()]);
    if (selectedIdRef.current != null) await loadHistory(selectedIdRef.current);
    if (showDayRef.current) await loadDay(dayDateRef.current);
  }, [loadClients, loadAnalysis, loadHistory, loadDay]);

  const { refreshing, lastUpdated } = useLiveData("dolgi", load, [from, to]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Остаток по клиенту (для показа в списке) — из анализа остатков.
  const ostatokById = useMemo(
    () => new Map(balances.map((b) => [b.id, b.ostatok])),
    [balances]
  );

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim();
    if (!q) return clients.slice(0, 30);
    return clients
      .map((c) => ({ c, score: matchScore(q, c.name) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, "ru"))
      .slice(0, 30)
      .map((x) => x.c);
  }, [clients, clientQuery]);

  const selectedPhone = useMemo(
    () => clients.find((c) => c.id === selected?.id)?.phone ?? null,
    [clients, selected]
  );

  // Остаток — всегда за всё время (по полной истории), фильтр периода на него не влияет.
  const clientOstatok = useMemo(() => {
    if (!history) return 0;
    return history.reduce((s, h) => s + num(h.debtAmount) - num(h.paymentAmount), 0);
  }, [history]);

  // Итоги истории дня (долги/оплаты за выбранный день).
  const dayTotals = useMemo(() => {
    const list = dayHistory ?? [];
    return {
      debt: list.reduce((s, r) => s + num(r.debtAmount), 0),
      pay: list.reduce((s, r) => s + num(r.paymentAmount), 0),
    };
  }, [dayHistory]);

  // История с учётом фильтра периода (для отображения).
  const shownHistory = useMemo(() => {
    if (!history) return [];
    return history.filter(
      (h) => (!histFrom || h.date >= histFrom) && (!histTo || h.date <= histTo)
    );
  }, [history, histFrom, histTo]);

  function selectClient(c: { id: number; name: string }) {
    selectedIdRef.current = c.id;
    setSelected(c);
    setClientQuery(c.name);
    setMenuOpen(false);
    setHistory(null);
    loadHistory(c.id);
  }

  /** Сброс выбранного клиента: карточка и история скрываются. */
  function clearSelection() {
    selectedIdRef.current = null;
    setSelected(null);
    setHistory(null);
  }

  /** Полная очистка поля клиента (нажали ✕). */
  function clearClient() {
    clearSelection();
    setClientQuery("");
    setMenuOpen(false);
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

  async function save(prepayment = false) {
    if (!selected) return setStatus("Выберите клиента");
    if (debtAmount === "" && paymentAmount === "")
      return setStatus("Укажите сумму долга или оплаты");
    // Если остаток клиента уходит в минус — это либо ошибка, либо предоплата.
    // Спрашиваем пользователя; при подтверждении отправляем prepayment:true.
    if (!prepayment && history !== null) {
      const newOstatok = clientOstatok + num(debtAmount) - num(paymentAmount);
      if (Math.round(newOstatok * 100) / 100 < 0) {
        setPrepayInfo({ newOstatok });
        setPrepayOpen(true);
        return;
      }
    }
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
          prepayment,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(typeof d?.error === "string" ? d.error : "Ошибка записи");
      }
      setDebtAmount("");
      setPaymentAmount("");
      setComment("");
      setReturnDate("");
      setStatus("Записано ✓");
      notifyLive(); // касса/отчёты сразу подхватят новый долг
      await Promise.all([loadAnalysis(), loadHistory(selected.id)]);
    } catch (e) {
      setStatus(e instanceof Error && e.message ? e.message : "Ошибка записи");
    } finally {
      setSaving(false);
    }
  }

  // Enter в полях формы = кнопка «Записать» (без submit-перезагрузки и повторов).
  function onEnterSave(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && !saving) {
      e.preventDefault();
      save();
    }
  }

  function startEdit(h: HistoryRow) {
    setEditId(h.id);
    setEditDebt(num(h.debtAmount) ? String(num(h.debtAmount)) : "");
    setEditPay(num(h.paymentAmount) ? String(num(h.paymentAmount)) : "");
    setEditComment(h.comment ?? "");
  }

  async function saveEdit() {
    if (editId == null) return;
    const password = window.prompt("Пароль для изменения записи:");
    if (password === null) return; // отмена ввода пароля
    const res = await fetch("/api/dolgi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        debtAmount: editDebt,
        paymentAmount: editPay,
        comment: editComment,
        password,
      }),
    });
    if (res.status === 403) return setStatus("Неверный пароль — изменение не применено");
    if (!res.ok) return setStatus("Ошибка изменения");
    setEditId(null);
    setStatus("Изменено ✓");
    notifyLive();
    if (selected) await Promise.all([loadAnalysis(), loadHistory(selected.id)]);
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
          {/* ЛЕВАЯ ПАНЕЛЬ — форма (первой) + карточка клиента */}
          <section className="space-y-4">
            {/* Форма внесения — самое частое действие */}
            <div className={panel}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Внести {selected ? `— ${selected.name}` : ""}
              </div>

              {/* Клиент: автопоиск + «+ новый» прямо в форме */}
              <div ref={comboRef} className="relative">
                <span className="mb-1 block text-xs text-[#6b7280]">Клиент</span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={clientQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setClientQuery(v);
                        setMenuOpen(true);
                        // стёрли/изменили имя — старая карточка и история скрываются
                        if (selected && v !== selected.name) clearSelection();
                      }}
                      onFocus={() => setMenuOpen(true)}
                      placeholder="Поиск по имени…"
                      className={input + " pr-8"}
                    />
                    {clientQuery && (
                      <button
                        type="button"
                        onClick={clearClient}
                        aria-label="Очистить"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#c81e1e]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="shrink-0 rounded-lg border border-[#f2994a] px-3 text-sm font-semibold text-[#c2410c]"
                  >
                    + новый
                  </button>
                </div>
                {menuOpen && filteredClients.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#e5e7eb] bg-white shadow-xl">
                    {filteredClients.map((c) => {
                      const ost = ostatokById.get(c.id) ?? 0;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => selectClient(c)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#f3f4f6]"
                          >
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            <span className="flex shrink-0 flex-col items-end leading-tight">
                              {ost !== 0 && (
                                <span
                                  className={
                                    "text-sm font-bold tabular-nums " +
                                    (ost > 0 ? "text-[#c81e1e]" : "text-[#047857]")
                                  }
                                >
                                  {fmt(ost)}
                                </span>
                              )}
                              {c.phone && (
                                <span className="text-[11px] text-[#9ca3af]">{c.phone}</span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
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

              {/* Суммы — ключевые поля: крупные, жирные, заметные ячейки */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[13px] font-semibold text-[#374151]">
                    Долг (взял)
                  </span>
                  <input
                    inputMode="decimal"
                    value={debtAmount}
                    onChange={(e) => setDebtAmount(e.target.value)}
                    onKeyDown={onEnterSave}
                    placeholder="0"
                    className="w-full rounded-lg border-2 border-[#f0c9c9] bg-[#fdf3f3] px-3 py-2.5 text-right text-lg font-bold tabular-nums text-[#c81e1e] outline-none placeholder:text-[#d9a3a3] focus:border-[#c81e1e]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-semibold text-[#374151]">
                    Оплата (вернул)
                  </span>
                  <input
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    onKeyDown={onEnterSave}
                    placeholder="0"
                    className="w-full rounded-lg border-2 border-[#c3e6d1] bg-[#f2fbf6] px-3 py-2.5 text-right text-lg font-bold tabular-nums text-[#047857] outline-none placeholder:text-[#9cc9ae] focus:border-[#047857]"
                  />
                </label>
              </div>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={onEnterSave}
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
                onClick={() => save()}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-[#2f80ed] py-2.5 text-sm font-semibold text-white disabled:opacity-50 active:bg-[#2568c9]"
              >
                {saving ? "Запись…" : "Записать"}
              </button>
              {status && <p className="mt-2 text-center text-xs text-[#374151]">{status}</p>}
            </div>

            {/* Карточка выбранного клиента (остаток + история) */}
            {selected ? (
              <div className={panel}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-2xl font-extrabold text-[#1f2933]">{selected.name}</div>
                    {selectedPhone && (
                      <div className="text-xs text-[#9ca3af]">{selectedPhone}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-[#6b7280]">Остаток (за всё время)</div>
                    <div
                      className={
                        "text-2xl font-extrabold tabular-nums " +
                        (clientOstatok > 0
                          ? "text-[#c81e1e]"
                          : clientOstatok < 0
                            ? "text-[#047857]"
                            : "text-[#374151]")
                      }
                    >
                      {fmt(clientOstatok)}
                    </div>
                  </div>
                </div>

                {/* Фильтр периода истории */}
                <div className="mb-2 flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-[#9ca3af]">история с</span>
                    <input
                      type="date"
                      value={histFrom}
                      onChange={(e) => setHistFrom(e.target.value)}
                      className="rounded-lg bg-white border border-[#e5e7eb] px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-[#9ca3af]">по</span>
                    <input
                      type="date"
                      value={histTo}
                      onChange={(e) => setHistTo(e.target.value)}
                      className="rounded-lg bg-white border border-[#e5e7eb] px-2 py-1.5 text-xs"
                    />
                  </label>
                  {(histFrom || histTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistFrom("");
                        setHistTo("");
                      }}
                      className="pb-1.5 text-[11px] text-[#2f80ed] underline"
                    >
                      сбросить
                    </button>
                  )}
                </div>

                <div className="mt-1 overflow-x-auto rounded-lg border border-[#e5e7eb]">
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
                      {shownHistory.map((h) => {
                        const editing = editId === h.id;
                        return (
                          <tr
                            key={h.id}
                            onClick={() => !editing && startEdit(h)}
                            className={
                              "border-t border-[#e5e7eb] " +
                              (editing ? "bg-[#f8fafc]" : "cursor-pointer hover:bg-[#f9fafb]")
                            }
                          >
                            <td className="px-2 py-1.5 text-left align-top">
                              <div className="text-[#374151]">{h.date}</div>
                              {h.returnDate && (
                                <div
                                  className={
                                    "text-[10px] " +
                                    (h.returnDate < today ? "text-[#c81e1e]" : "text-[#9ca3af]")
                                  }
                                >
                                  возврат {h.returnDate}
                                </div>
                              )}
                            </td>
                            {editing ? (
                              <>
                                <td className="px-1 py-1.5">
                                  <input
                                    inputMode="decimal"
                                    value={editDebt}
                                    onChange={(e) => setEditDebt(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="0"
                                    className="w-16 rounded border border-[#e5e7eb] px-1.5 py-1 text-right tabular-nums"
                                  />
                                </td>
                                <td className="px-1 py-1.5">
                                  <input
                                    inputMode="decimal"
                                    value={editPay}
                                    onChange={(e) => setEditPay(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="0"
                                    className="w-16 rounded border border-[#e5e7eb] px-1.5 py-1 text-right tabular-nums"
                                  />
                                </td>
                                <td className="px-1 py-1.5">
                                  <input
                                    value={editComment}
                                    onChange={(e) => setEditComment(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="Комментарий"
                                    className="w-full min-w-[90px] rounded border border-[#e5e7eb] px-1.5 py-1"
                                  />
                                </td>
                                <td className="px-1 py-1.5 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      saveEdit();
                                    }}
                                    className="font-bold text-[#047857] hover:opacity-80"
                                    aria-label="Сохранить"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditId(null);
                                    }}
                                    className="ml-1.5 text-[#9ca3af] hover:text-[#c81e1e]"
                                    aria-label="Отмена"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-2 py-1.5 text-right">
                                  <AmtBadge v={num(h.debtAmount)} kind="debt" />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <AmtBadge v={num(h.paymentAmount)} kind="pay" />
                                </td>
                                <td className="px-2 py-1.5 text-left text-[#6b7280]">
                                  {h.prepayment && <PrepayBadge />}
                                  {h.comment}
                                  {h.author && (
                                    <span className="ml-1 text-[11px] text-[#9ca3af]">· {h.author}</span>
                                  )}
                                </td>
                                <td className="px-1 py-1.5 text-right">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(h);
                                    }}
                                    className="text-[#b0b6bf] hover:text-[#2f80ed]"
                                    aria-label="Изменить"
                                  >
                                    ✎
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                      {history !== null && shownHistory.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-3 text-center text-[#9ca3af]">
                            {history.length === 0 ? "Записей нет" : "Нет записей за период"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={panel}>
                <div className="mb-2 flex flex-wrap items-end gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    История дня
                  </div>
                  <label className="ml-auto block">
                    <span className="mb-1 block text-[10px] text-[#9ca3af]">дата</span>
                    <input
                      type="date"
                      value={dayDate}
                      onChange={(e) => changeDayDate(e.target.value)}
                      className="rounded-lg bg-white border border-[#e5e7eb] px-2 py-1.5 text-xs"
                    />
                  </label>
                  {dayHistory === null ? (
                    <button
                      type="button"
                      onClick={openDay}
                      className="rounded-lg bg-[#2f80ed] px-3 py-1.5 text-xs font-semibold text-white active:bg-[#2568c9]"
                    >
                      История дня
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={closeDay}
                      className="rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-xs font-semibold text-[#6b7280]"
                    >
                      Скрыть
                    </button>
                  )}
                </div>

                {dayHistory === null ? (
                  <p className="py-4 text-center text-sm text-[#9ca3af]">
                    Выберите клиента в форме выше или справа в таблице — либо нажмите
                    «История дня».
                  </p>
                ) : (
                  <div className="mt-1 overflow-x-auto rounded-lg border border-[#e5e7eb]">
                    <table className="w-full text-xs tabular-nums">
                      <thead className="bg-white text-[#6b7280]">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">Клиент</th>
                          <th className="px-2 py-1.5 text-right font-medium">Долг</th>
                          <th className="px-2 py-1.5 text-right font-medium">Оплата</th>
                          <th className="px-2 py-1.5 text-left font-medium">Комментарий</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayHistory.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() =>
                              r.clientId != null &&
                              selectClient({ id: r.clientId, name: r.clientName ?? "" })
                            }
                            className={
                              "border-t border-[#e5e7eb] " +
                              (r.clientId != null ? "cursor-pointer hover:bg-[#f9fafb]" : "")
                            }
                          >
                            <td className="px-2 py-1.5 text-left text-[#374151]">
                              {r.clientName ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <AmtBadge v={num(r.debtAmount)} kind="debt" />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <AmtBadge v={num(r.paymentAmount)} kind="pay" />
                            </td>
                            <td className="px-2 py-1.5 text-left text-[#6b7280]">
                              {r.prepayment && <PrepayBadge />}
                              {r.comment}
                              {r.author && (
                                <span className="ml-1 text-[11px] text-[#9ca3af]">· {r.author}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!dayLoading && dayHistory.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-2 py-3 text-center text-[#9ca3af]">
                              Записей за этот день нет
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {dayHistory.length > 0 && (
                        <tfoot className="border-t border-[#e5e7eb] bg-[#f9fafb] font-semibold">
                          <tr>
                            <td className="px-2 py-1.5 text-left text-[#6b7280]">
                              Итого · {dayHistory.length}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <AmtBadge v={dayTotals.debt} kind="debt" />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <AmtBadge v={dayTotals.pay} kind="pay" />
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            )}
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
              <div className="text-2xl font-extrabold tabular-nums text-[#c81e1e]">
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
                      <td className="px-3 py-2 text-right">
                        <AmtBadge v={b.debts} kind="debt" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <AmtBadge v={b.payments} kind="pay" />
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold " +
                          (b.ostatok > 0
                            ? "text-[#c81e1e]"
                            : b.ostatok < 0
                              ? "text-[#047857]"
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

      {/* Модалка предоплаты (остаток уходит в минус) */}
      {prepayOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPrepayOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-bold text-[#1f2933]">Остаток уходит в минус</div>
            <p className="mt-2 text-sm text-[#6b7280]">
              После этой оплаты остаток «{selected?.name}» станет{" "}
              <span className="font-semibold text-[#2f80ed]">
                {fmt(prepayInfo?.newOstatok ?? 0)}
              </span>
              . Это предоплата (клиент заплатил вперёд)?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPrepayOpen(false);
                  save(true);
                }}
                className="flex-1 rounded-lg bg-[#2f80ed] py-2.5 text-sm font-semibold text-white active:bg-[#2568c9]"
              >
                Да, предоплата
              </button>
              <button
                type="button"
                onClick={() => setPrepayOpen(false)}
                className="flex-1 rounded-lg border border-[#e5e7eb] bg-white py-2.5 text-sm font-semibold text-[#6b7280]"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
