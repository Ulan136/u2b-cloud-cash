import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { finAccounts, finFavs } from "@/db/schema";

export async function GET() {
  const accounts = await db
    .select({ id: finAccounts.id, name: finAccounts.name })
    .from(finAccounts);
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = await db.select().from(finFavs).orderBy(asc(finFavs.id));
  const favs = rows.map((f) => ({
    ...f,
    amount: Number(f.amount),
    accountName: f.accountId != null ? nameById.get(f.accountId) ?? null : null,
  }));
  return NextResponse.json({ favs });
}

const schema = z.object({
  name: z.string().trim().min(1, "название обязательно"),
  accountId: z.number().int(),
  type: z.enum(["Приход", "Расход"]),
  amount: z.number().nonnegative().optional().default(0),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const f = parsed.data;
  const [created] = await db
    .insert(finFavs)
    .values({
      name: f.name,
      accountId: f.accountId,
      type: f.type,
      amount: String(f.amount),
    })
    .returning();
  return NextResponse.json({ fav: created });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  await db.delete(finFavs).where(eq(finFavs.id, id));
  return NextResponse.json({ ok: true });
}
