"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DirRow = {
  id: number;
  name: string;
  phone: string;
  comment: string;
  archived: boolean;
  opsCount: number;
};

const TABS = [
  { k: "clients", label: "Клиенты", endpoint: "/api/settings/clients", nameLabel: "Клиент" },
  { k: "employees", label: "Работники", endpoint: "/api/settings/employees", nameLabel: "Работник" },
  { k: "suppliers", label: "Фирмы (поставщики)", endpoint: "/api/settings/suppliers", nameLabel: "Поставщик" },
];

const input = "w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm";

export default function SettingsPage() {
  const [tab, setTab] = useState(TABS[0].k);
  const active = TABS.find((t) => t.k === tab)!;

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">⚙️ Настройки</h1>
        </header>

        <div className="mb-4 flex gap-2">
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

        <DirectoryTab key={active.k} endpoint={active.endpoint} nameLabel={active.nameLabel} />
      </div>
    </main>
  );
}

function DirectoryTab({ endpoint, nameLabel }: { endpoint: string; nameLabel: string }) {
  const [items, setItems] = useState<DirRow[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState("");

  // редактирование
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editComment, setEditComment] = useState("");

  // добавление
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

  function startEdit(row: DirRow) {
    setEditId(row.id);
    setEditName(row.name);
    setEditPhone(row.phone);
    setEditComment(row.comment);
  }

  async function saveEdit() {
    if (editId == null) return;
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, name: editName.trim(), phone: editPhone, comment: editComment }),
    });
    if (res.status === 409) {
      setStatus("Имя уже занято");
      return;
    }
    if (!res.ok) {
      setStatus("Ошибка сохранения");
      return;
    }
    setEditId(null);
    setStatus("Сохранено ✓");
    await load();
  }

  async function toggleArchive(row: DirRow) {
    await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, archived: !row.archived }),
    });
    await load();
  }

  async function addNew() {
    if (!newName.trim()) return;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), phone: newPhone, comment: newComment }),
    });
    if (res.status === 409) {
      setStatus("Имя уже занято");
      return;
    }
    if (!res.ok) {
      setStatus("Ошибка");
      return;
    }
    setAdding(false);
    setNewName("");
    setNewPhone("");
    setNewComment("");
    setStatus("Добавлено ✓");
    await load();
  }

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          className={input + " max-w-xs flex-1"}
        />
        <label className="flex items-center gap-1.5 text-xs text-[#6b7280]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          показать архивные
        </label>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto rounded-lg bg-[#f2994a] px-3 py-2 text-sm font-semibold text-white"
        >
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
              <th className="px-3 py-2 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={"border-t border-[#e5e7eb] " + (row.archived ? "opacity-50" : "")}
              >
                {editId === row.id ? (
                  <>
                    <td className="px-2 py-1.5">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={editComment} onChange={(e) => setEditComment(e.target.value)} className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1 text-sm" />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#9ca3af]">{row.opsCount}</td>
                    <td className="px-3 py-1.5 text-right">
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
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(row)} className="mr-3 text-[#6b7280] hover:text-[#1f2933]">
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleArchive(row)}
                        className="text-[#6b7280] hover:text-[#1f2933]"
                        title={row.archived ? "Восстановить" : "Архивировать"}
                      >
                        {row.archived ? "♻" : "🗄"}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-[#9ca3af]">
                  Пусто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
