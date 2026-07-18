import { NextRequest, NextResponse } from "next/server";
import { createOpSchema, updateOpSchema } from "@/dto/finance.dto";
import { checkEditPassword } from "@/lib/editAuth";
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

export async function PATCH(req: NextRequest) {
  const parsed = updateOpSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(await checkEditPassword(parsed.data.password))) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
  }
  return NextResponse.json(await financeService.updateOp(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  return NextResponse.json(await financeService.deleteOp(id));
}
