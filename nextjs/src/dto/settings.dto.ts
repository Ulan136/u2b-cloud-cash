import { z } from "zod";

export const createDirSchema = z.object({
  name: z.string().trim().min(1, "имя обязательно"),
  phone: z.string().trim().optional().default(""),
  comment: z.string().trim().optional().default(""),
});
export type CreateDirInput = z.infer<typeof createDirSchema>;

export const patchDirSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  comment: z.string().optional(),
  archived: z.boolean().optional(),
  hidden: z.boolean().optional(), // только для работников
});
export type PatchDirInput = z.infer<typeof patchDirSchema>;

export const shiftSettingsSchema = z.object({
  hour: z.number().int().min(0).max(23).optional(),
  enabled: z.boolean().optional(),
});
export type ShiftSettingsInput = z.infer<typeof shiftSettingsSchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "название обязательно"),
  icon: z.string().optional().default(""),
  color: z.string().optional().default("#64748b"),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const patchCategorySchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});
export type PatchCategoryInput = z.infer<typeof patchCategorySchema>;
