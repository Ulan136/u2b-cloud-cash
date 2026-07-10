import { directoryRoute } from "@/lib/directoryRoute";
import * as settings from "@/services/settings.service";

const handlers = directoryRoute({
  get: settings.getClients,
  create: settings.createClient,
  update: settings.updateClient,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
