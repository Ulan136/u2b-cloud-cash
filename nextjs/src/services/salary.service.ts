import { money } from "@/lib/money";
import { DATE_RE } from "@/lib/validation";
import type { CreateSalaryInput, UpdateSalaryInput } from "@/dto/salary.dto";
import * as salaryRepo from "@/repositories/salary.repo";

export async function getReport(from: string, to: string, date: string | null) {
  const entries = await salaryRepo.findInPeriod(from, to);

  // Сводка по сотрудникам за период (аналог SUMIFS H6:H24) + кол-во выплат
  const byEmpRaw = await salaryRepo.totalsByEmployee(from, to);
  const byEmployee = byEmpRaw
    .map((r) => ({ employee: r.employee, total: Number(r.total), count: Number(r.count) }))
    .sort((a, b) => b.total - a.total);
  const totalPeriod = byEmployee.reduce((s, e) => s + e.total, 0);

  // ЗП за выбранную дату
  let dayTotal = 0;
  if (date && DATE_RE.test(date)) {
    const [d] = await salaryRepo.dayTotal(date);
    dayTotal = Number(d.t);
  }

  // Подсказки — ранее введённые имена
  const empRows = await salaryRepo.distinctEmployees();
  const employees = empRows.map((r) => r.employee);

  return { entries, byEmployee, totalPeriod, dayTotal, employees };
}

export async function getEmployeeHistory(employee: string) {
  const history = await salaryRepo.historyByEmployee(employee);
  return { history };
}

export async function createEntry(input: CreateSalaryInput) {
  const [entry] = await salaryRepo.create({
    date: input.date,
    employee: input.employee,
    amount: money(input.amount),
    comment: input.comment ?? "",
  });
  return { entry };
}

export async function updateEntry(input: UpdateSalaryInput) {
  const [entry] = await salaryRepo.updateById(input.id, {
    amount: money(input.amount),
    comment: input.comment ?? "",
  });
  return { entry };
}

export async function deleteEntry(id: number) {
  await salaryRepo.deleteById(id);
  return { ok: true };
}
