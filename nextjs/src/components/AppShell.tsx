"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { canSee, getMe, ME_EVENT, setMe, type Me } from "@/lib/currentManager";

// Название магазина задаётся переменной окружения NEXT_PUBLIC_STORE_NAME
// (свой у каждого проекта Vercel). Так один код обслуживает несколько магазинов.
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "U2B Cloud Cash";

const ITEMS = [
  { href: "/", icon: "🏠", label: "Дашборд" },
  { href: "/kassa", icon: "💵", label: "Касса" },
  { href: "/dolgi", icon: "🤝", label: "Долги" },
  { href: "/salary", icon: "💰", label: "Зарплата" },
  { href: "/kons", icon: "📦", label: "КОНС" },
  { href: "/finance", icon: "🏦", label: "Финансы" },
  { href: "/reports", icon: "📊", label: "Отчёты" },
  { href: "/analytics", icon: "📈", label: "Анализы" },
  { href: "/settings", icon: "⚙️", label: "Настройки" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const [me, setMeState] = useState<Me | null>(null);
  const [managersExist, setManagersExist] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
    } catch {
      // localStorage недоступен
    }
    setMeState(getMe());
    const onMe = () => setMeState(getMe());
    window.addEventListener(ME_EVENT, onMe);
    // Есть ли вообще пользователи (нужен ли вход)
    fetch("/api/managers?picker=1")
      .then((r) => r.json())
      .then((d) => setManagersExist((d.managers ?? []).length > 0))
      .catch(() => setManagersExist(false));
    return () => window.removeEventListener(ME_EVENT, onMe);
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      } catch {
        // игнорируем
      }
      return next;
    });

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const items = ITEMS.filter((it) => canSee(me, it.href));
  const base = pathname === "/" ? "/" : "/" + pathname.split("/")[1];

  // Защита страниц: не-админа с закрытой страницы уводим на первую доступную.
  useEffect(() => {
    if (!me || me.isAdmin) return;
    if (!canSee(me, base) && items.length > 0 && items[0].href !== pathname) {
      router.replace(items[0].href);
    }
  }, [me, base, pathname, items, router]);

  async function logout() {
    try {
      await fetch("/api/managers/login", { method: "DELETE" });
    } catch {
      // ignore
    }
    setMe(null);
  }

  // Гейт входа — если пользователи заведены, а на устройстве не выбран менеджер.
  const showGate = managersExist === true && !me;
  // Не-админ без доступных страниц.
  const noAccess = me && !me.isAdmin && items.length === 0;

  return (
    <>
      {/* ── Десктоп: сайдбар слева ── */}
      <aside
        className={
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[#e5e7eb] bg-white transition-[width] duration-150 lg:flex " +
          (collapsed ? "w-14" : "w-[200px]")
        }
      >
        <div className="flex h-14 items-center gap-2 border-b border-[#e5e7eb] px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2f80ed] font-bold text-white">
            ₸
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-extrabold text-[#1f2933]">{STORE_NAME}</span>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                prefetch
                title={collapsed ? it.label : undefined}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 " +
                  (collapsed ? "justify-center " : "") +
                  (active
                    ? "bg-[#eaf1fd] font-semibold text-[#2f80ed]"
                    : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1f2933]")
                }
              >
                <span className="w-6 shrink-0 text-center text-xl">{it.icon}</span>
                {!collapsed && <span className="truncate text-sm font-medium">{it.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Текущий пользователь + смена */}
        {me && (
          <div className="border-t border-[#e5e7eb] px-2 py-2">
            {!collapsed ? (
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaf1fd] text-[13px]">
                  👤
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1f2933]">
                  {me.name}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  title="Сменить пользователя"
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#2f6fe0] hover:bg-[#eaf1fd]"
                >
                  сменить
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={logout}
                title={`${me.name} — сменить`}
                className="flex w-full justify-center py-1 text-base"
              >
                👤
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Развернуть" : "Свернуть"}
          className={
            "flex items-center gap-3 border-t border-[#e5e7eb] px-3 py-2.5 text-[#9ca3af] hover:text-[#1f2933] " +
            (collapsed ? "justify-center" : "")
          }
        >
          <span className="w-6 text-center text-lg">{collapsed ? "»" : "«"}</span>
          {!collapsed && <span className="text-sm">Свернуть</span>}
        </button>
      </aside>

      {/* ── Телефон: нижняя панель ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 overflow-x-auto border-t border-[#e5e7eb] bg-white/95 backdrop-blur lg:hidden">
        <div className="flex min-w-max">
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                prefetch
                className={
                  "flex min-w-[3.6rem] flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap border-t-2 px-1 py-2 text-[10px] " +
                  (active
                    ? "border-[#2f80ed] text-[#2f80ed]"
                    : "border-transparent text-[#6b7280]")
                }
              >
                <span className="text-lg">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            );
          })}
          {me && (
            <button
              type="button"
              onClick={logout}
              title={`${me.name} — сменить`}
              className="flex min-w-[3.6rem] flex-col items-center justify-center gap-0.5 border-t-2 border-transparent px-1 py-2 text-[10px] text-[#6b7280]"
            >
              <span className="text-lg">👤</span>
              <span className="max-w-[3.4rem] truncate">{me.name}</span>
            </button>
          )}
        </div>
      </nav>

      {/* ── Контент ── */}
      <div
        className={
          "pb-20 transition-[padding] duration-150 lg:pb-0 " +
          (collapsed ? "lg:pl-14" : "lg:pl-[200px]")
        }
      >
        {noAccess ? (
          <div className="flex min-h-screen items-center justify-center p-6 text-center text-[#6b7280]">
            Нет доступных страниц. Обратитесь к администратору.
          </div>
        ) : (
          children
        )}
      </div>

      {showGate && <LoginGate />}
    </>
  );
}

// ── Окно входа: выбрал себя из списка + пароль ──
function LoginGate() {
  const [list, setList] = useState<{ id: number; name: string; isAdmin: boolean }[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/managers?picker=1");
    const d = await r.json();
    setList(d.managers ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (picked == null) return setError("Выберите себя");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/managers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: picked, password }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(typeof d?.error === "string" ? d.error : "Ошибка входа");
        return;
      }
      setMe(d.manager);
    } catch {
      setError("Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1220]/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="text-lg font-extrabold text-[#1f2933]">Кто вы?</div>
        <p className="mt-1 text-sm text-[#6b7280]">Выберите себя и введите пароль.</p>

        <div className="mt-3 max-h-52 overflow-auto rounded-lg border border-[#e5e7eb] divide-y divide-[#e5e7eb]">
          {list.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setPicked(m.id);
                setError("");
              }}
              className={
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm " +
                (picked === m.id ? "bg-[#eaf1fd] font-semibold text-[#2f80ed]" : "hover:bg-[#f3f4f6]")
              }
            >
              <span className="truncate">{m.name}</span>
              {m.isAdmin && <span className="ml-2 shrink-0 text-[11px] text-[#9ca3af]">админ</span>}
            </button>
          ))}
          {list.length === 0 && (
            <div className="px-3 py-3 text-center text-sm text-[#9ca3af]">Нет пользователей</div>
          )}
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Пароль"
          className="mt-3 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
        />
        {error && <p className="mt-2 text-sm text-[#c81e1e]">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-[#2f80ed] py-2.5 text-sm font-bold text-white disabled:opacity-50 active:bg-[#2568c9]"
        >
          {busy ? "Вход…" : "Войти"}
        </button>
      </div>
    </div>
  );
}
