import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, serverError, toId } from "@/lib/http";
import { isParticipant, participantInclude } from "@/lib/conversation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid conversation id", 400);

    if (!(await isParticipant(userId, id))) {
      return fail(req, "Conversation not found", 404);
    }
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: { include: participantInclude },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    return json(req, conversation);
  } catch (error) {
    return serverError(req, "GET /api/conversation/[id]", error);
  }
}

/**
 * Direct chat: deletes it for both people. Group chat: you leave it, and it
 * is deleted once nobody is left.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid conversation id", 400);

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || !(await isParticipant(userId, id))) {
      return fail(req, "Conversation not found", 404);
    }

    if (conversation.isGroup) {
      await prisma.conversationParticipant.delete({
        where: { conversationId_participantId: { conversationId: id, participantId: userId } },
      });
      const left = await prisma.conversationParticipant.count({ where: { conversationId: id } });
      if (left === 0) await prisma.conversation.delete({ where: { id } });
      return json(req, { id, left: true });
    }

    await prisma.conversation.delete({ where: { id } });
    return json(req, { id, deleted: true });
  } catch (error) {
    return serverError(req, "DELETE /api/conversation/[id]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, DELETE");
}
