import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const OP_TYPES = ["Приход", "Расход", "Перевод"] as const;

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "название обязательно"),
  categoryId: z.number().int().nullable().optional(),
  icon: z.string().optional().default(""),
  initialBalance: z.string().optional().default("0"),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const patchAccountSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1).optional(),
  categoryId: z.number().int().nullable().optional(),
  icon: z.string().optional(),
  initialBalance: z.string().optional(),
  archived: z.boolean().optional(),
});
export type PatchAccountInput = z.infer<typeof patchAccountSchema>;

export const createOpSchema = z
  .object({
    date: z.string().regex(DATE_RE),
    name: z.string().optional().default(""),
    accountId: z.number().int(),
    type: z.enum(OP_TYPES),
    amount: z.number().positive("сумма должна быть больше нуля"),
    comment: z.string().optional().default(""),
    toAccountId: z.number().int().nullable().optional(),
  })
  .refine(
    (d) => d.type !== "Перевод" || (d.toAccountId != null && d.toAccountId !== d.accountId),
    { message: "Для перевода нужен другой счёт назначения", path: ["toAccountId"] }
  );
export type CreateOpInput = z.infer<typeof createOpSchema>;

export const updateOpSchema = z.object({
  id: z.number().int(),
  amount: z.number().positive("сумма должна быть больше нуля"),
  comment: z.string().optional().default(""),
  password: z.string(),
});
export type UpdateOpInput = z.infer<typeof updateOpSchema>;

export const createFavSchema = z.object({
  name: z.string().trim().min(1, "название обязательно"),
  accountId: z.number().int(),
  type: z.enum(["Приход", "Расход"]),
  amount: z.number().nonnegative().optional().default(0),
});
export type CreateFavInput = z.infer<typeof createFavSchema>;
