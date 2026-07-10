import { NextRequest, NextResponse } from "next/server";
import { reportQuerySchema } from "@/dto/reports.dto";
import * as reportsService from "@/services/reports.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = reportQuerySchema.safeParse({ from: sp.get("from"), to: sp.get("to") });
  if (!parsed.success) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  return NextResponse.json(await reportsService.getReport(parsed.data.from, parsed.data.to));
}
