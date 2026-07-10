"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";
import { DirectorySelect, type DirItem } from "@/components/DirectorySelect";

type Balance = { supplier: string; prihod: number; rashod: number; ostatok: number };
type Entry = {
  id: number;
  date: string;
  supplier: string;
  prihod: string;
  rashod: string;
  comment: string | null;
};
type HistoryRow = { id: number; date: string; prihod: string; rashod: string; comment: string | null };

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

const input =
  "w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm";
const panel = "rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4";

export default function KonsPage() {
  const today = useMemo(() => todayStr(), []);

  const [balances, setBalances] = useState<Balance[]>([]);
  const [totalOstatok, setTotalOstatok] = useState(0);
  const [dirSuppliers, setDirSuppliers] = useState<DirItem[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  // выбранный поставщик
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedRef = useRef<string | null>(null);

  // форма-строка
  const [formSupplier, setFormSupplier] = useState("");
  const [prihod, setPrihod] = useState("");
  const [rashod, setRashod] = useState("");
  const [comment, setComment] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // период (для журнала) + поиск (для списка)
  const initRange = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initRange.from);
  const [to, setTo] = useState(initRange.to);
  const [preset, setPreset] = useState("month");
  const [search, setSearch] = useState("");

  const loadAnalysis = useCallback(async () => {
    const res = await fetch(`/api/kons?from=${from}&to=${to}`);
    const d = await res.json();
    setBalances(d.balances ?? []);
    setTotalOstatok(d.totalOstatok ?? 0);
    setEntries(d.entries ?? []);
  }, [from, to]);

  const loadDir = useCallback(async () => {
    const res = await fetch("/api/settings/suppliers?archived=0");
    const d = await res.json();
    setDirSuppliers(
      (d.items ?? []).map((i: { id: number; name: string; phone: string | null }) => ({
        id: i.id,
        name: i.name,
        phone: i.phone,
      }))
    );
  }, []);

  const loadHistory = useCallback(async (supplier: string) => {
    const res = await fetch(`/api/kons?supplier=${encodeURIComponent(supplier)}`);
    const d = await res.json();
    setHistory(d.history ?? []);
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadAnalysis(), loadDir()]);
    if (selectedRef.current) await loadHistory(selectedRef.current);
  }, [loadAnalysis, loadDir, loadHistory]);

  const { refreshing, lastUpdated } = useLiveData("kons", load, [from, to]);

  async function createSupplier(name: string, phone: string): Promise<DirItem | null> {
    const res = await fetch("/api/settings/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });
    if (!res.ok) {
      setStatus(res.status === 409 ? "Такой поставщик уже есть" : "Ошибка создания");
      return null;
    }
    const { item } = await res.json();
    await loadDir();
    return { id: item.id, name: item.name, phone: item.phone };
  }

  // Постоянный список поставщиков из справочника с остатком за всё время, сорт по остатку убыв.
  const roster = useMemo(() => {
    const balMap = new Map(balances.map((b) => [b.supplier, b]));
    const q = search.trim().toLowerCase();
    return dirSuppliers
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .map((s) => {
        const b = balMap.get(s.name);
        return { supplier: s.name, prihod: b?.prihod ?? 0, rashod: b?.rashod ?? 0, ostatok: b?.ostatok ?? 0 };
      })
      .sort((a, b) => b.ostatok - a.ostatok);
  }, [dirSuppliers, balances, search]);

  function applyPreset(name: string, range: { from: string; to: string }) {
    setPreset(name);
    setFrom(range.from);
    setTo(range.to);
  }

  function selectSupplier(name: string) {
    selectedRef.current = name;
    setSelected(name);
    setFormSupplier(name);
    setHistory(null);
    loadHistory(name);
  }
  function clearSelection() {
    selectedRef.current = null;
    setSelected(null);
    setHistory(null);
  }

  async function save() {
    const supplier = formSupplier.trim();
    if (!supplier) return setStatus("Укажите поставщика");
    if (prihod === "" && rashod === "") return setStatus("Укажите приход или оплату");
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
      setStatus("Внесено ✓");
      selectedRef.current = supplier;
      setSelected(supplier);
      await Promise.all([loadAnalysis(), loadHistory(supplier)]);
    } catch {
      setStatus("Ошибка");
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
          {/* ЛЕВАЯ: форма + журнал */}
          <section className="space-y-4">
            {/* Форма одной строкой */}
            <div className={panel}>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block w-32">
                  <span className="mb-1 block text-[11px] text-neutral-400">Дата</span>
                  <input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} className={input} />
                </label>
                <label className="block min-w-[160px] flex-1">
                  <span className="mb-1 block text-[11px] text-neutral-400">Поставщик</span>
                  <DirectorySelect
                    items={dirSuppliers}
                    value={formSupplier}
                    onPick={(it) => setFormSupplier(it.name)}
                    onCreate={createSupplier}
                    placeholder="Выберите или создайте"
                  />
                </label>
                <label className="block w-24">
                  <span className="mb-1 block text-[11px] text-neutral-400">Приход</span>
                  <input inputMode="decimal" value={prihod} onChange={(e) => setPrihod(e.target.value)} placeholder="0" className={input + " text-right tabular-nums"} />
                </label>
                <label className="block w-24">
                  <span className="mb-1 block text-[11px] text-neutral-400">Оплата</span>
                  <input inputMode="decimal" value={rashod} onChange={(e) => setRashod(e.target.value)} placeholder="0" className={input + " text-right tabular-nums"} />
                </label>
                <label className="block min-w-[110px] flex-1">
                  <span className="mb-1 block text-[11px] text-neutral-400">Комментарий</span>
                  <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" className={input} />
                </label>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50 active:bg-emerald-700"
                >
                  {saving ? "…" : "ВНЕСТИ"}
                </button>
              </div>
              {status && <p className="mt-2 text-xs text-neutral-300">{status}</p>}
            </div>

            {/* Журнал за период / история выбранного */}
            <div className={panel}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {selected ? `История: ${selected}` : "Журнал за период"}
                </span>
                {selected && (
                  <button type="button" onClick={clearSelection} className="text-[11px] text-emerald-400 underline">
                    ← весь журнал
                  </button>
                )}
              </div>

              {!selected && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
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
                          ? "border-emerald-600 bg-emerald-600/20 text-emerald-300"
                          : "border-neutral-800 bg-neutral-900 text-neutral-400")
                      }
                    >
                      {b.label}
                    </button>
                  ))}
                  <input type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className="rounded-lg bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-xs" />
                  <input type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className="rounded-lg bg-neutral-900 border border-neutral-800 px-2 py-1.5 text-xs" />
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-neutral-900 text-neutral-400">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Дата</th>
                      {!selected && <th className="px-2 py-1.5 text-left font-medium">Поставщик</th>}
                      <th className="px-2 py-1.5 text-right font-medium">Приход</th>
                      <th className="px-2 py-1.5 text-right font-medium">Оплата</th>
                      <th className="px-2 py-1.5 text-left font-medium">Комментарий</th>
                      <th className="px-1 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected
                      ? (history ?? []).map((h) => (
                          <tr key={h.id} className="border-t border-neutral-800">
                            <td className="px-2 py-1.5 text-left text-neutral-400">{h.date}</td>
                            <td className="px-2 py-1.5 text-right text-red-400">{num(h.prihod) ? fmt(num(h.prihod)) : ""}</td>
                            <td className="px-2 py-1.5 text-right text-emerald-400">{num(h.rashod) ? fmt(num(h.rashod)) : ""}</td>
                            <td className="px-2 py-1.5 text-left text-neutral-400">{h.comment}</td>
                            <td className="px-1 py-1.5 text-right">
                              <button type="button" onClick={() => removeEntry(h.id)} className="text-neutral-600 hover:text-red-400">✕</button>
                            </td>
                          </tr>
                        ))
                      : entries.map((e) => (
                          <tr key={e.id} className="border-t border-neutral-800">
                            <td className="px-2 py-1.5 text-left text-neutral-400">{e.date}</td>
                            <td className="px-2 py-1.5 text-left">
                              <button type="button" onClick={() => selectSupplier(e.supplier)} className="hover:text-emerald-400">
                                {e.supplier}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-right text-red-400">{num(e.prihod) ? fmt(num(e.prihod)) : ""}</td>
                            <td className="px-2 py-1.5 text-right text-emerald-400">{num(e.rashod) ? fmt(num(e.rashod)) : ""}</td>
                            <td className="px-2 py-1.5 text-left text-neutral-400">{e.comment}</td>
                            <td className="px-1 py-1.5 text-right">
                              <button type="button" onClick={() => removeEntry(e.id)} className="text-neutral-600 hover:text-red-400">✕</button>
                            </td>
                          </tr>
                        ))}
                    {((selected && history !== null && history.length === 0) ||
                      (!selected && entries.length === 0)) && (
                      <tr>
                        <td colSpan={selected ? 5 : 6} className="px-2 py-3 text-center text-neutral-500">
                          Нет записей
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ПРАВАЯ: постоянный список поставщиков (остаток за всё время) */}
          <section className={panel + " space-y-3"}>
            <div className="rounded-xl border border-red-900/60 bg-red-950/25 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                Общий остаток (сколько мы должны)
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-red-400">
                {fmt(totalOstatok)}
              </div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск поставщика…"
              className={input}
            />

            <div className="overflow-x-auto rounded-lg border border-neutral-800">
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
                  {roster.map((b) => (
                    <tr
                      key={b.supplier}
                      onClick={() => selectSupplier(b.supplier)}
                      className={
                        "cursor-pointer border-t border-neutral-800 active:bg-neutral-900 " +
                        (selected === b.supplier ? "bg-neutral-800/60" : "")
                      }
                    >
                      <td className="px-3 py-2 text-left">{b.supplier}</td>
                      <td className="px-2 py-2 text-right text-neutral-400">{fmt(b.prihod)}</td>
                      <td className="px-2 py-2 text-right text-neutral-400">{fmt(b.rashod)}</td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold " +
                          (b.ostatok > 0 ? "text-red-400" : b.ostatok < 0 ? "text-emerald-400" : "text-neutral-300")
                        }
                      >
                        {fmt(b.ostatok)}
                      </td>
                    </tr>
                  ))}
                  {roster.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-neutral-500">
                        Пока нет поставщиков
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
