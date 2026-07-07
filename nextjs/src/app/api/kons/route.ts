import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { kons } from "@/db/schema";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const money = (v: unknown) =>
  v === "" || v === null || v === undefined ? "0" : String(v);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // История конкретного поставщика
  const supplier = sp.get("supplier");
  if (supplier) {
    const history = await db
      .select({
        id: kons.id,
        date: kons.date,
        prihod: kons.prihod,
        rashod: kons.rashod,
        comment: kons.comment,
      })
      .from(kons)
      .where(eq(kons.supplier, supplier))
      .orderBy(desc(kons.date), desc(kons.id));
    return NextResponse.json({ history });
  }

  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  const period = and(gte(kons.date, from), lte(kons.date, to));

  const entries = await db
    .select()
    .from(kons)
    .where(period)
    .orderBy(desc(kons.date), desc(kons.id));

  // Остатки по поставщикам (аналог QUERY-формулы J7), за всё время
  const balancesRaw = await db
    .select({
      supplier: kons.supplier,
      prihod: sql<string>`COALESCE(SUM(${kons.prihod}), 0)`,
      rashod: sql<string>`COALESCE(SUM(${kons.rashod}), 0)`,
    })
    .from(kons)
    .groupBy(kons.supplier);

  const balances = balancesRaw
    .map((b) => {
      const prihod = Number(b.prihod);
      const rashod = Number(b.rashod);
      return { supplier: b.supplier, prihod, rashod, ostatok: prihod - rashod };
    })
    .filter((b) => b.prihod !== 0 || b.rashod !== 0)
    .sort((a, b) => b.ostatok - a.ostatok);

  const totalOstatok = balances.reduce((s, b) => s + b.ostatok, 0);

  // Подсказки — ранее введённые поставщики
  const supRows = await db
    .selectDistinct({ supplier: kons.supplier })
    .from(kons)
    .orderBy(asc(kons.supplier));
  const suppliers = supRows.map((r) => r.supplier);

  return NextResponse.json({ entries, balances, totalOstatok, suppliers });
}

const schema = z.object({
  date: z.string().regex(DATE_RE),
  supplier: z.string().trim().min(1, "поставщик обязателен"),
  prihod: z.string().optional().default("0"),
  rashod: z.string().optional().default("0"),
  comment: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const e = parsed.data;
  const [entry] = await db
    .insert(kons)
    .values({
      date: e.date,
      supplier: e.supplier,
      prihod: money(e.prihod),
      rashod: money(e.rashod),
      comment: e.comment ?? "",
    })
    .returning();
  return NextResponse.json({ entry });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  await db.delete(kons).where(eq(kons.id, id));
  return NextResponse.json({ ok: true });
}
