import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, serverError } from "@/lib/http";
import { findDirectConversation } from "@/lib/conversation";

/** The direct conversation with ?otherUserId=, or null if none exists yet. */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const otherUserId = new URL(req.url).searchParams.get("otherUserId");
    if (!otherUserId) return fail(req, "Missing otherUserId", 400);

    const conversation = await findDirectConversation(userId, otherUserId);
    if (!conversation) return json(req, null);

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    return json(req, { ...conversation, messages });
  } catch (error) {
    return serverError(req, "GET /api/conversation/direct", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET");
}
