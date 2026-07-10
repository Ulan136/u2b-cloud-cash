"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* ── Десктоп: сайдбар слева ── */}
      <aside
        className={
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[#e5e7eb] bg-white transition-[width] duration-150 lg:flex " +
          (collapsed ? "w-14" : "w-[200px]")
        }
      >
        {/* Логотип */}
        <div className="flex h-14 items-center gap-2 border-b border-[#e5e7eb] px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2f80ed] font-bold text-white">
            ₸
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-extrabold text-[#1f2933]">U2B Cloud Cash</span>
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

        {/* Свернуть/развернуть */}
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
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white/95 backdrop-blur lg:hidden">
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
                    ? "border-[#2f80ed] text-[#2f80ed]"
                    : "border-transparent text-[#6b7280]")
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
