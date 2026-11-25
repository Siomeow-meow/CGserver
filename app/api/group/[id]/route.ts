import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  currentUserId,
  fail,
  json,
  options,
  readJson,
  serverError,
  toId,
} from "@/lib/http";
import { cleanStringArray } from "@/lib/posts";
import { groupInclude, isGroupAdmin, shapeGroup } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid group id", 400);

    const group = await prisma.group.findUnique({
      where: { id },
      include: groupInclude(userId),
    });
    if (!group) return fail(req, "Group not found", 404);

    return json(req, shapeGroup(group));
  } catch (error) {
    return serverError(req, "GET /api/group/[id]", error);
  }
}

/** Edits group details. Admins only. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid group id", 400);

    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return fail(req, "Group not found", 404);
    if (!(await isGroupAdmin(userId, id))) {
      return fail(req, "Only group admins can edit this group", 403);
    }

    const body = await readJson(req);
    if (!body) return fail(req, "Invalid JSON body", 400);

    const data: {
      groupName?: string;
      description?: string;
      groupImg?: string;
      bannerImg?: string;
      groupThemes?: string[];
      allowAnonymity?: boolean;
    } = {};
    if (typeof body.groupName === "string") {
      const name = body.groupName.trim();
      if (!name) return fail(req, "Group name cannot be empty", 400);
      if (name !== group.groupName) {
        const taken = await prisma.group.findUnique({ where: { groupName: name } });
        if (taken) return fail(req, "A group with that name already exists", 409);
      }
      data.groupName = name;
    }
    if (typeof body.description === "string") data.description = body.description;
    if (typeof body.groupImg === "string" && body.groupImg) data.groupImg = body.groupImg;
    if (typeof body.bannerImg === "string" && body.bannerImg) data.bannerImg = body.bannerImg;
    if (Array.isArray(body.groupThemes)) data.groupThemes = cleanStringArray(body.groupThemes);
    if (typeof body.allowAnonymity === "boolean") data.allowAnonymity = body.allowAnonymity;

    if (Object.keys(data).length === 0) return fail(req, "No change to add", 400);

    const updated = await prisma.group.update({
      where: { id },
      data,
      include: groupInclude(userId),
    });
    return json(req, shapeGroup(updated));
  } catch (error) {
    return serverError(req, "PATCH /api/group/[id]", error);
  }
}

/** Deletes a group and its posts. Admins only. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid group id", 400);

    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) return fail(req, "Group not found", 404);
    if (!(await isGroupAdmin(userId, id))) {
      return fail(req, "Only group admins can delete this group", 403);
    }

    await prisma.group.delete({ where: { id } });
    return json(req, { id, deleted: true });
  } catch (error) {
    return serverError(req, "DELETE /api/group/[id]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, PATCH, DELETE");
}
