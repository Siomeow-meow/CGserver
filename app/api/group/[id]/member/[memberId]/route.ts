import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";
import { isGroupAdmin } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string; memberId: string }> };

const ROLES = ["member", "admin"];

async function loadTarget(params: Ctx["params"]) {
  const { id, memberId } = await params;
  const groupId = toId(id);
  if (!groupId) return { groupId: null, memberId, member: null };
  const member = await prisma.groupMember.findUnique({
    where: { memberId_groupId: { memberId, groupId } },
  });
  return { groupId, memberId, member };
}

async function adminCount(groupId: number) {
  return prisma.groupMember.count({ where: { groupId, role: "admin" } });
}

/** Changes a member's role. Admins only. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const { groupId, memberId, member } = await loadTarget(params);
    if (!groupId || !member) return fail(req, "Member not found", 404);
    if (!(await isGroupAdmin(userId, groupId))) {
      return fail(req, "Only group admins can change roles", 403);
    }

    const body = await readJson(req);
    const role = typeof body?.role === "string" ? body.role.toLowerCase() : "";
    if (!ROLES.includes(role)) return fail(req, "Role must be member or admin", 400);

    if (member.role === "admin" && role !== "admin" && (await adminCount(groupId)) === 1) {
      return fail(req, "A group needs at least one admin", 409);
    }

    const updated = await prisma.groupMember.update({
      where: { memberId_groupId: { memberId, groupId } },
      data: { role },
    });
    return json(req, updated);
  } catch (error) {
    return serverError(req, "PATCH /api/group/[id]/member/[memberId]", error);
  }
}

/** Removes a member. Admins can remove anyone else; anyone can remove themselves. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const { groupId, memberId, member } = await loadTarget(params);
    if (!groupId || !member) return fail(req, "Member not found", 404);
    if (memberId !== userId && !(await isGroupAdmin(userId, groupId))) {
      return fail(req, "Only group admins can remove members", 403);
    }
    if (member.role === "admin" && (await adminCount(groupId)) === 1) {
      const total = await prisma.groupMember.count({ where: { groupId } });
      if (total > 1) return fail(req, "A group needs at least one admin", 409);
    }

    await prisma.groupMember.delete({
      where: { memberId_groupId: { memberId, groupId } },
    });
    return json(req, { memberId, removed: true });
  } catch (error) {
    return serverError(req, "DELETE /api/group/[id]/member/[memberId]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "PATCH, DELETE");
}
