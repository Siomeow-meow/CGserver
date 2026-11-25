import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, serverError, toId } from "@/lib/http";
import { isParticipant } from "@/lib/conversation";

type Ctx = { params: Promise<{ id: string }> };

/** Marks the conversation as read up to now for the signed-in user. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const conversationId = toId((await params).id);
    if (!conversationId || !(await isParticipant(userId, conversationId))) {
      return fail(req, "Conversation not found", 404);
    }

    const lastReadAt = new Date();
    await prisma.conversationParticipant.update({
      where: { conversationId_participantId: { conversationId, participantId: userId } },
      data: { lastReadAt },
    });
    return json(req, { conversationId, lastReadAt });
  } catch (error) {
    return serverError(req, "POST /api/conversation/[id]/read", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "POST");
}
