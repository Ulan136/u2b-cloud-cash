import Link from "next/link";

const menu = [
  { href: "/kassa", label: "Касса", icon: "💰" },
  { href: "/dolgi", label: "Долги", icon: "📋" },
  { href: "/salary", label: "Зарплата", icon: "👥" },
  { href: "/kons", label: "КОНС", icon: "📦" },
  { href: "/otchety", label: "Отчёты", icon: "📊" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">U2B Cloud Cash</h1>
          <p className="mt-2 text-sm text-neutral-400">Учёт кассы</p>
        </header>

        <nav className="grid grid-cols-2 gap-4">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-neutral-900 border border-neutral-800 px-4 py-8 text-center transition-colors active:bg-neutral-800 hover:border-neutral-600"
            >
              <span className="text-4xl">{item.icon}</span>
              <span className="text-lg font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
