import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";
import { messageInclude } from "@/lib/conversation";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

async function ownMessage(userId: string, params: Ctx["params"]) {
  const { id, messageId } = await params;
  const conversationId = toId(id);
  const mid = toId(messageId);
  if (!conversationId || !mid) return { error: "Invalid id", status: 400 } as const;
  const message = await prisma.message.findUnique({ where: { id: mid } });
  if (!message || message.conversationId !== conversationId) {
    return { error: "Message not found", status: 404 } as const;
  }
  if (message.senderId !== userId) {
    return { error: "You can only change your own messages", status: 403 } as const;
  }
  return { message } as const;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const found = await ownMessage(userId, params);
    if ("error" in found) return fail(req, found.error!, found.status!);

    const body = await readJson(req);
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return fail(req, "Message cannot be empty", 400);

    const message = await prisma.message.update({
      where: { id: found.message.id },
      data: { content },
      include: messageInclude,
    });
    return json(req, message);
  } catch (error) {
    return serverError(req, "PATCH message", error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const found = await ownMessage(userId, params);
    if ("error" in found) return fail(req, found.error!, found.status!);

    await prisma.message.delete({ where: { id: found.message.id } });
    return json(req, { id: found.message.id, deleted: true });
  } catch (error) {
    return serverError(req, "DELETE message", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "PATCH, DELETE");
}
