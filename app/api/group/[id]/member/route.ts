import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";
import { notify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Without a body `userId`: joins or leaves the group for the signed-in user.
 * With `{ userId }`: a member adds that person (an invite). New members
 * always get the "member" role; any role in the request body is ignored.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const groupId = toId((await params).id);
    if (!groupId) return fail(req, "Invalid group id", 400);

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return fail(req, "Group not found", 404);

    const body = await readJson(req);
    const inviteeId = typeof body?.userId === "string" ? body.userId : null;
    if (inviteeId && inviteeId !== userId) {
      const inviter = await prisma.groupMember.findUnique({
        where: { memberId_groupId: { memberId: userId, groupId } },
      });
      if (!inviter) return fail(req, "Join the group before inviting people", 403);
      const invitee = await prisma.user.findUnique({ where: { id: inviteeId } });
      if (!invitee) return fail(req, "User not found", 404);
      const already = await prisma.groupMember.findUnique({
        where: { memberId_groupId: { memberId: inviteeId, groupId } },
      });
      if (already) return fail(req, "Already a member", 409);
      await prisma.groupMember.create({
        data: { groupId, memberId: inviteeId, role: "member" },
      });
      await notify({
        userId: inviteeId,
        actorId: userId,
        type: "group_invite",
        content: `added you to ${group.groupName}`,
        link: `/groups/${groupId}`,
      });
      return json(req, { added: true }, 201);
    }

    const key = { memberId_groupId: { groupId, memberId: userId } };
    const existing = await prisma.groupMember.findUnique({ where: key });

    if (existing) {
      if (existing.role === "admin") {
        const admins = await prisma.groupMember.count({
          where: { groupId, role: "admin" },
        });
        const members = await prisma.groupMember.count({ where: { groupId } });
        if (admins === 1 && members > 1) {
          return fail(
            req,
            "You are the only admin. Delete the group or make someone else admin first.",
            409,
          );
        }
      }
      await prisma.groupMember.delete({ where: key });
      return json(req, { followed: false });
    }

    await prisma.groupMember.create({
      data: { groupId, memberId: userId, role: "member" },
    });
    return json(req, { followed: true });
  } catch (error) {
    return serverError(req, "POST /api/group/[id]/member", error);
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const groupId = toId((await params).id);
    if (!groupId) return fail(req, "Invalid group id", 400);

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        member: { select: { id: true, userName: true, profileImg: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
    return json(req, members);
  } catch (error) {
    return serverError(req, "GET /api/group/[id]/member", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
