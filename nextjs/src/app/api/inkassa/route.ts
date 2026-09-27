import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import { createInkassaSchema, updateInkassaSchema } from "@/dto/inkassa.dto";
import { checkEditPassword } from "@/lib/editAuth";
import * as inkassaService from "@/services/inkassa.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  return NextResponse.json(await inkassaService.getJournal({ from, to }));
}

export async function POST(req: NextRequest) {
  const parsed = createInkassaSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await inkassaService.createEntry(parsed.data));
}

export async function PATCH(req: NextRequest) {
  const parsed = updateInkassaSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(await checkEditPassword(parsed.data.password))) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
  }
  return NextResponse.json(await inkassaService.updateEntry(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  if (!(await checkEditPassword(body?.password))) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
  }
  return NextResponse.json(await inkassaService.deleteEntry(id));
}
