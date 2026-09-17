import { NextRequest, NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import * as trackService from "@/services/track.service";

// Создать/получить публичную онлайн-ссылку клиента (токен). Возвращает { token }.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const clientId = Number(body?.clientId);
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ error: "clientId обязателен" }, { status: 400 });
  }
  try {
    return NextResponse.json(await trackService.getOrCreateShareToken(clientId));
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }
}
