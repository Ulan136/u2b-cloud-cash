import { money, num } from "@/lib/money";
import type { SaveDayInput } from "@/dto/kassa.dto";
import * as cashDaysRepo from "@/repositories/cashDays.repo";
import * as expensesRepo from "@/repositories/expenses.repo";
import * as debtsRepo from "@/repositories/debts.repo";

// ── чистые доменные формулы (лист «Касса», ячейки C7 и C17) ──
export interface ObshchRealInput {
  nal: number;
  kas: number;
  hal: number;
  rashod: number;
  zakup: number;
  inkas: number;
  debt: number;
  vozvrat: number;
  vozvratDolg: number;
}

export function computeObshchReal(v: ObshchRealInput): number {
  return (
    v.nal + v.kas + v.hal + (v.rashod + v.zakup + v.inkas + v.debt + v.vozvrat) - v.vozvratDolg
  );
}

export function computeMinPlus(obshchReal: number, klaud: number): number {
  return Math.round((obshchReal - klaud) * 100) / 100;
}

// ── use-cases ──
export async function getDay(date: string) {
  const [day] = await cashDaysRepo.findByDate(date);
  const expenses = await expensesRepo.findByDate(date);
  const [totals] = await debtsRepo.dayTotals(date);
  return { day: day ?? null, expenses, totals };
}

export async function saveDay(input: SaveDayInput) {
  const { date, day, expenses, action } = input;

  const base = {
    date,
    klaudObshch: money(day.klaudObshch),
    nalichnye: money(day.nalichnye),
    kaspi: money(day.kaspi),
    halyk: money(day.halyk),
    inkasNalichka: money(day.inkasNalichka),
    vozvrat: money(day.vozvrat),
    zakupTovar: money(day.zakupTovar),
    comment: day.comment ?? "",
  };
  // «Сохранить» не трогает статус смены; «Закрыть»/«Переоткрыть» его меняют.
  const values =
    action === "close"
      ? { ...base, closed: true, closedAt: new Date(), closedBy: "manual" }
      : action === "reopen"
        ? { ...base, closed: false, closedAt: null, closedBy: null }
        : base;
  const { date: _d, ...set } = values;
  await cashDaysRepo.upsert(values, set);

  // Расходы дня переписываем целиком: категория+дата уникальны, нулевая/пустая
  // сумма означает удаление записи категории за день (не вставляем её).
  await expensesRepo.deleteByDate(date);
  const rows = expenses
    .filter((e) => e.category && num(e.amount) !== 0)
    .map((e) => ({
      date,
      category: e.category,
      amount: money(e.amount),
      comment: e.comment ?? "",
    }));
  if (rows.length) {
    await expensesRepo.insertMany(rows);
  }

  return { ok: true, closed: action === "close" ? true : action === "reopen" ? false : undefined };
}

// Автозакрытие смены (Vercel Cron в 21:00 Алматы).
// Если день не закрыт — закрыть как auto; если записи нет — создать пустую закрытую.
export async function autoCloseToday(today: string) {
  const [existing] = await cashDaysRepo.findByDate(today);
  if (existing?.closed) {
    return { status: "already-closed", date: today };
  }
  const now = new Date();
  await cashDaysRepo.upsert(
    { date: today, closed: true, closedAt: now, closedBy: "auto" },
    { closed: true, closedAt: now, closedBy: "auto" }
  );
  return { status: existing ? "closed" : "created-closed", date: today };
}

// Архив дней: последние дни с кассой + их МИН/ПЛЮС (новые сверху).
export async function listRecentDays(from: string, to: string) {
  const [days, expenses, debtRows] = await Promise.all([
    cashDaysRepo.findInPeriod(from, to),
    expensesRepo.findInPeriod(from, to),
    debtsRepo.findInPeriod(from, to),
  ]);

  const expByDate = new Map<string, number>();
  for (const e of expenses) {
    expByDate.set(e.date, (expByDate.get(e.date) ?? 0) + num(e.amount));
  }
  const debtByDate = new Map<string, { debt: number; payment: number }>();
  for (const d of debtRows) {
    const c = debtByDate.get(d.date) ?? { debt: 0, payment: 0 };
    c.debt += num(d.debtAmount);
    c.payment += num(d.paymentAmount);
    debtByDate.set(d.date, c);
  }

  const list = days
    .map((day) => {
      const klaud = num(day.klaudObshch);
      const dd = debtByDate.get(day.date) ?? { debt: 0, payment: 0 };
      const obshchReal = computeObshchReal({
        nal: num(day.nalichnye),
        kas: num(day.kaspi),
        hal: num(day.halyk),
        rashod: expByDate.get(day.date) ?? 0,
        zakup: num(day.zakupTovar),
        inkas: num(day.inkasNalichka),
        debt: dd.debt,
        vozvrat: num(day.vozvrat),
        vozvratDolg: dd.payment,
      });
      return { date: day.date, klaud, minPlus: computeMinPlus(obshchReal, klaud) };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return { days: list };
}

export async function setSebestoimost(date: string, sebestoimost: string) {
  const val = money(sebestoimost);
  await cashDaysRepo.upsert({ date, sebestoimost: val }, { sebestoimost: val });
  return { ok: true };
}
