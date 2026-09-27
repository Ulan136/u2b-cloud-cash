"use client";

import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { notifyLive } from "@/lib/live/transport";
import { LiveIndicator } from "@/components/LiveIndicator";

type Entry = {
  id: number;
  date: string;
  cash: string;
  kaspi: string;
  halyk: string;
  comment: string | null;
};
type Totals = { cash: number; kaspi: number; halyk: number; total: number };

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

const input = "w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm";
const panel = "rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4";

export default function InkassaPage() {
  const today = useMemo(() => todayStr(), []);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<Totals>({ cash: 0, kaspi: 0, halyk: 0, total: 0 });

  // период (по умолчанию — текущий месяц)
  const initRange = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);
  const [preset, setPreset] = useState("month");

  // форма
  const [recordDate, setRecordDate] = useState(today);
  const [cash, setCash] = useState("");
  const [kaspi, setKaspi] = useState("");
  const [halyk, setHalyk] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // редактирование строки
  const [editId, setEditId] = useState<number | null>(null);
  const [editCash, setEditCash] = useState("");
  const [editKaspi, setEditKaspi] = useState("");
  const [editHalyk, setEditHalyk] = useState("");
  const [editComment, setEditComment] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/inkassa?from=${from}&to=${to}`);
    const d = await res.json();
    setEntries(d.entries ?? []);
    setTotals(d.totals ?? { cash: 0, kaspi: 0, halyk: 0, total: 0 });
  }, [from, to]);

  const { refreshing, lastUpdated } = useLiveData("inkassa", load, [from, to]);

  function applyPreset(name: string, range: { from: string; to: string }) {
    setPreset(name);
    setFrom(range.from);
    setTo(range.to);
  }

  async function save() {
    if (cash === "" && kaspi === "" && halyk === "") return setStatus("Укажите сумму");
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/inkassa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: recordDate, cash: cash || "0", kaspi: kaspi || "0", halyk: halyk || "0", comment }),
      });
      if (!res.ok) throw new Error();
      setCash("");
      setKaspi("");
      setHalyk("");
      setComment("");
      setStatus("Внесено ✓");
      notifyLive();
      await load();
    } catch {
      setStatus("Ошибка");
    } finally {
      setSaving(false);
    }
  }

  function onEnterSave(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && !saving) {
      e.preventDefault();
      save();
    }
  }

  function startEdit(row: Entry) {
    setEditId(row.id);
    setEditCash(num(row.cash) ? String(num(row.cash)) : "");
    setEditKaspi(num(row.kaspi) ? String(num(row.kaspi)) : "");
    setEditHalyk(num(row.halyk) ? String(num(row.halyk)) : "");
    setEditComment(row.comment ?? "");
  }

  async function saveEdit() {
    if (editId == null) return;
    const password = window.prompt("Пароль для изменения записи:");
    if (password === null) return;
    const res = await fetch("/api/inkassa", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        cash: editCash || "0",
        kaspi: editKaspi || "0",
        halyk: editHalyk || "0",
        comment: editComment,
        password,
      }),
    });
    if (res.status === 403) return setStatus("Неверный пароль — изменение не применено");
    if (!res.ok) return setStatus("Ошибка изменения");
    setEditId(null);
    setStatus("Изменено ✓");
    notifyLive();
    await load();
  }

  async function deleteEntry(id: number) {
    const password = window.prompt("Пароль для удаления записи:");
    if (password === null) return;
    const res = await fetch(`/api/inkassa?id=${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.status === 403) return setStatus("Неверный пароль — удаление отменено");
    if (!res.ok) return setStatus("Ошибка удаления");
    setEditId(null);
    setStatus("Удалено ✓");
    notifyLive();
    await load();
  }

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-3 flex items-center gap-2">
          <h1 className="text-2xl font-bold">🚚 Жаке инк</h1>
          <span className="ml-auto flex items-center gap-2 text-xs text-[#9ca3af]">
            {status && <span>{status}</span>}
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        {/* Итоги за период */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Наличка", totals.cash, "#3b6ea5"],
            ["Каспи", totals.kaspi, "#a55b5b"],
            ["Халык", totals.halyk, "#4e8a5f"],
            ["Всего", totals.total, "#2f80ed"],
          ].map(([label, val, color]) => (
            <div key={label as string} className="rounded-xl border border-[#e5e7eb] bg-white p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">{label as string}</div>
              <div className="mt-0.5 text-lg font-extrabold tabular-nums" style={{ color: color as string }}>
                {fmt(val as number)}
              </div>
            </div>
          ))}
        </div>

        {/* Форма «ВНЕСТИ» */}
        <div className={panel + " mb-3"}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Внести</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[10px] text-[#9ca3af]">Дата</span>
              <input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-[#9ca3af]">Наличка</span>
              <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} onKeyDown={onEnterSave} placeholder="0" className={input + " text-right tabular-nums"} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-[#9ca3af]">Каспи</span>
              <input inputMode="decimal" value={kaspi} onChange={(e) => setKaspi(e.target.value)} onKeyDown={onEnterSave} placeholder="0" className={input + " text-right tabular-nums"} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-[#9ca3af]">Халык</span>
              <input inputMode="decimal" value={halyk} onChange={(e) => setHalyk(e.target.value)} onKeyDown={onEnterSave} placeholder="0" className={input + " text-right tabular-nums"} />
            </label>
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={onEnterSave}
            placeholder="Комментарий (например, ЖАКЕН)"
            className={input + " mt-2"}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-3 w-full rounded-lg bg-[#2f80ed] py-3 text-base font-semibold text-white disabled:opacity-50 active:bg-[#2568c9]"
          >
            {saving ? "…" : "Записать"}
          </button>
        </div>

        {/* Период */}
        <div className="mb-2 flex flex-wrap items-end gap-2">
          {[
            { k: "week", label: "Неделя", r: weekRange },
            { k: "month", label: "Месяц", r: monthRange },
          ].map((b) => (
            <button
              key={b.k}
              type="button"
              onClick={() => applyPreset(b.k, b.r())}
              className={
                "rounded-lg border px-3 py-1.5 text-xs font-semibold " +
                (preset === b.k
                  ? "border-[#2f80ed] bg-[#eaf1fd] text-[#2f80ed]"
                  : "border-[#e5e7eb] bg-white text-[#6b7280]")
              }
            >
              {b.label}
            </button>
          ))}
          <input type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className="rounded-lg bg-white border border-[#e5e7eb] px-2 py-1.5 text-xs" />
          <span className="text-[#9ca3af]">—</span>
          <input type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className="rounded-lg bg-white border border-[#e5e7eb] px-2 py-1.5 text-xs" />
        </div>

        {/* Журнал за период */}
        <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-white">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-[#f9fafb] text-[#6b7280]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Дата</th>
                <th className="px-3 py-2 text-right font-medium">Наличка</th>
                <th className="px-3 py-2 text-right font-medium">Каспи</th>
                <th className="px-3 py-2 text-right font-medium">Халык</th>
                <th className="px-3 py-2 text-left font-medium">Комментарий</th>
                <th className="px-1 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((r) => {
                const editing = editId === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => !editing && startEdit(r)}
                    className={
                      "border-t border-[#e5e7eb] " +
                      (editing ? "bg-[#f8fafc]" : "cursor-pointer hover:bg-[#f9fafb]")
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-left text-[#374151]">{r.date}</td>
                    {editing ? (
                      <>
                        <td className="px-2 py-1">
                          <input value={editCash} onChange={(e) => setEditCash(e.target.value)} className="w-24 rounded border border-[#e5e7eb] px-2 py-1 text-right" onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={editKaspi} onChange={(e) => setEditKaspi(e.target.value)} className="w-24 rounded border border-[#e5e7eb] px-2 py-1 text-right" onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={editHalyk} onChange={(e) => setEditHalyk(e.target.value)} className="w-24 rounded border border-[#e5e7eb] px-2 py-1 text-right" onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={editComment} onChange={(e) => setEditComment(e.target.value)} className="w-full rounded border border-[#e5e7eb] px-2 py-1" onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="whitespace-nowrap px-1 py-1 text-right">
                          <button type="button" onClick={(e) => { e.stopPropagation(); saveEdit(); }} title="Сохранить" className="px-1.5 text-[#047857]">✓</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); deleteEntry(r.id); }} title="Удалить" className="px-1.5 text-[#c81e1e]">🗑</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditId(null); }} title="Отмена" className="px-1.5 text-[#9ca3af]">✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right">{num(r.cash) ? fmt(num(r.cash)) : ""}</td>
                        <td className="px-3 py-2 text-right">{num(r.kaspi) ? fmt(num(r.kaspi)) : ""}</td>
                        <td className="px-3 py-2 text-right">{num(r.halyk) ? fmt(num(r.halyk)) : ""}</td>
                        <td className="px-3 py-2 text-left text-[#374151]">{r.comment}</td>
                        <td className="px-1 py-2 text-right text-[#c7ccd3]">✎</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[#9ca3af]">Нет записей за период</td>
                </tr>
              )}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#e5e7eb] bg-[#f9fafb] font-bold">
                  <td className="px-3 py-2 text-left">Итого</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.cash)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.kaspi)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.halyk)}</td>
                  <td className="px-3 py-2 text-left text-[#2f80ed]">Всего {fmt(totals.total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </main>
  );
}
