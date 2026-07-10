import { NextRequest, NextResponse } from "next/server";
import { BadRequestError, ConflictError } from "@/lib/errors";
import {
  createDirSchema,
  patchDirSchema,
  type CreateDirInput,
  type PatchDirInput,
} from "@/dto/settings.dto";

type DirectoryService = {
  get: (includeArchived: boolean) => Promise<unknown>;
  create: (input: CreateDirInput) => Promise<unknown>;
  update: (input: PatchDirInput) => Promise<unknown>;
};

// Тонкий контроллер справочника: GET (список), POST (создать), PATCH (изменить/архивировать).
export function directoryRoute(svc: DirectoryService) {
  async function GET(req: NextRequest) {
    const includeArchived = req.nextUrl.searchParams.get("archived") === "1";
    return NextResponse.json(await svc.get(includeArchived));
  }

  async function POST(req: NextRequest) {
    const parsed = createDirSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    try {
      return NextResponse.json(await svc.create(parsed.data));
    } catch (e) {
      if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
      throw e;
    }
  }

  async function PATCH(req: NextRequest) {
    const parsed = patchDirSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    try {
      return NextResponse.json(await svc.update(parsed.data));
    } catch (e) {
      if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
      if (e instanceof BadRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  }

  return { GET, POST, PATCH };
}
