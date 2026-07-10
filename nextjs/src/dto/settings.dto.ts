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
});
export type PatchDirInput = z.infer<typeof patchDirSchema>;
