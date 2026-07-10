import { directoryRoute } from "@/lib/directoryRoute";
import * as settings from "@/services/settings.service";

const handlers = directoryRoute({
  get: settings.getSuppliers,
  create: settings.createSupplier,
  update: settings.updateSupplier,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
