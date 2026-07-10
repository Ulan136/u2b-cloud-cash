import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const reportQuerySchema = z.object({
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
