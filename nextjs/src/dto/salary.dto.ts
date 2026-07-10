import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const createSalarySchema = z.object({
  date: z.string().regex(DATE_RE),
  employee: z.string().trim().min(1, "сотрудник обязателен"),
  amount: z.string().min(1, "сумма обязательна"),
  comment: z.string().optional().default(""),
});
export type CreateSalaryInput = z.infer<typeof createSalarySchema>;
