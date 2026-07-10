import { NextRequest, NextResponse } from "next/server";
import * as kassaService from "@/services/kassa.service";

// Автозакрытие смены. Вызывается Vercel Cron (GET) в 16:00 UTC = 21:00 Алматы (UTC+5).
// Vercel автоматически шлёт заголовок Authorization: Bearer <CRON_SECRET>.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Сегодня по Алматы (UTC+5, без перехода на летнее время)
  const almaty = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const today = almaty.toISOString().slice(0, 10);

  const result = await kassaService.autoCloseToday(today);
  return NextResponse.json(result);
}
