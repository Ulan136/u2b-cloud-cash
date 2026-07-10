import { NextRequest, NextResponse } from "next/server";
import { createClientSchema } from "@/dto/dolgi.dto";
import * as dolgiService from "@/services/dolgi.service";

export async function GET() {
  return NextResponse.json(await dolgiService.listClients());
}

export async function POST(req: NextRequest) {
  const parsed = createClientSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await dolgiService.createClient(parsed.data));
}
