import { NextRequest, NextResponse } from "next/server";
import { BadRequestError } from "@/lib/errors";
import { MANAGER_COOKIE } from "@/lib/managerAuth";
import * as svc from "@/services/managers.service";

// Вход: выбрал себя (id) + пароль. Ставим cookie для отметки автора операций.
export async function POST(req: NextRequest) {
  try {
    const { id, password } = await req.json();
    const { manager } = await svc.login(Number(id), String(password ?? ""));
    const res = NextResponse.json({ manager });
    res.cookies.set(
      MANAGER_COOKIE,
      encodeURIComponent(JSON.stringify({ id: manager.id, name: manager.name, isAdmin: manager.isAdmin })),
      { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" }
    );
    return res;
  } catch (e) {
    if (e instanceof BadRequestError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }
}

// Выход / смена пользователя — чистим cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MANAGER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
