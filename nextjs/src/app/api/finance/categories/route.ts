import { NextRequest, NextResponse } from "next/server";
import { BadRequestError } from "@/lib/errors";
import { createCategorySchema, patchCategorySchema } from "@/dto/settings.dto";
import * as financeService from "@/services/finance.service";

export async function GET() {
  return NextResponse.json(await financeService.getCategories());
}

export async function POST(req: NextRequest) {
  const parsed = createCategorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await financeService.createCategory(parsed.data));
}

export async function PATCH(req: NextRequest) {
  const parsed = patchCategorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await financeService.updateCategory(parsed.data));
  } catch (e) {
    if (e instanceof BadRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
