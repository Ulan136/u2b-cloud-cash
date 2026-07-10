import { directoryRoute } from "@/lib/directoryRoute";
import * as settings from "@/services/settings.service";

const handlers = directoryRoute({
  get: settings.getEmployees,
  create: settings.createEmployee,
  update: settings.updateEmployee,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
