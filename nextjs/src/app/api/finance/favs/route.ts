import { NextRequest, NextResponse } from "next/server";
import { createFavSchema } from "@/dto/finance.dto";
import * as financeService from "@/services/finance.service";

export async function GET() {
  return NextResponse.json(await financeService.getFavs());
}

export async function POST(req: NextRequest) {
  const parsed = createFavSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await financeService.createFav(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  return NextResponse.json(await financeService.deleteFav(id));
}
