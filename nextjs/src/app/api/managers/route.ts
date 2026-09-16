import { NextRequest, NextResponse } from "next/server";
import { BadRequestError, ConflictError } from "@/lib/errors";
import { managerFromReq } from "@/lib/managerAuth";
import * as svc from "@/services/managers.service";

// Пока нет ни одного пользователя — разрешаем (bootstrap первого админа).
// Иначе управление доступно только админу (по cookie).
async function ensureAdmin(req: NextRequest): Promise<NextResponse | null> {
  if ((await svc.count()) === 0) return null;
  const m = managerFromReq(req);
  if (!m?.isAdmin) return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  return null;
}

function mapErr(e: unknown): NextResponse | null {
  if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
  if (e instanceof BadRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
  return null;
}

export async function GET(req: NextRequest) {
  // Список для окна входа — только имена.
  if (req.nextUrl.searchParams.get("picker")) {
    return NextResponse.json(await svc.listForPicker());
  }
  // Полный список (без хеша пароля) — для админ-вкладки; создание/правка под админом.
  return NextResponse.json(await svc.list());
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;
  try {
    return NextResponse.json(await svc.createManager(await req.json()));
  } catch (e) {
    const r = mapErr(e);
    if (r) return r;
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;
  try {
    return NextResponse.json(await svc.updateManager(await req.json()));
  } catch (e) {
    const r = mapErr(e);
    if (r) return r;
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  return NextResponse.json(await svc.removeManager(id));
}
