import { NextRequest, NextResponse } from "next/server";
import { securitySettingsSchema } from "@/dto/settings.dto";
import * as settings from "@/services/settings.service";

export async function GET() {
  return NextResponse.json(await settings.getSecuritySettings());
}

export async function PATCH(req: NextRequest) {
  const parsed = securitySettingsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await settings.setEditPassword(parsed.data.editPassword));
}
