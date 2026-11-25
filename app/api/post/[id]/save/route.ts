import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, serverError, toId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Toggles whether the signed-in user has saved a post. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const postId = toId((await params).id);
    if (!postId) return fail(req, "Invalid post id", 400);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return fail(req, "Post not found", 404);

    const key = { userId_postId: { userId, postId } };
    const existing = await prisma.savedPost.findUnique({ where: key });
    if (existing) {
      await prisma.savedPost.delete({ where: key });
    } else {
      await prisma.savedPost.create({ data: { userId, postId } });
    }
    return json(req, { saved: !existing });
  } catch (error) {
    return serverError(req, "POST /api/post/[id]/save", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "POST");
}
