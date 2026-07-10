import { NextRequest, NextResponse } from "next/server";
import { monthlyCostSchema, reportQuerySchema } from "@/dto/reports.dto";
import * as reportsService from "@/services/reports.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // Годовая таблица «месяцы колонками»
  const yearParam = sp.get("year");
  if (yearParam) {
    const year = Number(yearParam);
    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: "year неверный" }, { status: 400 });
    }
    return NextResponse.json(await reportsService.getYear(year));
  }

  // Анализ месяца (from/to)
  const parsed = reportQuerySchema.safeParse({ from: sp.get("from"), to: sp.get("to") });
  if (!parsed.success) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  return NextResponse.json(await reportsService.getReport(parsed.data.from, parsed.data.to));
}

// Помесячная себестоимость (редактируемая ячейка годовой таблицы)
export async function PATCH(req: NextRequest) {
  const parsed = monthlyCostSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { year, month, sebestoimost } = parsed.data;
  return NextResponse.json(await reportsService.setMonthlyCost(year, month, sebestoimost));
}
