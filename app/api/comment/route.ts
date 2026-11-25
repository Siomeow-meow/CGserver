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
import { visibleTo } from "@/lib/posts";
import { commentInclude, shapeComment } from "@/lib/comments";
import { excerpt, mentionedUserIds, notify } from "@/lib/notify";

export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const body = await readJson(req);
    if (!body) return fail(req, "Invalid JSON body", 400);

    const content = typeof body.content === "string" ? body.content.trim() : "";
    const postId = toId(String(body.postId ?? ""));
    const parentId = body.parentId == null ? null : toId(String(body.parentId));

    if (!content || !postId) {
      return fail(req, "Comment text and postId are required", 400);
    }

    const post = await prisma.post.findFirst({
      where: { AND: [{ id: postId }, visibleTo(userId)] },
    });
    if (!post) return fail(req, "Post not found", 404);

    let parentCommenterId: string | null = null;
    if (body.parentId != null) {
      const parent = parentId
        ? await prisma.comment.findUnique({ where: { id: parentId } })
        : null;
      if (!parent || parent.postId !== postId) {
        return fail(req, "Reply target not found on this post", 400);
      }
      parentCommenterId = parent.commenterId;
    }

    const comment = await prisma.comment.create({
      data: { content, postId, parentId, commenterId: userId },
      include: commentInclude(userId),
    });

    const link = `/post/${postId}`;
    const text = excerpt(content);
    const notified = new Set<string>([userId]);
    const items: Parameters<typeof notify>[0] = [];
    if (parentCommenterId && !notified.has(parentCommenterId)) {
      notified.add(parentCommenterId);
      items.push({ userId: parentCommenterId, actorId: userId, type: "reply", content: text, link });
    }
    if (!notified.has(post.authorId)) {
      notified.add(post.authorId);
      items.push({ userId: post.authorId, actorId: userId, type: "comment", content: text, link });
    }
    for (const id of await mentionedUserIds(content)) {
      if (notified.has(id)) continue;
      notified.add(id);
      items.push({ userId: id, actorId: userId, type: "mention", content: text, link });
    }
    await notify(items);

    return json(req, { ...shapeComment(comment), replies: [] }, 201);
  } catch (error) {
    return serverError(req, "POST /api/comment", error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const postId = toId(searchParams.get("postId"));

    const comments = await prisma.comment.findMany({
      where: {
        ...(postId ? { postId } : {}),
        post: visibleTo(userId),
      },
      include: commentInclude(userId),
      orderBy: { createdAt: "asc" },
    });

    return json(req, buildTree(comments.map(shapeComment)));
  } catch (error) {
    return serverError(req, "GET /api/comment", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}

function buildTree<T extends { id: number; parentId: number | null }>(items: T[]) {
  type Node = T & { replies: Node[] };
  const map = new Map<number, Node>();
  items.forEach((c) => map.set(c.id, { ...c, replies: [] }));

  const roots: Node[] = [];
  items.forEach((c) => {
    const node = map.get(c.id)!;
    const parent = c.parentId ? map.get(c.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  });
  return roots;
}
