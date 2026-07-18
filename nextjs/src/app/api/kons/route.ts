import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import { createKonsSchema, updateKonsSchema } from "@/dto/kons.dto";
import { checkEditPassword } from "@/lib/editAuth";
import * as konsService from "@/services/kons.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const supplier = sp.get("supplier");
  if (supplier) {
    return NextResponse.json(await konsService.getSupplierHistory(supplier));
  }

  // Анализ остатков: период опционален (по умолчанию всё время).
  const from = sp.get("from");
  const to = sp.get("to");
  const period =
    from && to && DATE_RE.test(from) && DATE_RE.test(to) ? { from, to } : {};
  return NextResponse.json(await konsService.getAnalysis(period));
}

export async function POST(req: NextRequest) {
  const parsed = createKonsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await konsService.createEntry(parsed.data));
}

export async function PATCH(req: NextRequest) {
  const parsed = updateKonsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!checkEditPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
  }
  return NextResponse.json(await konsService.updateEntry(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  return NextResponse.json(await konsService.deleteEntry(id));
}
