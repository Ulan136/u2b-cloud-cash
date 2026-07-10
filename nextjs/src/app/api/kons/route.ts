import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import { createKonsSchema } from "@/dto/kons.dto";
import * as konsService from "@/services/kons.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const supplier = sp.get("supplier");
  if (supplier) {
    return NextResponse.json(await konsService.getSupplierHistory(supplier));
  }

  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  return NextResponse.json(await konsService.getByPeriod(from, to));
}

export async function POST(req: NextRequest) {
  const parsed = createKonsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await konsService.createEntry(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  return NextResponse.json(await konsService.deleteEntry(id));
}
