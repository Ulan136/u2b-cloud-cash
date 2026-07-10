import { money } from "@/lib/money";
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
  const { date, day, expenses } = input;

  const values = {
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
  const { date: _d, ...set } = values;
  await cashDaysRepo.upsert(values, set);

  // расходы дня переписываем целиком (add/edit/delete одним махом)
  await expensesRepo.deleteByDate(date);
  const rows = expenses
    .filter((e) => e.amount !== "" && e.category)
    .map((e) => ({
      date,
      category: e.category,
      amount: money(e.amount),
      comment: e.comment ?? "",
    }));
  if (rows.length) {
    await expensesRepo.insertMany(rows);
  }

  return { ok: true };
}

export async function setSebestoimost(date: string, sebestoimost: string) {
  const val = money(sebestoimost);
  await cashDaysRepo.upsert({ date, sebestoimost: val }, { sebestoimost: val });
  return { ok: true };
}
