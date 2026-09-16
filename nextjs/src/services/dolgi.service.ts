import { money, num } from "@/lib/money";
import { BadRequestError } from "@/lib/errors";
import { DATE_RE } from "@/lib/validation";
import type { CreateClientInput, CreateDebtInput, UpdateDebtInput } from "@/dto/dolgi.dto";
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

// История долгов за один день (все клиенты) — левая панель, когда клиент не выбран.
export async function getDayHistory(date: string) {
  const dayHistory = await debtsRepo.entriesByDate(date);
  return { dayHistory };
}

// Округление до копеек — убирает шум float при сравнении остатка с нулём.
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function createEntry(input: CreateDebtInput, author: string | null = null) {
  const returnDate =
    input.returnDate && DATE_RE.test(input.returnDate.trim())
      ? input.returnDate.trim()
      : null;

  // Остаток клиента не должен уйти в минус — КРОМЕ случая осознанной предоплаты
  // (фронт спрашивает «Это предоплата?» и присылает prepayment:true).
  const debt = num(input.debtAmount);
  const payment = num(input.paymentAmount);
  const [totals] = await debtsRepo.clientTotals(input.clientId);
  const currentOstatok = num(totals?.debt) - num(totals?.payment);
  const newOstatok = r2(currentOstatok + debt - payment);
  const goesNegative = newOstatok < 0;
  if (goesNegative && !input.prepayment) {
    const maxPay = r2(currentOstatok + debt);
    throw new BadRequestError(
      `Остаток ушёл бы в минус (${newOstatok}). Долг клиента сейчас ${r2(
        currentOstatok
      )}, максимум к оплате ${maxPay}. Если это предоплата — подтвердите.`
    );
  }

  const [created] = await debtsRepo.create({
    date: input.date,
    clientId: input.clientId,
    debtAmount: money(input.debtAmount),
    paymentAmount: money(input.paymentAmount),
    comment: input.comment ?? "",
    returnDate,
    // помечаем предоплатой только когда операция реально уводит в минус
    prepayment: goesNegative && input.prepayment === true,
    author,
  });
  return { entry: created };
}

// Изменение суммы/комментария записи. Остаток «за всё время» пересчитывается
// автоматически, т.к. он агрегируется из строк debts при следующей загрузке.
export async function updateEntry(input: UpdateDebtInput) {
  const [updated] = await debtsRepo.updateById(input.id, {
    debtAmount: money(input.debtAmount),
    paymentAmount: money(input.paymentAmount),
    comment: input.comment ?? "",
  });
  return { entry: updated };
}

export async function deleteEntry(id: number) {
  await debtsRepo.deleteById(id);
  return { ok: true };
}

export async function listClients() {
  const rows = await clientsRepo.all();
  // Архивные клиенты скрыты из выпадающих списков форм (история операций сохраняется).
  return { clients: rows.filter((r) => !r.archived) };
}

export async function createClient(input: CreateClientInput) {
  const [created] = await clientsRepo.create({
    name: input.name,
    phone: input.phone || null,
  });
  return { client: created };
}
