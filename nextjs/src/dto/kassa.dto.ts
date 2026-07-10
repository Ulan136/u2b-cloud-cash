import { z } from "zod";
import { DATE_RE } from "@/lib/validation";

export const saveDaySchema = z.object({
  date: z.string().regex(DATE_RE),
  day: z.object({
    klaudObshch: z.string(),
    nalichnye: z.string(),
    kaspi: z.string(),
    halyk: z.string(),
    inkasNalichka: z.string(),
    vozvrat: z.string(),
    zakupTovar: z.string(),
    comment: z.string().optional().default(""),
  }),
  expenses: z.array(
    z.object({
      category: z.string().min(1),
      amount: z.string(),
      comment: z.string().optional().default(""),
    })
  ),
  action: z.enum(["save", "close", "reopen"]).optional().default("save"),
});
export type SaveDayInput = z.infer<typeof saveDaySchema>;

export const patchSebestoimostSchema = z.object({
  date: z.string().regex(DATE_RE),
  sebestoimost: z.string(),
});
export type PatchSebestoimostInput = z.infer<typeof patchSebestoimostSchema>;
