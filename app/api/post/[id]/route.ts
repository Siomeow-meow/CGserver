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
import {
  cleanStringArray,
  postInclude,
  POST_STATUSES,
  shapePost,
} from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid post id", 400);

    const post = await prisma.post.findUnique({
      where: { id },
      include: postInclude(userId),
    });
    if (!post || (post.status === "draft" && post.authorId !== userId)) {
      return fail(req, "Post not found", 404);
    }

    return json(req, shapePost(post, userId));
  } catch (error) {
    return serverError(req, "GET /api/post/[id]", error);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid post id", 400);

    const existing = await prisma.post.findUnique({
      where: { id },
      include: { group: { select: { allowAnonymity: true } } },
    });
    if (!existing) return fail(req, "Post not found", 404);
    if (existing.authorId !== userId) {
      return fail(req, "You can only edit your own posts", 403);
    }

    const body = await readJson(req);
    if (!body) return fail(req, "Invalid JSON body", 400);

    const data: {
      title?: string;
      content?: string;
      tags?: string[];
      images?: string[];
      status?: string;
      isAnonymous?: boolean;
    } = {};
    if (typeof body.title === "string") {
      if (!body.title.trim()) return fail(req, "Title cannot be empty", 400);
      data.title = body.title.trim();
    }
    if (typeof body.content === "string") data.content = body.content;
    if (Array.isArray(body.tags)) data.tags = cleanStringArray(body.tags);
    if (Array.isArray(body.images)) data.images = cleanStringArray(body.images, 10);
    if (typeof body.status === "string") {
      if (!POST_STATUSES.includes(body.status)) {
        return fail(req, "Invalid status", 400);
      }
      data.status = body.status;
    }
    if (typeof body.isAnonymous === "boolean") {
      data.isAnonymous = !!existing.group?.allowAnonymity && body.isAnonymous;
    }

    if (Object.keys(data).length === 0) return fail(req, "No change to add", 400);

    const content = data.content ?? existing.content ?? "";
    const images = data.images ?? existing.images;
    if (!content.trim() && images.length === 0) {
      return fail(req, "A post needs content or an image", 400);
    }

    const post = await prisma.post.update({
      where: { id },
      data,
      include: postInclude(userId),
    });

    return json(req, shapePost(post, userId));
  } catch (error) {
    return serverError(req, "PATCH /api/post/[id]", error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid post id", 400);

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return fail(req, "Post not found", 404);

    let allowed = post.authorId === userId;
    if (!allowed && post.groupId) {
      const membership = await prisma.groupMember.findUnique({
        where: { memberId_groupId: { memberId: userId, groupId: post.groupId } },
      });
      allowed = membership?.role === "admin";
    }
    if (!allowed) return fail(req, "You can only delete your own posts", 403);

    await prisma.post.delete({ where: { id } });
    return json(req, { id, deleted: true });
  } catch (error) {
    return serverError(req, "DELETE /api/post/[id]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, PATCH, DELETE");
}
