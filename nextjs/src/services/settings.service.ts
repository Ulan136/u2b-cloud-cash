import { BadRequestError, ConflictError } from "@/lib/errors";
import type { CreateDirInput, PatchDirInput } from "@/dto/settings.dto";
import * as clientsRepo from "@/repositories/clients.repo";
import * as employeesRepo from "@/repositories/employees.repo";
import * as suppliersRepo from "@/repositories/suppliers.repo";

type DirRow = {
  id: number;
  name: string;
  phone: string | null;
  comment: string | null;
  archived: boolean | null;
};

const shape = (r: DirRow, opsCount: number) => ({
  id: r.id,
  name: r.name,
  phone: r.phone ?? "",
  comment: r.comment ?? "",
  archived: !!r.archived,
  opsCount,
});

function patchFields(input: PatchDirInput) {
  const set: Record<string, unknown> = {};
  if (input.phone !== undefined) set.phone = input.phone || null;
  if (input.comment !== undefined) set.comment = input.comment || null;
  if (input.archived !== undefined) set.archived = input.archived;
  return set;
}

// ── КЛИЕНТЫ (счёт операций по id, имя без каскада — ссылки по client_id) ──
export async function getClients(includeArchived: boolean) {
  const [rows, counts] = await Promise.all([clientsRepo.all(), clientsRepo.opCounts()]);
  const cmap = new Map(counts.map((c) => [c.id, Number(c.n)]));
  const items = rows
    .filter((r) => includeArchived || !r.archived)
    .map((r) => shape(r, cmap.get(r.id) ?? 0));
  return { items };
}

export async function createClient(input: CreateDirInput) {
  const [item] = await clientsRepo.create({
    name: input.name,
    phone: input.phone || null,
    comment: input.comment || null,
    archived: false,
  });
  return { item };
}

export async function updateClient(input: PatchDirInput) {
  const [cur] = await clientsRepo.findById(input.id);
  if (!cur) throw new BadRequestError("клиент не найден");
  const set = patchFields(input);
  if (input.name !== undefined) set.name = input.name; // без каскада (FK по id)
  if (Object.keys(set).length) await clientsRepo.update(input.id, set);
  return { ok: true };
}

// ── РАБОТНИКИ (счёт по имени в salary, переименование каскадом) ──
export async function getEmployees(includeArchived: boolean) {
  const [rows, counts] = await Promise.all([employeesRepo.all(), employeesRepo.opCounts()]);
  const cmap = new Map(counts.map((c) => [c.name, Number(c.n)]));
  const items = rows
    .filter((r) => includeArchived || !r.archived)
    .map((r) => shape(r, cmap.get(r.name) ?? 0));
  return { items };
}

export async function createEmployee(input: CreateDirInput) {
  try {
    const [item] = await employeesRepo.create({
      name: input.name,
      phone: input.phone || null,
      comment: input.comment || null,
      archived: false,
    });
    return { item };
  } catch {
    throw new ConflictError("Работник с таким именем уже есть");
  }
}

export async function updateEmployee(input: PatchDirInput) {
  const [cur] = await employeesRepo.findById(input.id);
  if (!cur) throw new BadRequestError("работник не найден");
  if (input.name !== undefined && input.name !== cur.name) {
    try {
      await employeesRepo.renameCascade(input.id, input.name, cur.name);
    } catch {
      throw new ConflictError("Работник с таким именем уже есть");
    }
  }
  const set = patchFields(input);
  if (Object.keys(set).length) await employeesRepo.update(input.id, set);
  return { ok: true };
}

// ── ПОСТАВЩИКИ (счёт по имени в kons, переименование каскадом) ──
export async function getSuppliers(includeArchived: boolean) {
  const [rows, counts] = await Promise.all([suppliersRepo.all(), suppliersRepo.opCounts()]);
  const cmap = new Map(counts.map((c) => [c.name, Number(c.n)]));
  const items = rows
    .filter((r) => includeArchived || !r.archived)
    .map((r) => shape(r, cmap.get(r.name) ?? 0));
  return { items };
}

export async function createSupplier(input: CreateDirInput) {
  try {
    const [item] = await suppliersRepo.create({
      name: input.name,
      phone: input.phone || null,
      comment: input.comment || null,
      archived: false,
    });
    return { item };
  } catch {
    throw new ConflictError("Поставщик с таким именем уже есть");
  }
}

export async function updateSupplier(input: PatchDirInput) {
  const [cur] = await suppliersRepo.findById(input.id);
  if (!cur) throw new BadRequestError("поставщик не найден");
  if (input.name !== undefined && input.name !== cur.name) {
    try {
      await suppliersRepo.renameCascade(input.id, input.name, cur.name);
    } catch {
      throw new ConflictError("Поставщик с таким именем уже есть");
    }
  }
  const set = patchFields(input);
  if (Object.keys(set).length) await suppliersRepo.update(input.id, set);
  return { ok: true };
}
