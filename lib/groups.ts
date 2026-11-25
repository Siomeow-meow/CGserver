import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export const groupInclude = (userId: string) =>
  ({
    groupMembers: {
      where: { memberId: userId },
      select: { memberId: true, role: true },
    },
    _count: { select: { groupMembers: true } },
  }) satisfies Prisma.GroupInclude;

type GroupWithExtras = Prisma.GroupGetPayload<{
  include: ReturnType<typeof groupInclude>;
}>;

export function shapeGroup(group: GroupWithExtras) {
  return {
    ...group,
    populationCount: group._count.groupMembers,
    isFollowed: group.groupMembers.length > 0,
    isAdmin: group.groupMembers[0]?.role === "admin",
  };
}

export async function isGroupAdmin(userId: string, groupId: number) {
  const m = await prisma.groupMember.findUnique({
    where: { memberId_groupId: { memberId: userId, groupId } },
  });
  return m?.role === "admin";
}
