"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ITEMS = [
  { href: "/kassa", icon: "💵", label: "Касса" },
  { href: "/dolgi", icon: "🤝", label: "Долги" },
  { href: "/salary", icon: "💰", label: "Зарплата" },
  { href: "/kons", icon: "📦", label: "КОНС" },
  { href: "/finance", icon: "🏦", label: "Финансы" },
  { href: "/reports", icon: "📊", label: "Отчёты" },
  { href: "/analytics", icon: "📈", label: "Анализы" },
  { href: "/settings", icon: "⚙️", label: "Настройки" },
];

/**
 * Оболочка приложения с навигацией:
 * - десктоп (>1024px): фиксированный вертикальный сайдбар слева, сворачиваемый;
 * - телефон (<1024px): нижняя панель вкладок (как была).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
    } catch {
      // localStorage недоступен
    }
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

  // На редиректе главной ничего не показываем
  if (pathname === "/") return <>{children}</>;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* ── Десктоп: сайдбар слева ── */}
      <aside
        className={
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-neutral-800 bg-neutral-950 transition-[width] duration-150 lg:flex " +
          (collapsed ? "w-14" : "w-[200px]")
        }
      >
        {/* Логотип */}
        <div className="flex h-14 items-center gap-2 border-b border-neutral-800 px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white">
            ₸
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-extrabold">U2B Cloud Cash</span>
          )}
        </div>

        {/* Вкладки */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {ITEMS.map((it) => {
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
                    ? "bg-emerald-600/15 text-emerald-400"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100")
                }
              >
                <span className="w-6 shrink-0 text-center text-xl">{it.icon}</span>
                {!collapsed && <span className="truncate text-sm font-medium">{it.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Свернуть/развернуть */}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Развернуть" : "Свернуть"}
          className={
            "flex items-center gap-3 border-t border-neutral-800 px-3 py-2.5 text-neutral-500 hover:text-neutral-200 " +
            (collapsed ? "justify-center" : "")
          }
        >
          <span className="w-6 text-center text-lg">{collapsed ? "»" : "«"}</span>
          {!collapsed && <span className="text-sm">Свернуть</span>}
        </button>
      </aside>

      {/* ── Телефон: нижняя панель ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur lg:hidden">
        <div className="flex">
          {ITEMS.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                prefetch
                className={
                  "flex flex-1 flex-col items-center justify-center gap-0.5 border-t-2 py-2 text-[11px] " +
                  (active
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-neutral-400")
                }
              >
                <span className="text-lg">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Контент ── */}
      <div
        className={
          "pb-20 transition-[padding] duration-150 lg:pb-0 " +
          (collapsed ? "lg:pl-14" : "lg:pl-[200px]")
        }
      >
        {children}
      </div>
    </>
  );
}
