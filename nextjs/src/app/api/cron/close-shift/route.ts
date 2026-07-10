import { NextRequest, NextResponse } from "next/server";
import * as kassaService from "@/services/kassa.service";
import * as settingsService from "@/services/settings.service";

// Vercel Cron вызывает КАЖДЫЙ ЧАС (schedule "0 * * * *"). Роут сам сверяет текущий
// час по Алматы (UTC+5) с настройкой app_settings и закрывает смену только в нужный час.
// Vercel автоматически шлёт Authorization: Bearer <CRON_SECRET>.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { hour: targetHour, enabled } = await settingsService.getShiftSettings();
  if (!enabled) {
    return NextResponse.json({ status: "disabled" });
  }

  // Текущее время по Алматы (UTC+5, без перехода на летнее время)
  const almaty = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const currentHour = almaty.getUTCHours();
  if (currentHour !== targetHour) {
    return NextResponse.json({ status: "skip", currentHour, targetHour });
  }

  const today = almaty.toISOString().slice(0, 10);
  const result = await kassaService.autoCloseToday(today);
  return NextResponse.json(result);
}
