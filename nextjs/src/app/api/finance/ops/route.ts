import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { finAccounts, finOps } from "@/db/schema";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["Приход", "Расход", "Перевод"] as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const accountId = sp.get("accountId");

  const conds = [];
  if (from && DATE_RE.test(from)) conds.push(gte(finOps.date, from));
  if (to && DATE_RE.test(to)) conds.push(lte(finOps.date, to));
  if (accountId && Number.isInteger(Number(accountId)))
    conds.push(eq(finOps.accountId, Number(accountId)));

  const accounts = await db
    .select({ id: finAccounts.id, name: finAccounts.name })
    .from(finAccounts);
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = await db
    .select()
    .from(finOps)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(finOps.date), desc(finOps.id));

  const ops = rows.map((o) => ({
    ...o,
    amount: Number(o.amount),
    accountName: nameById.get(o.accountId) ?? null,
    toAccountName: o.toAccountId != null ? nameById.get(o.toAccountId) ?? null : null,
  }));

  return NextResponse.json({ ops });
}

const schema = z
  .object({
    date: z.string().regex(DATE_RE),
    name: z.string().optional().default(""),
    accountId: z.number().int(),
    type: z.enum(TYPES),
    amount: z.number().positive("сумма должна быть больше нуля"),
    comment: z.string().optional().default(""),
    toAccountId: z.number().int().nullable().optional(),
  })
  .refine((d) => d.type !== "Перевод" || (d.toAccountId != null && d.toAccountId !== d.accountId), {
    message: "Для перевода нужен другой счёт назначения",
    path: ["toAccountId"],
  });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const o = parsed.data;
  const [created] = await db
    .insert(finOps)
    .values({
      date: o.date,
      name: o.name || null,
      accountId: o.accountId,
      type: o.type,
      amount: String(Math.round(o.amount * 100) / 100),
      comment: o.comment || null,
      toAccountId: o.type === "Перевод" ? o.toAccountId ?? null : null,
    })
    .returning();
  return NextResponse.json({ op: created });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  await db.delete(finOps).where(eq(finOps.id, id));
  return NextResponse.json({ ok: true });
}
