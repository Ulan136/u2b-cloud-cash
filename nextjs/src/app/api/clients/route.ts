import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(clients).orderBy(asc(clients.name));
  return NextResponse.json({ clients: rows });
}

const clientSchema = z.object({
  name: z.string().trim().min(1, "имя обязательно"),
  phone: z.string().trim().optional().default(""),
});

export async function POST(req: NextRequest) {
  const parsed = clientSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, phone } = parsed.data;
  const [created] = await db
    .insert(clients)
    .values({ name, phone: phone || null })
    .returning();
  return NextResponse.json({ client: created });
}
