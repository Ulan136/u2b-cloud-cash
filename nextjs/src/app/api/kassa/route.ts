import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import { patchSebestoimostSchema, saveDaySchema } from "@/dto/kassa.dto";
import * as kassaService from "@/services/kassa.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  if (date) {
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "date (YYYY-MM-DD) обязателен" }, { status: 400 });
    }
    return NextResponse.json(await kassaService.getDay(date));
  }

  // Архив дней за период
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    return NextResponse.json(await kassaService.listRecentDays(from, to));
  }

  return NextResponse.json({ error: "date или from&to обязательны" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const parsed = saveDaySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await kassaService.saveDay(parsed.data));
}

export async function PATCH(req: NextRequest) {
  const parsed = patchSebestoimostSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(
    await kassaService.setSebestoimost(parsed.data.date, parsed.data.sebestoimost)
  );
}
