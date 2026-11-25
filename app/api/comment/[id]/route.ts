import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  currentUserId,
  fail,
  json,
  options,
  readJson,
  serverError,
  toId,
} from "@/lib/http";
import { commentInclude, shapeComment } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid comment id", 400);

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: commentInclude(userId),
    });
    if (!comment) return fail(req, "Comment not found", 404);

    return json(req, shapeComment(comment));
  } catch (error) {
    return serverError(req, "GET /api/comment/[id]", error);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid comment id", 400);

    const body = await readJson(req);
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return fail(req, "Comment text is required", 400);

    const existing = await prisma.comment.findUnique({ where: { id } });
    if (!existing) return fail(req, "Comment not found", 404);
    if (existing.commenterId !== userId) {
      return fail(req, "You can only edit your own comments", 403);
    }

    const comment = await prisma.comment.update({
      where: { id },
      data: { content },
      include: commentInclude(userId),
    });
    return json(req, shapeComment(comment));
  } catch (error) {
    return serverError(req, "PATCH /api/comment/[id]", error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid comment id", 400);

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { post: { select: { authorId: true } } },
    });
    if (!comment) return fail(req, "Comment not found", 404);

    // The commenter or the author of the post may remove a comment.
    if (comment.commenterId !== userId && comment.post.authorId !== userId) {
      return fail(req, "You can only delete your own comments", 403);
    }

    await prisma.comment.delete({ where: { id } });
    return json(req, { id, deleted: true });
  } catch (error) {
    return serverError(req, "DELETE /api/comment/[id]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, PATCH, DELETE");
}
