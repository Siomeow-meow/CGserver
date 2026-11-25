import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notify";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Toggles the signed-in user's like on a post. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const postId = toId((await params).id);
    if (!postId) return fail(req, "Invalid post id", 400);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return fail(req, "Post not found", 404);

    const body = await readJson(req);
    const type = typeof body?.type === "string" ? body.type : "like";
    const key = { postId_likerId: { postId, likerId: userId } };

    const existing = await prisma.postLike.findUnique({ where: key });
    if (existing) {
      await prisma.postLike.delete({ where: key });
    } else {
      await prisma.postLike.create({ data: { postId, likerId: userId, type } });
      await notify({
        userId: post.authorId,
        actorId: userId,
        type: "post_like",
        content: `liked your post "${post.title}"`,
        link: `/post/${postId}`,
      });
    }
    const likesCount = await prisma.postLike.count({ where: { postId } });

    return json(req, { liked: !existing, likesCount });
  } catch (error) {
    return serverError(req, "POST /api/post/[id]/likes", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "POST");
}
