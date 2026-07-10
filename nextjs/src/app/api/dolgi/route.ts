import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import { createDebtSchema } from "@/dto/dolgi.dto";
import * as dolgiService from "@/services/dolgi.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const clientIdParam = sp.get("clientId");
  if (clientIdParam) {
    const id = Number(clientIdParam);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "clientId неверный" }, { status: 400 });
    }
    return NextResponse.json(await dolgiService.getClientHistory(id));
  }

  // Анализ остатков: период опционален; today приходит с клиента (локальная дата).
  const from = sp.get("from");
  const to = sp.get("to");
  const today =
    sp.get("today") && DATE_RE.test(sp.get("today")!)
      ? sp.get("today")!
      : new Date().toISOString().slice(0, 10);
  const period =
    from && to && DATE_RE.test(from) && DATE_RE.test(to) ? { from, to } : {};
  return NextResponse.json(await dolgiService.getAnalysis({ ...period, today }));
}

export async function POST(req: NextRequest) {
  const parsed = createDebtSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await dolgiService.createEntry(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  return NextResponse.json(await dolgiService.deleteEntry(id));
}
