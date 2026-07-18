"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DirRow = {
  id: number;
  name: string;
  phone: string;
  comment: string;
  archived: boolean;
  hidden: boolean;
  opsCount: number;
};

type TabDef =
  | { k: string; label: string; kind: "dir"; endpoint: string; nameLabel: string; withHidden?: boolean }
  | { k: string; label: string; kind: "accounts" }
  | { k: string; label: string; kind: "shift" }
  | { k: string; label: string; kind: "security" };

const TABS: TabDef[] = [
  { k: "clients", label: "Клиенты", kind: "dir", endpoint: "/api/settings/clients", nameLabel: "Клиент" },
  { k: "employees", label: "Работники", kind: "dir", endpoint: "/api/settings/employees", nameLabel: "Работник", withHidden: true },
  { k: "suppliers", label: "Фирмы", kind: "dir", endpoint: "/api/settings/suppliers", nameLabel: "Поставщик" },
  { k: "accounts", label: "Счета", kind: "accounts" },
  { k: "shift", label: "Смена", kind: "shift" },
  { k: "security", label: "Безопасность", kind: "security" },
];

const input = "w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm";
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const card = "rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4";

export default function SettingsPage() {
  const [tab, setTab] = useState(TABS[0].k);
  const active = TABS.find((t) => t.k === tab)!;

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">⚙️ Настройки</h1>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={
                "rounded-lg border px-4 py-2 text-sm font-semibold " +
                (tab === t.k
                  ? "border-[#2f80ed] bg-[#eaf1fd] text-[#2f80ed]"
                  : "border-[#e5e7eb] bg-white text-[#6b7280]")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {active.kind === "dir" && (
          <DirectoryTab
            key={active.k}
            endpoint={active.endpoint}
            nameLabel={active.nameLabel}
            withHidden={!!active.withHidden}
          />
        )}
        {active.kind === "accounts" && <AccountsTab />}
        {active.kind === "shift" && <ShiftTab />}
        {active.kind === "security" && <SecurityTab />}
      </div>
    </main>
  );
}

function DirectoryTab({
  endpoint,
  nameLabel,
  withHidden,
}: {
  endpoint: string;
  nameLabel: string;
  withHidden: boolean;
}) {
  const [items, setItems] = useState<DirRow[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editComment, setEditComment] = useState("");

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newComment, setNewComment] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`${endpoint}?archived=${showArchived ? 1 : 0}`);
    const d = await res.json();
    setItems(d.items ?? []);
  }, [endpoint, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.phone ?? "").toLowerCase().includes(q) ||
        (i.comment ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 409) setStatus("Имя уже занято");
    await load();
  }

  async function saveEdit() {
    if (editId == null) return;
    await patch({ id: editId, name: editName.trim(), phone: editPhone, comment: editComment });
    setEditId(null);
    setStatus("Сохранено ✓");
  }

  async function addNew() {
    if (!newName.trim()) return;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), phone: newPhone, comment: newComment }),
    });
    if (res.status === 409) return setStatus("Имя уже занято");
    if (!res.ok) return setStatus("Ошибка");
    setAdding(false);
    setNewName("");
    setNewPhone("");
    setNewComment("");
    setStatus("Добавлено ✓");
    await load();
  }

  const cols = withHidden ? 6 : 5;

  return (
    <div className={card}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск…" className={input + " max-w-xs flex-1"} />
        <label className="flex items-center gap-1.5 text-xs text-[#6b7280]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          показать архивные
        </label>
        <button type="button" onClick={() => setAdding((v) => !v)} className="ml-auto rounded-lg bg-[#f2994a] px-3 py-2 text-sm font-semibold text-white">
          + Добавить
        </button>
      </div>

      {adding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-[#e5e7eb] bg-white p-3">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Имя (${nameLabel})`} className={input + " min-w-[160px] flex-1"} />
          <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Телефон" className={input + " w-40"} />
          <input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Комментарий" className={input + " min-w-[140px] flex-1"} />
          <button type="button" onClick={addNew} className="rounded-lg bg-[#f2994a] px-4 py-2 text-sm font-semibold text-white">
            Сохранить
          </button>
        </div>
      )}

      {status && <p className="mb-2 text-xs text-[#6b7280]">{status}</p>}

      <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
        <table className="w-full text-sm">
          <thead className="bg-white text-[#6b7280]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Имя</th>
              <th className="px-3 py-2 text-left font-medium">Телефон</th>
              <th className="px-3 py-2 text-left font-medium">Комментарий</th>
              <th className="px-3 py-2 text-right font-medium">Операций</th>
              {withHidden && <th className="px-3 py-2 text-center font-medium">ЗП</th>}
              <th className="px-3 py-2 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className={"border-t border-[#e5e7eb] " + (row.archived ? "opacity-50" : "")}>
                {editId === row.id ? (
                  <>
                    <td className="px-2 py-1.5"><input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5"><input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" /></td>
                    <td className="px-2 py-1.5"><input value={editComment} onChange={(e) => setEditComment(e.target.value)} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" /></td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#9ca3af]">{row.opsCount}</td>
                    {withHidden && <td />}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button type="button" onClick={saveEdit} className="mr-2 text-[#27ae60]">✓</button>
                      <button type="button" onClick={() => setEditId(null)} className="text-[#9ca3af]">✕</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-left">
                      {row.name}
                      {row.archived && <span className="ml-1 text-[10px] text-[#9ca3af]">(архив)</span>}
                    </td>
                    <td className="px-3 py-2 text-left text-[#6b7280]">{row.phone}</td>
                    <td className="px-3 py-2 text-left text-[#6b7280]">{row.comment}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#9ca3af]">{row.opsCount}</td>
                    {withHidden && (
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => patch({ id: row.id, hidden: !row.hidden })}
                          title={row.hidden ? "ЗП скрыта — показать" : "Скрыть ЗП"}
                          className="text-base"
                        >
                          {row.hidden ? "🙈" : "👁"}
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => { setEditId(row.id); setEditName(row.name); setEditPhone(row.phone); setEditComment(row.comment); }} className="mr-3 text-[#6b7280] hover:text-[#1f2933]">✎</button>
                      <button type="button" onClick={() => patch({ id: row.id, archived: !row.archived })} className="text-[#6b7280] hover:text-[#1f2933]" title={row.archived ? "Восстановить" : "Архивировать"}>
                        {row.archived ? "♻" : "🗄"}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={cols} className="px-3 py-4 text-center text-[#9ca3af]">Пусто</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Category = { id: number; code: string; name: string; icon: string | null; color: string | null };
type Account = {
  id: number;
  name: string;
  categoryId: number | null;
  icon: string | null;
  balance: number;
  archived: boolean;
};

function AccountsTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [eName, setEName] = useState("");
  const [eIcon, setEIcon] = useState("");
  const [eCat, setECat] = useState<number | "">("");

  const [nName, setNName] = useState("");
  const [nIcon, setNIcon] = useState("");
  const [nCat, setNCat] = useState<number | "">("");
  const [nInit, setNInit] = useState("");

  const [newCatName, setNewCatName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/finance/accounts");
    const d = await res.json();
    setCategories(d.categories ?? []);
    setAccounts(d.accounts ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? "—";

  async function patchAccount(body: Record<string, unknown>) {
    await fetch("/api/finance/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function saveEdit() {
    if (editId == null) return;
    await patchAccount({ id: editId, name: eName.trim(), icon: eIcon, categoryId: eCat === "" ? null : eCat });
    setEditId(null);
    setStatus("Сохранено ✓");
  }

  async function addAccount() {
    if (!nName.trim()) return;
    const res = await fetch("/api/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nName.trim(), icon: nIcon, categoryId: nCat === "" ? null : nCat, initialBalance: nInit || "0" }),
    });
    if (res.status === 409) return setStatus("Счёт уже существует");
    setNName("");
    setNIcon("");
    setNInit("");
    setStatus("Счёт добавлен ✓");
    await load();
  }

  async function addCategory() {
    if (!newCatName.trim()) return;
    await fetch("/api/finance/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    setNewCatName("");
    await load();
  }

  async function patchCategory(id: number, body: Record<string, unknown>) {
    await fetch("/api/finance/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      {/* Счета */}
      <div className={card}>
        <div className="mb-3 text-sm font-semibold text-[#1f2933]">Счета</div>
        {status && <p className="mb-2 text-xs text-[#6b7280]">{status}</p>}
        <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
          <table className="w-full text-sm">
            <thead className="bg-white text-[#6b7280]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Название</th>
                <th className="px-3 py-2 text-left font-medium">Категория</th>
                <th className="px-3 py-2 text-center font-medium">Иконка</th>
                <th className="px-3 py-2 text-right font-medium">Баланс</th>
                <th className="px-3 py-2 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className={"border-t border-[#e5e7eb] " + (a.archived ? "opacity-50" : "")}>
                  {editId === a.id ? (
                    <>
                      <td className="px-2 py-1.5"><input value={eName} onChange={(e) => setEName(e.target.value)} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" /></td>
                      <td className="px-2 py-1.5">
                        <select value={eCat} onChange={(e) => setECat(Number(e.target.value))} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm">
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input value={eIcon} onChange={(e) => setEIcon(e.target.value)} maxLength={4} className="w-14 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-center text-sm" /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(a.balance)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <button type="button" onClick={saveEdit} className="mr-2 text-[#27ae60]">✓</button>
                        <button type="button" onClick={() => setEditId(null)} className="text-[#9ca3af]">✕</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-left">{a.name}{a.archived && <span className="ml-1 text-[10px] text-[#9ca3af]">(архив)</span>}</td>
                      <td className="px-3 py-2 text-left text-[#6b7280]">{catName(a.categoryId)}</td>
                      <td className="px-3 py-2 text-center text-lg">{a.icon}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(a.balance)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => { setEditId(a.id); setEName(a.name); setEIcon(a.icon ?? ""); setECat(a.categoryId ?? ""); }} className="mr-3 text-[#6b7280] hover:text-[#1f2933]">✎</button>
                        <button type="button" onClick={() => patchAccount({ id: a.id, archived: !a.archived })} className="text-[#6b7280] hover:text-[#1f2933]" title={a.archived ? "Восстановить" : "Архивировать"}>{a.archived ? "♻" : "🗄"}</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-[#9ca3af]">Нет счетов</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Добавить счёт */}
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[#e5e7eb] p-3">
          <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Название" className={input + " min-w-[140px] flex-1"} />
          <select value={nCat} onChange={(e) => setNCat(Number(e.target.value))} className={input + " w-40"}>
            <option value="">— категория —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <input value={nIcon} onChange={(e) => setNIcon(e.target.value)} placeholder="🍊" maxLength={4} className={input + " w-16 text-center"} />
          <input value={nInit} onChange={(e) => setNInit(e.target.value)} inputMode="decimal" placeholder="нач. баланс" className={input + " w-32 text-right tabular-nums"} />
          <button type="button" onClick={addAccount} className="rounded-lg bg-[#f2994a] px-4 py-2 text-sm font-semibold text-white">+ Добавить счёт</button>
        </div>
      </div>

      {/* Категории */}
      <div className={card}>
        <div className="mb-3 text-sm font-semibold text-[#1f2933]">Категории</div>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input defaultValue={c.icon ?? ""} onBlur={(e) => e.target.value !== (c.icon ?? "") && patchCategory(c.id, { icon: e.target.value })} maxLength={4} className="w-12 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-center text-sm" />
              <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && patchCategory(c.id, { name: e.target.value.trim() })} className="flex-1 rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" />
              <input type="color" defaultValue={c.color ?? "#64748b"} onBlur={(e) => e.target.value !== c.color && patchCategory(c.id, { color: e.target.value })} className="h-8 w-10 rounded border border-[#e5e7eb]" />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Новая категория" className={input + " flex-1"} />
          <button type="button" onClick={addCategory} className="rounded-lg bg-[#f2994a] px-4 py-2 text-sm font-semibold text-white">+ Категория</button>
        </div>
      </div>
    </div>
  );
}

function ShiftTab() {
  const [hour, setHour] = useState(21);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/shift");
    const d = await res.json();
    setHour(d.hour ?? 21);
    setEnabled(d.enabled ?? true);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(body: { hour?: number; enabled?: boolean }) {
    const res = await fetch("/api/settings/shift", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setHour(d.hour);
    setEnabled(d.enabled);
    setStatus("Сохранено ✓");
  }

  return (
    <div className={card + " max-w-md space-y-4"}>
      <div className="text-sm font-semibold text-[#1f2933]">Автозакрытие смены</div>
      <p className="text-xs text-[#6b7280]">
        Смена автоматически закрывается в указанный час по времени Алматы (UTC+5). Cron проверяет каждый час.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        Автозакрытие включено
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-[#6b7280]">Время автозакрытия (час, Алматы)</span>
        <div className="flex items-center gap-2">
          <select value={hour} onChange={(e) => save({ hour: Number(e.target.value) })} disabled={!enabled} className={input + " w-32 disabled:opacity-50"}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </div>
      </label>

      {status && <p className="text-xs text-[#27ae60]">{status}</p>}
    </div>
  );
}

function SecurityTab() {
  const [password, setPassword] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/security");
    const d = await res.json();
    setPassword(d.editPassword ?? "");
    setLoaded(true);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    const value = password.trim();
    if (!value) return setStatus("Пароль не может быть пустым");
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editPassword: value }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setPassword(d.editPassword ?? value);
      setStatus("Сохранено ✓");
    } catch {
      setStatus("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={card + " max-w-md space-y-4"}>
      <div className="text-sm font-semibold text-[#1f2933]">Пароль изменения записей</div>
      <p className="text-xs text-[#6b7280]">
        Этот пароль запрашивается при изменении сумм в журналах (Долги, КОНС, Зарплата,
        Финансы). Удаление записей отключено — только правка с паролем.
      </p>

      <label className="block">
        <span className="mb-1 block text-xs text-[#6b7280]">Пароль</span>
        <input
          value={loaded ? password : ""}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={loaded ? "" : "загрузка…"}
          inputMode="text"
          autoComplete="off"
          className={input}
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={saving || !loaded}
        className="rounded-lg bg-[#2f80ed] px-5 py-2 text-sm font-bold text-white disabled:opacity-50 active:bg-[#2568c9]"
      >
        {saving ? "…" : "Сохранить"}
      </button>

      {status && <p className="text-xs text-[#27ae60]">{status}</p>}
    </div>
  );
}
