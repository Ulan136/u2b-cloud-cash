import { randomBytes } from "node:crypto";
import { num } from "@/lib/money";
import { NotFoundError } from "@/lib/errors";
import * as clientsRepo from "@/repositories/clients.repo";
import * as debtsRepo from "@/repositories/debts.repo";

// Создать (или вернуть существующий) публичный токен онлайн-ссылки клиента.
export async function getOrCreateShareToken(clientId: number) {
  const [client] = await clientsRepo.findById(clientId);
  if (!client) throw new NotFoundError("Клиент не найден");
  if (client.shareToken) return { token: client.shareToken };
  const token = randomBytes(12).toString("base64url");
  const [updated] = await clientsRepo.setShareToken(clientId, token);
  return { token: updated?.shareToken ?? token };
}

// Публичные данные по токену: имя, остаток и история операций клиента.
// Отдаём только безопасный минимум — без телефона/автора/внутренних полей.
export async function getTrackData(token: string) {
  const [client] = await clientsRepo.findByShareToken(token);
  if (!client) throw new NotFoundError("Ссылка не найдена");

  const history = await debtsRepo.historyByClient(client.id);
  let debtSum = 0;
  let paySum = 0;
  const events = history.map((h) => {
    debtSum += num(h.debtAmount);
    paySum += num(h.paymentAmount);
    return {
      date: h.date,
      debt: num(h.debtAmount),
      payment: num(h.paymentAmount),
      comment: h.comment ?? "",
      returnDate: h.returnDate ?? null,
    };
  });
  const ostatok = Math.round((debtSum - paySum) * 100) / 100;

  return { name: client.name, ostatok, events };
}
