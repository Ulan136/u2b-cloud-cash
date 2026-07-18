import { NextRequest, NextResponse } from "next/server";
import { DATE_RE } from "@/lib/validation";
import { createSalarySchema, updateSalarySchema } from "@/dto/salary.dto";
import { checkEditPassword } from "@/lib/editAuth";
import * as salaryService from "@/services/salary.service";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // История конкретного сотрудника
  const employee = sp.get("employee");
  if (employee) {
    return NextResponse.json(await salaryService.getEmployeeHistory(employee));
  }

  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from и to (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  return NextResponse.json(await salaryService.getReport(from, to, sp.get("date")));
}

export async function POST(req: NextRequest) {
  const parsed = createSalarySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json(await salaryService.createEntry(parsed.data));
}

export async function PATCH(req: NextRequest) {
  const parsed = updateSalarySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(await checkEditPassword(parsed.data.password))) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
  }
  return NextResponse.json(await salaryService.updateEntry(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }
  return NextResponse.json(await salaryService.deleteEntry(id));
}
