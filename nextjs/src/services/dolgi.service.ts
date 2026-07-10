import { money } from "@/lib/money";
import { DATE_RE } from "@/lib/validation";
import type { CreateClientInput, CreateDebtInput } from "@/dto/dolgi.dto";
import * as debtsRepo from "@/repositories/debts.repo";
import * as clientsRepo from "@/repositories/clients.repo";

// Анализ остатков по клиентам (правая панель). Период опционален (по умолчанию всё время).
// overdue — у клиента есть просроченная дата возврата и при этом он ещё должен.
export async function getAnalysis(opts: { from?: string; to?: string; today: string }) {
  const balancesRaw = await debtsRepo.clientBalancesRaw(opts);
  const balances = balancesRaw
    .map((b) => {
      const d = Number(b.debts);
      const p = Number(b.payments);
      const ostatok = d - p;
      return {
        id: b.id,
        name: b.name,
        debts: d,
        payments: p,
        ostatok,
        overdue: b.hasOverdue === true && ostatok > 0,
      };
    })
    .filter((b) => b.debts !== 0 || b.payments !== 0)
    .sort((a, b) => b.ostatok - a.ostatok);

  const totalOstatok = balances.reduce((s, b) => s + b.ostatok, 0);

  return { balances, totalOstatok };
}

export async function getClientHistory(clientId: number) {
  const history = await debtsRepo.historyByClient(clientId);
  return { history };
}

export async function createEntry(input: CreateDebtInput) {
  const returnDate =
    input.returnDate && DATE_RE.test(input.returnDate.trim())
      ? input.returnDate.trim()
      : null;

  const [created] = await debtsRepo.create({
    date: input.date,
    clientId: input.clientId,
    debtAmount: money(input.debtAmount),
    paymentAmount: money(input.paymentAmount),
    comment: input.comment ?? "",
    returnDate,
  });
  return { entry: created };
}

export async function deleteEntry(id: number) {
  await debtsRepo.deleteById(id);
  return { ok: true };
}

export async function listClients() {
  const rows = await clientsRepo.all();
  return { clients: rows };
}

export async function createClient(input: CreateClientInput) {
  const [created] = await clientsRepo.create({
    name: input.name,
    phone: input.phone || null,
  });
  return { client: created };
}
