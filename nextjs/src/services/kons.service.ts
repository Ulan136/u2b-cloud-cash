import { money } from "@/lib/money";
import type { CreateKonsInput, UpdateKonsInput } from "@/dto/kons.dto";
import * as konsRepo from "@/repositories/kons.repo";

// Правая панель — постоянный список поставщиков с ОСТАТКОМ за всё время.
// entries — журнал за выбранный период (левая часть).
export async function getAnalysis(opts: { from?: string; to?: string }) {
  const balancesRaw = await konsRepo.balancesRaw(); // остаток всегда за всё время
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

  const entries =
    opts.from && opts.to ? await konsRepo.findInPeriod(opts.from, opts.to) : [];

  return { balances, totalOstatok, suppliers, entries };
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

// Изменение суммы/комментария записи; остаток за всё время пересчитывается из строк kons.
export async function updateEntry(input: UpdateKonsInput) {
  const [entry] = await konsRepo.updateById(input.id, {
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
