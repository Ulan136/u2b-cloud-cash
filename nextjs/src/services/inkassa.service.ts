import { money, num } from "@/lib/money";
import type { CreateInkassaInput, UpdateInkassaInput } from "@/dto/inkassa.dto";
import * as incassationRepo from "@/repositories/incassation.repo";

// operation в БД NOT NULL, но в «Жаке инк» не используется — пишем туда
// комментарий (или метку по умолчанию), чтобы не падал INSERT.
const opFor = (comment?: string | null) => (comment?.trim() || "инкассация");

// Журнал «Жаке инк» за период + итоги по способам оплаты.
export async function getJournal(opts: { from: string; to: string }) {
  const entries = await incassationRepo.findInPeriod(opts.from, opts.to);
  const totals = entries.reduce(
    (acc, e) => {
      acc.cash += num(e.cash);
      acc.kaspi += num(e.kaspi);
      acc.halyk += num(e.halyk);
      return acc;
    },
    { cash: 0, kaspi: 0, halyk: 0 }
  );
  const total = totals.cash + totals.kaspi + totals.halyk;
  return { entries, totals: { ...totals, total } };
}

export async function createEntry(input: CreateInkassaInput) {
  const [entry] = await incassationRepo.create({
    date: input.date,
    operation: opFor(input.comment),
    cash: money(input.cash),
    kaspi: money(input.kaspi),
    halyk: money(input.halyk),
    comment: input.comment ?? "",
  });
  return { entry };
}

export async function updateEntry(input: UpdateInkassaInput) {
  const [entry] = await incassationRepo.updateById(input.id, {
    operation: opFor(input.comment),
    cash: money(input.cash),
    kaspi: money(input.kaspi),
    halyk: money(input.halyk),
    comment: input.comment ?? "",
  });
  return { entry };
}

export async function deleteEntry(id: number) {
  await incassationRepo.deleteById(id);
  return { ok: true };
}
