"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";

// ── типы ──
type Category = { id: number; code: string; name: string; icon: string | null; color: string | null };
type Account = {
  id: number;
  name: string;
  categoryId: number | null;
  icon: string | null;
  initialBalance: number;
  archived: boolean;
  balance: number;
};
type Op = {
  id: number;
  date: string;
  name: string | null;
  accountId: number;
  accountName: string | null;
  type: string;
  amount: number;
  comment: string | null;
  toAccountId: number | null;
  toAccountName: string | null;
};
type Fav = {
  id: number;
  name: string | null;
  accountId: number | null;
  accountName: string | null;
  type: string | null;
  amount: number;
};

const SUGGESTED_NAMES = [
  "Кулжанов",
  "Тойбай",
  "Абдуллаева",
  "Поверка САМИ",
  "Аренда склада",
  "Зарплата",
  "ГСМ",
  "ТОО Метрология",
  "Перевод",
];

const TABS = [
  { k: "op", label: "Операция", icon: "💸" },
  { k: "trf", label: "Перевод", icon: "🔄" },
  { k: "fav", label: "Избранные", icon: "⭐" },
  { k: "hist", label: "История", icon: "📋" },
  { k: "acc", label: "Счета", icon: "🏦" },
  { k: "rep", label: "Отчёт", icon: "📊" },
];

// ── утилиты ──
const fmt = (v: number) =>
  v.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₸";
const fmtNum = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const monthStart = () => todayStr().slice(0, 7) + "-01";

function evalAmount(s: string): number | null {
  const t = s.replace(/,/g, ".").replace(/\s+/g, "").replace(/[хx×]/gi, "*");
  if (!t) return null;
  if (!/^[\d+\-*/().]+$/.test(t)) return null;
  try {
    // безопасно: строка уже отфильтрована до цифр и операторов
    const r = Function(`"use strict";return(${t})`)();
    return Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
  } catch {
    return null;
  }
}

const input =
  "w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-3 text-base";

export default function FinancePage() {
  const [tab, setTab] = useState("op");
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [ops, setOps] = useState<Op[]>([]);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [toast, setToast] = useState("");

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts]
  );

  function flash(msg: string) {
    setToast(msg);
    window.clearTimeout((flash as unknown as { _t?: number })._t);
    (flash as unknown as { _t?: number })._t = window.setTimeout(
      () => setToast(""),
      2500
    );
  }

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/finance/accounts");
    const d = await res.json();
    setCategories(d.categories ?? []);
    setAccounts(d.accounts ?? []);
    setTotal(d.total ?? 0);
  }, []);

  const loadOps = useCallback(async (from = "", to = "", accountId = "") => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (accountId) qs.set("accountId", accountId);
    const res = await fetch(`/api/finance/ops?${qs.toString()}`);
    const d = await res.json();
    setOps(d.ops ?? []);
  }, []);

  const loadFavs = useCallback(async () => {
    const res = await fetch("/api/finance/favs");
    const d = await res.json();
    setFavs(d.favs ?? []);
  }, []);

  // Формы каждой вкладки живут в локальном состоянии дочерних компонентов, поэтому
  // фон обновляет только просмотр: балансы счетов (чипы) и избранное. Список операций
  // истории не трогаем при фоне — им управляют фильтры пользователя.
  const load = useCallback(
    async ({ background }: { background: boolean }) => {
      if (background) {
        await Promise.all([loadAccounts(), loadFavs()]);
      } else {
        await Promise.all([loadAccounts(), loadOps(), loadFavs()]);
      }
    },
    [loadAccounts, loadOps, loadFavs]
  );

  const { refreshing, lastUpdated } = useLiveData("finance", load, []);

  const balanceById = useMemo(() => {
    const m = new Map<number, number>();
    accounts.forEach((a) => m.set(a.id, a.balance));
    return m;
  }, [accounts]);

  // чипы по категориям
  const chips = useMemo(() => {
    const groups = new Map<number | "none", { cat: Category | null; sum: number; accts: Account[] }>();
    for (const a of activeAccounts) {
      const key = a.categoryId ?? "none";
      if (!groups.has(key)) {
        const cat = categories.find((c) => c.id === a.categoryId) ?? null;
        groups.set(key, { cat, sum: 0, accts: [] });
      }
      const g = groups.get(key)!;
      g.sum += a.balance;
      g.accts.push(a);
    }
    return Array.from(groups.values());
  }, [activeAccounts, categories]);

  const nameSuggestions = useMemo(() => {
    const set = new Set(SUGGESTED_NAMES);
    ops.forEach((o) => o.name && set.add(o.name));
    return Array.from(set);
  }, [ops]);

  async function reloadAll() {
    await Promise.all([loadAccounts(), loadOps(), loadFavs()]);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 pb-10">
      {/* Шапка */}
      <div className="sticky top-0 z-20 bg-gradient-to-br from-blue-700 to-sky-600 px-4 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg bg-white/20 px-2 py-1 text-sm text-white"
            >
              ←
            </Link>
            <div>
              <div className="text-sm font-extrabold tracking-wide text-white">
                U-PAY · Финансы
              </div>
              <div className="text-[10px] text-white/70">учёт счетов и операций</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-white/70">
              Общий баланс
            </div>
            <div className="text-xl font-extrabold text-white tabular-nums">
              {fmt(total)}
            </div>
            <LiveIndicator
              lastUpdated={lastUpdated}
              refreshing={refreshing}
              className="text-white/60"
            />
          </div>
        </div>

        {/* Чипы по категориям */}
        <div className="flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none]">
          {chips.map((g, i) => (
            <div
              key={i}
              className="min-w-[120px] shrink-0 rounded-xl border border-white/20 bg-white/15 px-3 py-2"
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">
                {g.cat?.icon ?? "📦"} {g.cat?.name ?? "Без категории"}
              </div>
              {g.accts.map((a) => (
                <div key={a.id} className="mt-1">
                  <div className="text-[11px] text-white/80 truncate">{a.name}</div>
                  <div className="text-sm font-extrabold text-white tabular-nums">
                    {fmtNum(a.balance)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Табы */}
        <div className="flex border-t border-white/10 bg-black/10">
          {TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={
                "flex-1 py-2 text-center text-[9px] font-bold uppercase tracking-wide border-b-2 " +
                (tab === t.k
                  ? "text-white border-white"
                  : "text-white/60 border-transparent")
              }
            >
              <span className="mb-0.5 block text-lg">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 pt-4">
        {tab === "op" && (
          <OpTab
            accounts={activeAccounts}
            names={nameSuggestions}
            balanceById={balanceById}
            ops={ops}
            onSaved={reloadAll}
            flash={flash}
          />
        )}
        {tab === "trf" && (
          <TrfTab
            accounts={activeAccounts}
            balanceById={balanceById}
            onSaved={reloadAll}
            flash={flash}
          />
        )}
        {tab === "fav" && (
          <FavTab
            accounts={activeAccounts}
            favs={favs}
            onSaved={reloadAll}
            flash={flash}
          />
        )}
        {tab === "hist" && <HistTab accounts={accounts} loadOps={loadOps} ops={ops} onChanged={reloadAll} flash={flash} />}
        {tab === "acc" && (
          <AccTab
            accounts={accounts}
            categories={categories}
            onChanged={loadAccounts}
            flash={flash}
          />
        )}
        {tab === "rep" && <RepTab accounts={accounts} />}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

// ── поле суммы с поддержкой выражений ──
function AmountInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const evaled = /[+\-*/]/.test(value.slice(1)) || /[+*/]/.test(value)
    ? evalAmount(value)
    : null;
  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "0 (можно 5000+3200)"}
        className={input + " text-xl font-bold tabular-nums"}
      />
      {evaled !== null && (
        <div className="mt-1 rounded-lg bg-emerald-950/50 px-3 py-1 text-sm font-semibold text-emerald-400">
          = {fmt(evaled)}
        </div>
      )}
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
    {children}
  </div>
);

// ── ОПЕРАЦИЯ ──
function OpTab({
  accounts,
  names,
  balanceById,
  ops,
  onSaved,
  flash,
}: {
  accounts: Account[];
  names: string[];
  balanceById: Map<number, number>;
  ops: Op[];
  onSaved: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const [type, setType] = useState<"Приход" | "Расход">("Приход");
  const [date, setDate] = useState(todayStr());
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accountId === "" && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  async function save() {
    const amt = evalAmount(amount);
    if (!name.trim()) return flash("⚠️ Укажите наименование");
    if (accountId === "") return flash("⚠️ Выберите счёт");
    if (!amt || amt <= 0) return flash("⚠️ Введите корректную сумму");
    if (type === "Расход") {
      const bal = balanceById.get(accountId) ?? 0;
      if (amt > bal && !window.confirm(`Недостаточно средств (баланс ${fmt(bal)}). Всё равно провести?`))
        return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, name: name.trim(), accountId, type, amount: amt, comment }),
      });
      if (!res.ok) throw new Error();
      setAmount("");
      setComment("");
      flash(`✅ ${type}: ${fmt(amt)}`);
      await onSaved();
    } catch {
      flash("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 flex gap-1 rounded-xl bg-neutral-800 p-1">
          {(["Приход", "Расход"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={
                "flex-1 rounded-lg py-2 text-sm font-bold " +
                (type === t
                  ? t === "Приход"
                    ? "bg-neutral-950 text-emerald-400"
                    : "bg-neutral-950 text-red-400"
                  : "text-neutral-400")
              }
            >
              {t === "Приход" ? "＋ Приход" : "－ Расход"}
            </button>
          ))}
        </div>

        <Label>Дата</Label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />

        <Label>Наименование</Label>
        <input
          list="op-names"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название операции"
          className={input}
        />
        <datalist id="op-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <Label>Счёт</Label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(Number(e.target.value))}
          className={input}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>

        <Label>Сумма (₸)</Label>
        <AmountInput value={amount} onChange={setAmount} />

        <Label>Комментарий</Label>
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" className={input} />

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={
            "mt-4 w-full rounded-xl py-3.5 text-base font-extrabold text-white disabled:opacity-50 " +
            (type === "Приход" ? "bg-emerald-600 active:bg-emerald-700" : "bg-red-600 active:bg-red-700")
          }
        >
          {saving ? "Сохранение…" : "💾 Сохранить операцию"}
        </button>
      </div>

      <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
        Последние операции
      </div>
      <div className="space-y-2">
        {ops.slice(0, 6).map((o) => (
          <OpRow key={o.id} op={o} />
        ))}
        {ops.length === 0 && <p className="text-sm text-neutral-500">Нет операций</p>}
      </div>
    </>
  );
}

function OpRow({ op, onDelete }: { op: Op; onDelete?: (id: number) => void }) {
  const isTrf = op.type === "Перевод";
  const color = isTrf ? "text-sky-400" : op.type === "Приход" ? "text-emerald-400" : "text-red-400";
  const sign = isTrf ? "" : op.type === "Приход" ? "+" : "−";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {isTrf ? `${op.accountName} → ${op.toAccountName}` : op.name || "—"}
        </div>
        <div className="text-[11px] text-neutral-500">
          {op.date} · {isTrf ? "Перевод" : op.accountName}
          {op.comment ? ` · ${op.comment}` : ""}
        </div>
      </div>
      <div className={"shrink-0 text-sm font-bold tabular-nums " + color}>
        {sign}
        {fmtNum(op.amount)}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(op.id)}
          className="shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1 text-red-400"
          aria-label="Удалить"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── ПЕРЕВОД ──
function TrfTab({
  accounts,
  balanceById,
  onSaved,
  flash,
}: {
  accounts: Account[];
  balanceById: Map<number, number>;
  onSaved: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [from, setFrom] = useState<number | "">("");
  const [to, setTo] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (from === "" && accounts[0]) setFrom(accounts[0].id);
    if (to === "" && accounts[1]) setTo(accounts[1].id);
  }, [accounts, from, to]);

  async function save() {
    const amt = evalAmount(amount);
    if (from === "" || to === "") return flash("⚠️ Выберите счета");
    if (from === to) return flash("⚠️ Счета должны отличаться");
    if (!amt || amt <= 0) return flash("⚠️ Введите сумму");
    const bal = balanceById.get(from) ?? 0;
    if (amt > bal && !window.confirm(`Недостаточно средств (баланс ${fmt(bal)}). Всё равно перевести?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          name: "Перевод",
          accountId: from,
          toAccountId: to,
          type: "Перевод",
          amount: amt,
          comment,
        }),
      });
      if (!res.ok) throw new Error();
      setAmount("");
      setComment("");
      flash(`🔄 Перевод ${fmt(amt)}`);
      await onSaved();
    } catch {
      flash("Ошибка перевода");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <Label>Дата</Label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      <Label>Со счёта</Label>
      <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className={input}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.icon} {a.name} · {fmtNum(a.balance)}
          </option>
        ))}
      </select>
      <div className="py-2 text-center text-xl text-neutral-500">⇅</div>
      <Label>На счёт</Label>
      <select value={to} onChange={(e) => setTo(Number(e.target.value))} className={input}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.icon} {a.name} · {fmtNum(a.balance)}
          </option>
        ))}
      </select>
      <Label>Сумма (₸)</Label>
      <AmountInput value={amount} onChange={setAmount} />
      <Label>Комментарий</Label>
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" className={input} />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-blue-600 py-3.5 text-base font-extrabold text-white disabled:opacity-50 active:bg-blue-700"
      >
        {saving ? "…" : "🔄 Выполнить перевод"}
      </button>
    </div>
  );
}

// ── ИЗБРАННЫЕ ──
function FavTab({
  accounts,
  favs,
  onSaved,
  flash,
}: {
  accounts: Account[];
  favs: Fav[];
  onSaved: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [type, setType] = useState<"Приход" | "Расход">("Расход");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (accountId === "" && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  async function addFav() {
    const amt = evalAmount(amount) ?? 0;
    if (!name.trim()) return flash("⚠️ Укажите название");
    if (accountId === "") return flash("⚠️ Выберите счёт");
    const res = await fetch("/api/finance/favs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), accountId, type, amount: amt }),
    });
    if (!res.ok) return flash("Ошибка");
    setName("");
    setAmount("");
    flash("⭐ Добавлено");
    await onSaved();
  }

  async function delFav(id: number) {
    await fetch(`/api/finance/favs?id=${id}`, { method: "DELETE" });
    await onSaved();
  }

  async function runFav(f: Fav) {
    if (!f.accountId || !f.amount || f.amount <= 0) return flash("⚠️ У избранного нет счёта/суммы");
    const res = await fetch("/api/finance/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: todayStr(),
        name: f.name,
        accountId: f.accountId,
        type: f.type,
        amount: f.amount,
        comment: "Избранный платёж",
      }),
    });
    if (!res.ok) return flash("Ошибка проведения");
    flash(`✅ Проведено: ${f.name}`);
    await onSaved();
  }

  async function runAll() {
    const valid = favs.filter((f) => f.accountId && f.amount > 0);
    if (!valid.length) return flash("⚠️ Нет пригодных избранных");
    if (!window.confirm(`Провести все избранные (${valid.length}) на сегодня?`)) return;
    for (const f of valid) {
      await fetch("/api/finance/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayStr(),
          name: f.name,
          accountId: f.accountId,
          type: f.type,
          amount: f.amount,
          comment: "Избранный платёж",
        }),
      });
    }
    flash(`🚀 Проведено: ${valid.length}`);
    await onSaved();
  }

  return (
    <>
      <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
          Избранные операции
        </div>
        <div className="space-y-2">
          {favs.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{f.name}</div>
                <div className="text-[11px] text-neutral-500">
                  {f.accountName} ·{" "}
                  <span className={f.type === "Приход" ? "text-emerald-400" : "text-red-400"}>
                    {f.type}
                  </span>{" "}
                  · {fmtNum(f.amount)} ₸
                </div>
              </div>
              <button
                type="button"
                onClick={() => runFav(f)}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => delFav(f.id)}
                className="shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1 text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
          {favs.length === 0 && <p className="text-sm text-neutral-500">Нет избранных</p>}
        </div>
        {favs.length > 0 && (
          <button
            type="button"
            onClick={runAll}
            className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white active:bg-emerald-700"
          >
            ▶ Провести все на сегодня
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
          Добавить в избранное
        </div>
        <div className="mb-3 flex gap-1 rounded-xl bg-neutral-800 p-1">
          {(["Приход", "Расход"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={
                "flex-1 rounded-lg py-2 text-sm font-bold " +
                (type === t
                  ? t === "Приход"
                    ? "bg-neutral-950 text-emerald-400"
                    : "bg-neutral-950 text-red-400"
                  : "text-neutral-400")
              }
            >
              {t}
            </button>
          ))}
        </div>
        <Label>Наименование</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" className={input} />
        <Label>Счёт</Label>
        <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} className={input}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
        <Label>Сумма (₸)</Label>
        <AmountInput value={amount} onChange={setAmount} />
        <button
          type="button"
          onClick={addFav}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3.5 text-base font-extrabold text-white active:bg-blue-700"
        >
          ⭐ Добавить в избранное
        </button>
      </div>
    </>
  );
}

// ── ИСТОРИЯ ──
function HistTab({
  accounts,
  loadOps,
  ops,
  onChanged,
  flash,
}: {
  accounts: Account[];
  loadOps: (from?: string, to?: string, accountId?: string) => Promise<void>;
  ops: Op[];
  onChanged: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [acc, setAcc] = useState("");

  const apply = useCallback(() => loadOps(from, to, acc), [from, to, acc, loadOps]);
  useEffect(() => {
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function del(id: number) {
    if (!window.confirm("Удалить операцию?")) return;
    await fetch(`/api/finance/ops?id=${id}`, { method: "DELETE" });
    flash("Удалено");
    await onChanged();
    apply();
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
      </div>
      <div className="mb-3 flex gap-2">
        <select value={acc} onChange={(e) => setAcc(e.target.value)} className={input}>
          <option value="">Все счета</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={apply}
          className="shrink-0 rounded-xl bg-blue-600 px-4 font-bold text-white"
        >
          →
        </button>
      </div>
      <div className="mb-2 text-[11px] text-neutral-500">{ops.length} записей</div>
      <div className="space-y-2">
        {ops.map((o) => (
          <OpRow key={o.id} op={o} onDelete={del} />
        ))}
        {ops.length === 0 && <p className="py-4 text-center text-sm text-neutral-500">Нет операций</p>}
      </div>
    </div>
  );
}

// ── СЧЕТА ──
function AccTab({
  accounts,
  categories,
  onChanged,
  flash,
}: {
  accounts: Account[];
  categories: Category[];
  onChanged: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [icon, setIcon] = useState("");
  const [initial, setInitial] = useState("");

  useEffect(() => {
    if (categoryId === "" && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  async function changeCategory(id: number, catId: number) {
    await fetch("/api/finance/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, categoryId: catId }),
    });
    await onChanged();
  }

  async function toggleArchive(a: Account) {
    await fetch("/api/finance/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, archived: !a.archived }),
    });
    await onChanged();
  }

  async function addAccount() {
    if (!name.trim()) return flash("⚠️ Введите название");
    const res = await fetch("/api/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        categoryId: categoryId === "" ? null : categoryId,
        icon,
        initialBalance: String(evalAmount(initial) ?? 0),
      }),
    });
    if (res.status === 409) return flash("⚠️ Счёт уже существует");
    if (!res.ok) return flash("Ошибка");
    setName("");
    setIcon("");
    setInitial("");
    flash("✅ Счёт создан");
    await onChanged();
  }

  return (
    <>
      <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
          Мои счета
        </div>
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className={"rounded-xl border p-3 " + (a.archived ? "border-neutral-800 bg-neutral-950 opacity-60" : "border-neutral-800 bg-neutral-950")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{a.icon}</span>
                  <div>
                    <div className="text-sm font-bold">{a.name}</div>
                    <div className="text-[11px] text-neutral-500">
                      нач. {fmtNum(a.initialBalance)} ₸
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-extrabold tabular-nums">{fmtNum(a.balance)}</div>
                  <button
                    type="button"
                    onClick={() => toggleArchive(a)}
                    className="text-[11px] text-neutral-500 underline"
                  >
                    {a.archived ? "восстановить" : "в архив"}
                  </button>
                </div>
              </div>
              <select
                value={a.categoryId ?? ""}
                onChange={(e) => changeCategory(a.id, Number(e.target.value))}
                className="mt-2 w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
          Добавить счёт
        </div>
        <Label>Название</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Каспи Голд" className={input} />
        <Label>Категория</Label>
        <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} className={input}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <Label>Иконка</Label>
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🍊" maxLength={4} className={input} />
        <Label>Начальный баланс (₸)</Label>
        <AmountInput value={initial} onChange={setInitial} placeholder="0" />
        <button
          type="button"
          onClick={addAccount}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3.5 text-base font-extrabold text-white active:bg-blue-700"
        >
          ＋ Добавить счёт
        </button>
      </div>
    </>
  );
}

// ── ОТЧЁТ ──
function RepTab({ accounts }: { accounts: Account[] }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState<
    { account: Account; income: number; expense: number }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/finance/ops?${qs.toString()}`);
      const d = await res.json();
      const ops: Op[] = d.ops ?? [];
      const inc = new Map<number, number>();
      const exp = new Map<number, number>();
      for (const o of ops) {
        if (o.type === "Приход") inc.set(o.accountId, (inc.get(o.accountId) ?? 0) + o.amount);
        else if (o.type === "Расход") exp.set(o.accountId, (exp.get(o.accountId) ?? 0) + o.amount);
        else if (o.type === "Перевод") {
          exp.set(o.accountId, (exp.get(o.accountId) ?? 0) + o.amount);
          if (o.toAccountId != null)
            inc.set(o.toAccountId, (inc.get(o.toAccountId) ?? 0) + o.amount);
        }
      }
      setRows(
        accounts
          .filter((a) => !a.archived)
          .map((a) => ({
            account: a,
            income: inc.get(a.id) ?? 0,
            expense: exp.get(a.id) ?? 0,
          }))
      );
    } finally {
      setLoading(false);
    }
  }, [from, to, accounts]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = rows.reduce(
    (s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }),
    { income: 0, expense: 0 }
  );
  const totalBalance = accounts.filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
      </div>
      {loading && <p className="py-2 text-center text-sm text-neutral-500">Загрузка…</p>}
      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Счёт</th>
              <th className="px-2 py-2 text-right font-medium">Приход</th>
              <th className="px-2 py-2 text-right font-medium">Расход</th>
              <th className="px-3 py-2 text-right font-medium">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account.id} className="border-t border-neutral-800">
                <td className="px-3 py-2 text-left">
                  {r.account.icon} {r.account.name}
                </td>
                <td className="px-2 py-2 text-right text-emerald-400">+{fmtNum(r.income)}</td>
                <td className="px-2 py-2 text-right text-red-400">−{fmtNum(r.expense)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtNum(r.account.balance)}</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-700 bg-neutral-900 font-bold">
              <td className="px-3 py-2 text-left">Итого</td>
              <td className="px-2 py-2 text-right text-emerald-400">+{fmtNum(totals.income)}</td>
              <td className="px-2 py-2 text-right text-red-400">−{fmtNum(totals.expense)}</td>
              <td className="px-3 py-2 text-right">{fmtNum(totalBalance)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-extrabold text-white active:bg-blue-700"
      >
        📄 Печать / PDF
      </button>
    </div>
  );
}
