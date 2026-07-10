import { NextRequest, NextResponse } from "next/server";
import { createOpSchema } from "@/dto/finance.dto";
import * as financeService from "@/services/finance.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return NextResponse.json(
    await financeService.getOps({
      from: sp.get("from"),
      to: sp.get("to"),
      accountId: sp.get("accountId"),
    })
  );
}

export async function POST(req: NextRequest) {
  const parsed = createOpSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await financeService.createOp(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  return NextResponse.json(await financeService.deleteOp(id));
}
