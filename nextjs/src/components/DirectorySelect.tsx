"use client";

import { useEffect, useRef, useState } from "react";

export type DirItem = { id: number; name: string; phone?: string | null };

// Выбор из справочника с поиском + «+ Создать нового…». Заменяет свободный ввод,
// чтобы не плодить дубли имён с опечатками.
export function DirectorySelect({
  items,
  value,
  onPick,
  onCreate,
  onClear,
  placeholder,
  className,
}: {
  items: DirItem[];
  value: string;
  onPick: (item: DirItem) => void;
  onCreate: (name: string, phone: string) => Promise<DirItem | null>;
  // Вызывается, когда текст поля не совпадает ни с одним элементом (правка/очистка).
  // Аргумент — текущий текст поля ("" при полной очистке).
  onClear?: (query: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items).slice(0, 40);

  async function doCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const item = await onCreate(name, newPhone.trim());
      if (item) {
        onPick(item);
        setQuery(item.name);
      }
      setCreating(false);
      setOpen(false);
      setNewPhone("");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    className ?? "w-full rounded-lg bg-white border border-[#e5e7eb] px-3 py-2 text-sm";

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          // точное совпадение имени — сразу выбираем (иначе значение не меняется)
          const exact = items.find((i) => i.name.toLowerCase() === v.trim().toLowerCase());
          if (exact) onPick(exact);
          else onClear?.(v);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={inputCls + (query && onClear ? " pr-8" : "")}
      />
      {query && onClear && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setOpen(false);
            onClear("");
          }}
          aria-label="Очистить"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#eb5757]"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-[#e5e7eb] bg-white shadow-xl">
          {filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => {
                onPick(i);
                setQuery(i.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#f3f4f6]"
            >
              <span className="truncate">{i.name}</span>
              {i.phone ? <span className="ml-2 shrink-0 text-xs text-[#9ca3af]">{i.phone}</span> : null}
            </button>
          ))}
          {filtered.length === 0 && !creating && (
            <div className="px-3 py-2 text-sm text-[#9ca3af]">Ничего не найдено</div>
          )}
          {!creating ? (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setNewName(query.trim());
              }}
              className="w-full border-t border-[#e5e7eb] px-3 py-2 text-left text-sm font-semibold text-[#f2994a] hover:bg-[#fdf1e7]"
            >
              + Создать нового…
            </button>
          ) : (
            <div className="space-y-2 border-t border-[#e5e7eb] p-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Имя"
                className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1.5 text-sm"
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Телефон (необязательно)"
                className="w-full rounded bg-[#f3f4f6] border border-[#e5e7eb] px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={doCreate}
                disabled={busy}
                className="w-full rounded bg-[#f2994a] py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "…" : "Создать и выбрать"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
