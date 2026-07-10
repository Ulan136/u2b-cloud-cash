import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import { patchSebestoimostSchema, saveDaySchema } from "@/dto/kassa.dto";
import * as kassaService from "@/services/kassa.service";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) обязателен" }, { status: 400 });
  }
  return NextResponse.json(await kassaService.getDay(date));
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
