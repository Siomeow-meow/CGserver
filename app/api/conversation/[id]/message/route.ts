import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";
import { createMessage, isParticipant, messageInclude } from "@/lib/conversation";

type Ctx = { params: Promise<{ id: string }> };

/** Sends a message as the signed-in user. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const conversationId = toId((await params).id);
    if (!conversationId || !(await isParticipant(userId, conversationId))) {
      return fail(req, "Conversation not found", 404);
    }

    const body = await readJson(req);
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return fail(req, "Message cannot be empty", 400);

    let parentId: number | null = null;
    if (body?.parentId != null) {
      parentId = toId(String(body.parentId));
      const parent = parentId
        ? await prisma.message.findUnique({ where: { id: parentId } })
        : null;
      if (!parent || parent.conversationId !== conversationId) {
        return fail(req, "Reply target not found in this chat", 400);
      }
    }

    const message = await createMessage(content, userId, conversationId, parentId);
    return json(req, message, 201);
  } catch (error) {
    return serverError(req, "POST /api/conversation/[id]/message", error);
  }
}

/** Messages in the conversation, oldest first, with replies nested. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const conversationId = toId((await params).id);
    if (!conversationId || !(await isParticipant(userId, conversationId))) {
      return fail(req, "Conversation not found", 404);
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: messageInclude,
      orderBy: { createdAt: "asc" },
    });

    type Node = (typeof messages)[number] & { replies: Node[] };
    const map = new Map<number, Node>();
    messages.forEach((m) => map.set(m.id, { ...m, replies: [] }));
    const roots: Node[] = [];
    messages.forEach((m) => {
      const node = map.get(m.id)!;
      const parent = m.parentId ? map.get(m.parentId) : undefined;
      if (parent) parent.replies.push(node);
      else roots.push(node);
    });

    return json(req, roots);
  } catch (error) {
    return serverError(req, "GET /api/conversation/[id]/message", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
