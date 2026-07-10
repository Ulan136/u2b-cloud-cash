"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/kassa", icon: "💵", label: "Касса" },
  { href: "/dolgi", icon: "🤝", label: "Долги" },
  { href: "/salary", icon: "💰", label: "Зарплата" },
  { href: "/kons", icon: "📦", label: "КОНС" },
  { href: "/finance", icon: "🏦", label: "Финансы" },
  { href: "/reports", icon: "📊", label: "Отчёты" },
];

// Единая постоянная навигация: снизу на телефоне (под палец), сверху на десктопе.
export function Nav() {
  const pathname = usePathname();
  if (pathname === "/") return null; // на редиректе главной не мигаем панелью

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur
                 lg:static lg:border-t-0 lg:border-b lg:bg-neutral-950/95"
    >
      <div className="mx-auto flex max-w-5xl">
        {ITEMS.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              prefetch
              className={
                "flex flex-1 flex-col items-center justify-center gap-0.5 border-t-2 py-2 text-[11px] " +
                "lg:flex-row lg:gap-2 lg:border-t-0 lg:border-b-2 lg:py-3 lg:text-sm " +
                (active
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-neutral-400 hover:text-neutral-200")
              }
            >
              <span className="text-lg lg:text-base">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
