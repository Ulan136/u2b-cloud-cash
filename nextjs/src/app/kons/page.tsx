"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLiveData } from "@/lib/live/useLiveData";
import { LiveIndicator } from "@/components/LiveIndicator";
import { DirectorySelect, type DirItem } from "@/components/DirectorySelect";

type Balance = { supplier: string; prihod: number; rashod: number; ostatok: number };
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

const input =
  "w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm";
const panel = "rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-4";

/** Сумма-бейдж: приход — красный «+» (наш долг вырос), оплата — зелёный «−». Пустая при нуле. */
function AmtBadge({ v, kind }: { v: number; kind: "prihod" | "rashod" }) {
  if (!v) return null;
  const prihod = kind === "prihod";
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums"
      style={
        prihod
          ? { background: "#fdecec", color: "#e02424" }
          : { background: "#e7f6ee", color: "#0e9f4f" }
      }
    >
      {prihod ? "+" : "−"}
      {fmt(v)}
    </span>
  );
}

export default function KonsPage() {
  const today = useMemo(() => todayStr(), []);

  const [balances, setBalances] = useState<Balance[]>([]);
  const [totalOstatok, setTotalOstatok] = useState(0);
  const [dirSuppliers, setDirSuppliers] = useState<DirItem[]>([]);

  // выбранный поставщик
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const selectedRef = useRef<string | null>(null);

  // фильтр периода истории (по умолчанию — вся история)
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");

  // форма-строка
  const [formSupplier, setFormSupplier] = useState("");
  const [prihod, setPrihod] = useState("");
  const [rashod, setRashod] = useState("");
  const [comment, setComment] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // редактирование записи истории
  const [editId, setEditId] = useState<number | null>(null);
  const [editPrihod, setEditPrihod] = useState("");
  const [editRashod, setEditRashod] = useState("");
  const [editComment, setEditComment] = useState("");

  // поиск по списку поставщиков (правая панель)
  const [search, setSearch] = useState("");

  const loadAnalysis = useCallback(async () => {
    const res = await fetch("/api/kons");
    const d = await res.json();
    setBalances(d.balances ?? []);
    setTotalOstatok(d.totalOstatok ?? 0);
  }, []);

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

  const { refreshing, lastUpdated } = useLiveData("kons", load, []);

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

  const selectedPhone = useMemo(
    () => dirSuppliers.find((s) => s.name === selected)?.phone ?? null,
    [dirSuppliers, selected]
  );

  // Остаток — всегда за всё время (приход минус оплаты по полной истории).
  const supplierOstatok = useMemo(() => {
    if (!history) return 0;
    return history.reduce((s, h) => s + num(h.prihod) - num(h.rashod), 0);
  }, [history]);

  // История с учётом фильтра периода (для отображения).
  const shownHistory = useMemo(() => {
    if (!history) return [];
    return history.filter(
      (h) => (!histFrom || h.date >= histFrom) && (!histTo || h.date <= histTo)
    );
  }, [history, histFrom, histTo]);

  function selectSupplier(name: string) {
    selectedRef.current = name;
    setSelected(name);
    setFormSupplier(name);
    setEditId(null);
    setHistory(null);
    loadHistory(name);
  }
  function clearSelection() {
    selectedRef.current = null;
    setSelected(null);
    setHistory(null);
    setEditId(null);
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

  function startEdit(h: HistoryRow) {
    setEditId(h.id);
    setEditPrihod(num(h.prihod) ? String(num(h.prihod)) : "");
    setEditRashod(num(h.rashod) ? String(num(h.rashod)) : "");
    setEditComment(h.comment ?? "");
  }

  async function saveEdit() {
    if (editId == null) return;
    const password = window.prompt("Пароль для изменения записи:");
    if (password === null) return; // отмена ввода пароля
    const res = await fetch("/api/kons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        prihod: editPrihod,
        rashod: editRashod,
        comment: editComment,
        password,
      }),
    });
    if (res.status === 403) return setStatus("Неверный пароль — изменение не применено");
    if (!res.ok) return setStatus("Ошибка изменения");
    setEditId(null);
    setStatus("Изменено ✓");
    if (selectedRef.current) await Promise.all([loadAnalysis(), loadHistory(selectedRef.current)]);
  }

  return (
    <main className="min-h-screen bg-[#f0f2f5] text-[#1f2933] px-4 py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold">КОНС</h1>
          <span className="ml-auto">
            <LiveIndicator lastUpdated={lastUpdated} refreshing={refreshing} />
          </span>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ЛЕВАЯ: форма внесения (сверху) + карточка поставщика */}
          <section className="space-y-4">
            {/* Форма одной строкой */}
            <div className={panel}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                Внести {selected ? `— ${selected}` : ""}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block w-32">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Дата</span>
                  <input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} className={input} />
                </label>
                <label className="block min-w-[160px] flex-1">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Поставщик</span>
                  <DirectorySelect
                    items={dirSuppliers}
                    value={formSupplier}
                    onPick={(it) => setFormSupplier(it.name)}
                    onCreate={createSupplier}
                    placeholder="Выберите или создайте"
                  />
                </label>
                <label className="block w-24">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Приход</span>
                  <input inputMode="decimal" value={prihod} onChange={(e) => setPrihod(e.target.value)} placeholder="0" className={input + " text-right tabular-nums"} />
                </label>
                <label className="block w-24">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Оплата</span>
                  <input inputMode="decimal" value={rashod} onChange={(e) => setRashod(e.target.value)} placeholder="0" className={input + " text-right tabular-nums"} />
                </label>
                <label className="block min-w-[110px] flex-1">
                  <span className="mb-1 block text-[11px] text-[#6b7280]">Комментарий</span>
                  <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" className={input} />
                </label>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-[#2f80ed] px-5 py-2 text-sm font-bold text-white disabled:opacity-50 active:bg-[#2568c9]"
                >
                  {saving ? "…" : "ВНЕСТИ"}
                </button>
              </div>
              {status && <p className="mt-2 text-xs text-[#374151]">{status}</p>}
            </div>

            {/* Карточка выбранного поставщика (остаток за всё время + история) */}
            {selected ? (
              <div className={panel}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-lg font-bold">{selected}</div>
                    {selectedPhone && <div className="text-xs text-[#9ca3af]">{selectedPhone}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-[#6b7280]">Остаток (за всё время)</div>
                    <div
                      className={
                        "text-2xl font-extrabold tabular-nums " +
                        (supplierOstatok > 0
                          ? "text-[#e02424]"
                          : supplierOstatok < 0
                            ? "text-[#0e9f4f]"
                            : "text-[#374151]")
                      }
                    >
                      {fmt(supplierOstatok)}
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
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="ml-auto pb-1.5 text-[11px] text-[#6b7280] underline"
                  >
                    закрыть
                  </button>
                </div>

                <div className="mt-1 overflow-x-auto rounded-lg border border-[#e5e7eb]">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-white text-[#6b7280]">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Дата</th>
                        <th className="px-2 py-1.5 text-right font-medium">Приход</th>
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
                            <td className="px-2 py-1.5 text-left align-top text-[#374151]">{h.date}</td>
                            {editing ? (
                              <>
                                <td className="px-1 py-1.5">
                                  <input
                                    inputMode="decimal"
                                    value={editPrihod}
                                    onChange={(e) => setEditPrihod(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="0"
                                    className="w-16 rounded border border-[#e5e7eb] px-1.5 py-1 text-right tabular-nums"
                                  />
                                </td>
                                <td className="px-1 py-1.5">
                                  <input
                                    inputMode="decimal"
                                    value={editRashod}
                                    onChange={(e) => setEditRashod(e.target.value)}
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
                                    className="font-bold text-[#0e9f4f] hover:opacity-80"
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
                                    className="ml-1.5 text-[#9ca3af] hover:text-[#eb5757]"
                                    aria-label="Отмена"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-2 py-1.5 text-right">
                                  <AmtBadge v={num(h.prihod)} kind="prihod" />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <AmtBadge v={num(h.rashod)} kind="rashod" />
                                </td>
                                <td className="px-2 py-1.5 text-left text-[#6b7280]">{h.comment}</td>
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
              <div className={panel + " text-center text-sm text-[#9ca3af]"}>
                Выберите поставщика справа или внесите операцию
              </div>
            )}
          </section>

          {/* ПРАВАЯ: постоянный список поставщиков (остаток за всё время) */}
          <section className={panel + " space-y-3"}>
            <div className="rounded-xl border border-[#f5c6c6] bg-[#fdecec] p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                Общий остаток (сколько мы должны)
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-[#e02424]">
                {fmt(totalOstatok)}
              </div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск поставщика…"
              className={input}
            />

            <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-white text-[#6b7280]">
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
                        "cursor-pointer border-t border-[#e5e7eb] active:bg-white " +
                        (selected === b.supplier ? "bg-[#eaf1fd]" : "")
                      }
                    >
                      <td className="px-3 py-2 text-left">{b.supplier}</td>
                      <td className="px-2 py-2 text-right"><AmtBadge v={b.prihod} kind="prihod" /></td>
                      <td className="px-2 py-2 text-right"><AmtBadge v={b.rashod} kind="rashod" /></td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold " +
                          (b.ostatok > 0 ? "text-[#e02424]" : b.ostatok < 0 ? "text-[#0e9f4f]" : "text-[#374151]")
                        }
                      >
                        {fmt(b.ostatok)}
                      </td>
                    </tr>
                  ))}
                  {roster.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-[#9ca3af]">
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
