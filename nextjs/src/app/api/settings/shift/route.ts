import { NextRequest, NextResponse } from "next/server";
import { shiftSettingsSchema } from "@/dto/settings.dto";
import * as settings from "@/services/settings.service";

export async function GET() {
  return NextResponse.json(await settings.getShiftSettings());
}

export async function PATCH(req: NextRequest) {
  const parsed = shiftSettingsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await settings.setShiftSettings(parsed.data));
}
