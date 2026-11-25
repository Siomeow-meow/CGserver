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
  visibleTo,
} from "@/lib/posts";
import { excerpt, mentionedUserIds, notify } from "@/lib/notify";

export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const body = await readJson(req);
    if (!body) return fail(req, "Invalid JSON body", 400);

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    const images = cleanStringArray(body.images, 10);
    const tags = cleanStringArray(body.tags);
    const status =
      typeof body.status === "string" && POST_STATUSES.includes(body.status)
        ? body.status
        : "published";
    const groupId = body.groupId == null ? null : toId(String(body.groupId));

    if (!title || (!content.trim() && images.length === 0)) {
      return fail(req, "A title and either content or an image are required", 400);
    }
    if (body.groupId != null && !groupId) return fail(req, "Invalid groupId", 400);

    const author = await prisma.user.findUnique({ where: { id: userId } });
    if (!author) return fail(req, "Your profile has not been set up yet", 400);

    let isAnonymous = false;
    if (groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { groupMembers: { where: { memberId: userId } } },
      });
      if (!group) return fail(req, "Group not found", 404);
      if (group.groupMembers.length === 0) {
        return fail(req, "Join the group before posting in it", 403);
      }
      isAnonymous = group.allowAnonymity && body.isAnonymous === true;
    }

    const post = await prisma.post.create({
      data: {
        title,
        content,
        tags,
        images,
        status,
        isAnonymous,
        groupId,
        authorId: userId,
      },
      include: postInclude(userId),
    });

    if (post.status === "published") {
      const link = `/post/${post.id}`;
      // Anonymous posts never reveal who wrote them, even in notifications.
      const actorId = isAnonymous ? null : userId;
      const notified = new Set<string>([userId]);
      const items: Parameters<typeof notify>[0] = [];
      if (!isAnonymous) {
        for (const id of await mentionedUserIds(`${title} ${content}`)) {
          notified.add(id);
          items.push({ userId: id, actorId, type: "mention", content: excerpt(title), link });
        }
      }
      if (groupId) {
        const members = await prisma.groupMember.findMany({
          where: { groupId },
          select: { memberId: true },
        });
        for (const m of members) {
          if (notified.has(m.memberId)) continue;
          items.push({
            userId: m.memberId,
            actorId,
            type: "group_post",
            content: excerpt(title),
            link,
          });
        }
      }
      await notify(items);
    }

    return json(req, shapePost(post, userId), 201);
  } catch (error) {
    return serverError(req, "POST /api/post", error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const authorId = searchParams.get("authorId");
    const groupId = toId(searchParams.get("groupId"));

    const posts = await prisma.post.findMany({
      where: {
        AND: [
          visibleTo(userId),
          authorId
            ? // Someone else's profile never lists their anonymous posts.
              authorId === userId
              ? { authorId }
              : { authorId, isAnonymous: false }
            : {},
          groupId ? { groupId } : {},
        ],
      },
      include: postInclude(userId),
      orderBy: { createdAt: "desc" },
    });

    return json(req, posts.map((p) => shapePost(p, userId)));
  } catch (error) {
    return serverError(req, "GET /api/post", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
