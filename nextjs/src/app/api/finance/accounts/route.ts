import { NextRequest, NextResponse } from "next/server";
import { BadRequestError, ConflictError } from "@/lib/errors";
import { createAccountSchema, patchAccountSchema } from "@/dto/finance.dto";
import * as financeService from "@/services/finance.service";

export async function GET() {
  return NextResponse.json(await financeService.getAccounts());
}

export async function POST(req: NextRequest) {
  const parsed = createAccountSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await financeService.createAccount(parsed.data));
  } catch (e) {
    if (e instanceof ConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  const parsed = patchAccountSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await financeService.updateAccount(parsed.data));
  } catch (e) {
    if (e instanceof BadRequestError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
