import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const createKonsSchema = z.object({
  date: z.string().regex(DATE_RE),
  supplier: z.string().trim().min(1, "поставщик обязателен"),
  prihod: z.string().optional().default("0"),
  rashod: z.string().optional().default("0"),
  comment: z.string().optional().default(""),
});
export type CreateKonsInput = z.infer<typeof createKonsSchema>;

export const updateKonsSchema = z.object({
  id: z.number().int(),
  prihod: z.string().optional().default("0"),
  rashod: z.string().optional().default("0"),
  comment: z.string().optional().default(""),
  password: z.string(),
});
export type UpdateKonsInput = z.infer<typeof updateKonsSchema>;
