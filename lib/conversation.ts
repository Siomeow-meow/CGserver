import { prisma } from "./db";

export const participantInclude = {
  participant: { select: { id: true, userName: true, profileImg: true } },
} as const;

export const messageInclude = {
  sender: { select: { userName: true, profileImg: true } },
} as const;

/** Finds the direct (1-to-1) conversation between two users, if any. */
export async function findDirectConversation(a: string, b: string) {
  return prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { participantId: a } } },
        { participants: { some: { participantId: b } } },
        { participants: { every: { participantId: { in: [a, b] } } } },
      ],
    },
    include: { participants: { include: participantInclude } },
  });
}

export async function findOrCreateDirectConversation(a: string, b: string) {
  const existing = await findDirectConversation(a, b);
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      isGroup: false,
      participants: { create: [{ participantId: a }, { participantId: b }] },
    },
    include: { participants: { include: participantInclude } },
  });
}

export async function isParticipant(userId: string, conversationId: number) {
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_participantId: { conversationId, participantId: userId } },
  });
  return !!p;
}

export async function participantIds(conversationId: number) {
  const rows = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { participantId: true },
  });
  return rows.map((r) => r.participantId);
}

export async function createMessage(
  content: string,
  senderId: string,
  conversationId: number,
  parentId: number | null = null,
) {
  return prisma.message.create({
    data: { content, senderId, conversationId, parentId },
    include: messageInclude,
  });
}
