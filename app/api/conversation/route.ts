import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError } from "@/lib/http";
import { findOrCreateDirectConversation, participantInclude } from "@/lib/conversation";

/**
 * Starts a conversation. `participants` is a list of user ids (the signed-in
 * user is added automatically). One other person gives a direct chat, which
 * is reused if it already exists; two or more give a new group chat.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const body = await readJson(req);
    const raw: unknown[] = Array.isArray(body?.participants) ? body.participants : [];
    // Accept plain ids or { participantId } objects.
    const others = [
      ...new Set(
        raw
          .map((p) =>
            typeof p === "string"
              ? p
              : (p as { participantId?: unknown })?.participantId,
          )
          .filter((p): p is string => typeof p === "string" && p !== userId),
      ),
    ];
    if (others.length === 0) return fail(req, "Add at least one other person", 400);

    const found = await prisma.user.count({ where: { id: { in: others } } });
    if (found !== others.length) return fail(req, "Some users were not found", 404);

    if (others.length === 1) {
      return json(req, await findOrCreateDirectConversation(userId, others[0]));
    }

    const conversation = await prisma.conversation.create({
      data: {
        isGroup: true,
        participants: {
          create: [userId, ...others].map((participantId) => ({ participantId })),
        },
      },
      include: { participants: { include: participantInclude } },
    });
    return json(req, conversation, 201);
  } catch (error) {
    return serverError(req, "POST /api/conversation", error);
  }
}

/** Conversations the signed-in user is part of, with the latest message. */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { participantId: userId } } },
      include: {
        participants: { include: participantInclude },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const withUnread = await Promise.all(
      conversations.map(async (c) => {
        const me = c.participants.find((p) => p.participantId === userId);
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: userId },
            ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
          },
        });
        return { ...c, unreadCount };
      }),
    );
    return json(req, withUnread);
  } catch (error) {
    return serverError(req, "GET /api/conversation", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
