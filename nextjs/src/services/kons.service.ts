import { money } from "@/lib/money";
import type { CreateKonsInput } from "@/dto/kons.dto";
import * as konsRepo from "@/repositories/kons.repo";

export async function getByPeriod(from: string, to: string) {
  const entries = await konsRepo.findInPeriod(from, to);

  // Остатки по поставщикам (аналог QUERY-формулы J7), за всё время
  const balancesRaw = await konsRepo.balancesRaw();
  const balances = balancesRaw
    .map((b) => {
      const prihod = Number(b.prihod);
      const rashod = Number(b.rashod);
      return { supplier: b.supplier, prihod, rashod, ostatok: prihod - rashod };
    })
    .filter((b) => b.prihod !== 0 || b.rashod !== 0)
    .sort((a, b) => b.ostatok - a.ostatok);

  const totalOstatok = balances.reduce((s, b) => s + b.ostatok, 0);

  const supRows = await konsRepo.distinctSuppliers();
  const suppliers = supRows.map((r) => r.supplier);

  return { entries, balances, totalOstatok, suppliers };
}

export async function getSupplierHistory(supplier: string) {
  const history = await konsRepo.historyBySupplier(supplier);
  return { history };
}

export async function createEntry(input: CreateKonsInput) {
  const [entry] = await konsRepo.create({
    date: input.date,
    supplier: input.supplier,
    prihod: money(input.prihod),
    rashod: money(input.rashod),
    comment: input.comment ?? "",
  });
  return { entry };
}

export async function deleteEntry(id: number) {
  await konsRepo.deleteById(id);
  return { ok: true };
}
