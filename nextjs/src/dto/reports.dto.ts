import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const reportQuerySchema = z.object({
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const monthlyCostSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  sebestoimost: z.string(),
});
export type MonthlyCostInput = z.infer<typeof monthlyCostSchema>;
