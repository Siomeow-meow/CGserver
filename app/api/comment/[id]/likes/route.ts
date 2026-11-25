import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Toggles the signed-in user's like on a comment. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const commentId = toId((await params).id);
    if (!commentId) return fail(req, "Invalid comment id", 400);

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return fail(req, "Comment not found", 404);

    const body = await readJson(req);
    const type = typeof body?.type === "string" ? body.type : "like";
    const key = { commentId_likerId: { commentId, likerId: userId } };

    const existing = await prisma.commentLike.findUnique({ where: key });
    if (existing) {
      await prisma.commentLike.delete({ where: key });
    } else {
      await prisma.commentLike.create({ data: { commentId, likerId: userId, type } });
    }
    const likesCount = await prisma.commentLike.count({ where: { commentId } });

    return json(req, { liked: !existing, likesCount });
  } catch (error) {
    return serverError(req, "POST /api/comment/[id]/likes", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "POST");
}
