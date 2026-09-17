import { NextRequest, NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import * as trackService from "@/services/track.service";

// ПУБЛИЧНЫЙ просмотр долга клиента по токену (без авторизации).
// Клиент открывает ссылку /track/<token> и видит свой остаток и историю.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Нет токена" }, { status: 400 });
  }
  try {
    return NextResponse.json(await trackService.getTrackData(token));
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    throw e;
  }
}
