import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import * as dashboardService from "@/services/dashboard.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  const from = sp.get("from");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) обязателен" }, { status: 400 });
  }
  const chartFrom = from && DATE_RE.test(from) ? from : date;
  return NextResponse.json(await dashboardService.getDashboard(date, chartFrom));
}
