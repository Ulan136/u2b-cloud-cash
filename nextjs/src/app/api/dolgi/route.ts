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

  const date = sp.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) обязателен" }, { status: 400 });
  }
  return NextResponse.json(await dolgiService.getByDate(date));
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
