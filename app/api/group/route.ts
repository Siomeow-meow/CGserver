import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError } from "@/lib/http";
import { cleanStringArray } from "@/lib/posts";
import { groupInclude, shapeGroup } from "@/lib/groups";

export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const body = await readJson(req);
    if (!body) return fail(req, "Invalid JSON body", 400);

    const groupName = typeof body.groupName === "string" ? body.groupName.trim() : "";
    const description = typeof body.description === "string" ? body.description : "";
    const groupImg = typeof body.groupImg === "string" ? body.groupImg : "";
    const bannerImg = typeof body.bannerImg === "string" ? body.bannerImg : "";

    if (!groupName || !groupImg || !bannerImg) {
      return fail(req, "Group name, icon and banner are required", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(req, "Your profile has not been set up yet", 400);

    const taken = await prisma.group.findUnique({ where: { groupName } });
    if (taken) return fail(req, "A group with that name already exists", 409);

    const group = await prisma.group.create({
      data: {
        groupName,
        description,
        groupImg,
        bannerImg,
        groupThemes: cleanStringArray(body.groupThemes),
        allowAnonymity: body.allowAnonymity === true,
        groupMembers: { create: { memberId: userId, role: "admin" } },
      },
      include: groupInclude(userId),
    });

    return json(req, shapeGroup(group), 201);
  } catch (error) {
    return serverError(req, "POST /api/group", error);
  }
}

/** All groups, or with ?memberId= only the groups that user belongs to. */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const memberId = new URL(req.url).searchParams.get("memberId");
    const groups = await prisma.group.findMany({
      where: memberId ? { groupMembers: { some: { memberId } } } : undefined,
      include: groupInclude(userId),
      orderBy: { groupName: "asc" },
    });

    return json(req, groups.map(shapeGroup));
  } catch (error) {
    return serverError(req, "GET /api/group", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
