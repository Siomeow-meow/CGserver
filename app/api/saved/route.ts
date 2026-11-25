import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, serverError } from "@/lib/http";
import { postInclude, shapePost, visibleTo } from "@/lib/posts";

/** Lists the signed-in user's saved posts, newest save first. */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const saved = await prisma.savedPost.findMany({
      where: { userId, post: visibleTo(userId) },
      include: { post: { include: postInclude(userId) } },
      orderBy: { createdAt: "desc" },
    });

    return json(req, saved.map((s) => shapePost(s.post, userId)));
  } catch (error) {
    return serverError(req, "GET /api/saved", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET");
}
