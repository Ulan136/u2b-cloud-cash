// Текущий менеджер на этом устройстве (клиент). Хранится в localStorage;
// cookie ставит сервер при входе (для отметки автора операций).
export type Me = { id: number; name: string; isAdmin: boolean; pages: string[] };

const KEY = "u2b_currentManager";
export const ME_EVENT = "u2b-me";

export function getMe(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Me) : null;
  } catch {
    return null;
  }
}

export function setMe(m: Me | null) {
  try {
    if (m) localStorage.setItem(KEY, JSON.stringify(m));
    else localStorage.removeItem(KEY);
  } catch {
    // localStorage недоступен — игнорируем
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ME_EVENT));
}

// Доступна ли страница (href) этому менеджеру.
export function canSee(me: Me | null, href: string): boolean {
  if (!me) return true; // нет пользователей/входа — всё видно (bootstrap)
  if (me.isAdmin) return true; // админ видит всё
  if (href === "/settings") return false; // настройки — только админ
  return me.pages.includes(href);
}
