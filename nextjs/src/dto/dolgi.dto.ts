import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const createDebtSchema = z.object({
  date: z.string().regex(DATE_RE),
  clientId: z.number().int(),
  debtAmount: z.string().optional().default("0"),
  paymentAmount: z.string().optional().default("0"),
  comment: z.string().optional().default(""),
  returnDate: z.string().optional().nullable(),
});
export type CreateDebtInput = z.infer<typeof createDebtSchema>;

export const createClientSchema = z.object({
  name: z.string().trim().min(1, "имя обязательно"),
  phone: z.string().trim().optional().default(""),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;
