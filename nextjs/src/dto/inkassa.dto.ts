import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const createInkassaSchema = z.object({
  date: z.string().regex(DATE_RE),
  cash: z.string().optional().default("0"),
  kaspi: z.string().optional().default("0"),
  halyk: z.string().optional().default("0"),
  comment: z.string().optional().default(""),
});
export type CreateInkassaInput = z.infer<typeof createInkassaSchema>;

export const updateInkassaSchema = z.object({
  id: z.number().int(),
  cash: z.string().optional().default("0"),
  kaspi: z.string().optional().default("0"),
  halyk: z.string().optional().default("0"),
  comment: z.string().optional().default(""),
  password: z.string(),
});
export type UpdateInkassaInput = z.infer<typeof updateInkassaSchema>;
