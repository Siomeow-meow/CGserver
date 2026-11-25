import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";
import { isParticipant, participantInclude } from "@/lib/conversation";

type Ctx = { params: Promise<{ id: string }> };

/** Adds someone to a group chat. Only existing members may add people. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const conversationId = toId((await params).id);
    if (!conversationId) return fail(req, "Invalid conversation id", 400);

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || !(await isParticipant(userId, conversationId))) {
      return fail(req, "Conversation not found", 404);
    }
    if (!conversation.isGroup) return fail(req, "You can only add people to group chats", 400);

    const body = await readJson(req);
    const participantId =
      typeof body?.participantId === "string" ? body.participantId : "";
    if (!participantId) return fail(req, "Missing participantId", 400);

    const user = await prisma.user.findUnique({ where: { id: participantId } });
    if (!user) return fail(req, "User not found", 404);
    if (await isParticipant(participantId, conversationId)) {
      return fail(req, "Already in this chat", 409);
    }

    await prisma.conversationParticipant.create({
      data: { conversationId, participantId },
    });
    return json(req, { added: true }, 201);
  } catch (error) {
    return serverError(req, "POST /api/conversation/[id]/participants", error);
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const conversationId = toId((await params).id);
    if (!conversationId || !(await isParticipant(userId, conversationId))) {
      return fail(req, "Conversation not found", 404);
    }

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: participantInclude,
    });
    return json(req, participants);
  } catch (error) {
    return serverError(req, "GET /api/conversation/[id]/participants", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
