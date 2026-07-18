import { BadRequestError, ConflictError } from "@/lib/errors";
import { EDIT_PASSWORD_KEY, getEditPassword } from "@/lib/editAuth";
import type { CreateDirInput, PatchDirInput, ShiftSettingsInput } from "@/dto/settings.dto";
import * as clientsRepo from "@/repositories/clients.repo";
import * as employeesRepo from "@/repositories/employees.repo";
import * as suppliersRepo from "@/repositories/suppliers.repo";
import * as appSettingsRepo from "@/repositories/appSettings.repo";

type DirRow = {
  id: number;
  name: string;
  phone: string | null;
  comment: string | null;
  archived: boolean | null;
  hidden?: boolean | null;
};

const shape = (r: DirRow, opsCount: number) => ({
  id: r.id,
  name: r.name,
  phone: r.phone ?? "",
  comment: r.comment ?? "",
  archived: !!r.archived,
  hidden: !!r.hidden,
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
  if (input.hidden !== undefined) set.hidden = input.hidden; // только у работников
  if (Object.keys(set).length) await employeesRepo.update(input.id, set);
  return { ok: true };
}

// ── СМЕНА: время автозакрытия ──
const DEFAULT_SHIFT_HOUR = 21;

export async function getShiftSettings() {
  const rows = await appSettingsRepo.all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const hourRaw = map.get("shift_close_hour");
  const hour = hourRaw != null && /^\d+$/.test(hourRaw) ? Number(hourRaw) : DEFAULT_SHIFT_HOUR;
  const enabled = map.get("shift_auto_enabled") !== "0"; // по умолчанию включено
  return { hour: Math.min(23, Math.max(0, hour)), enabled };
}

export async function setShiftSettings(input: ShiftSettingsInput) {
  if (input.hour !== undefined) await appSettingsRepo.upsert("shift_close_hour", String(input.hour));
  if (input.enabled !== undefined)
    await appSettingsRepo.upsert("shift_auto_enabled", input.enabled ? "1" : "0");
  return getShiftSettings();
}

// ── БЕЗОПАСНОСТЬ: пароль изменения записей ──
export async function getSecuritySettings() {
  return { editPassword: await getEditPassword() };
}

export async function setEditPassword(password: string) {
  await appSettingsRepo.upsert(EDIT_PASSWORD_KEY, password);
  return { ok: true, editPassword: password };
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
