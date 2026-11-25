import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError, toId } from "@/lib/http";

/** The signed-in user's latest notifications, newest first. */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const unreadOnly = new URL(req.url).searchParams.get("unread") === "true";
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { read: false } : {}) },
        include: { actor: { select: { id: true, userName: true, profileImg: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return json(req, { notifications, unreadCount });
  } catch (error) {
    return serverError(req, "GET /api/notification", error);
  }
}

/** Marks notifications read: { ids: number[] } or { all: true }. */
export async function PATCH(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const body = await readJson(req);
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map((i: unknown) => toId(String(i))).filter((i: number | null): i is number => !!i)
      : [];
    if (body?.all !== true && ids.length === 0) {
      return fail(req, "Pass ids or all: true", 400);
    }

    const result = await prisma.notification.updateMany({
      where: { userId, ...(body?.all === true ? {} : { id: { in: ids } }) },
      data: { read: true },
    });
    return json(req, { updated: result.count });
  } catch (error) {
    return serverError(req, "PATCH /api/notification", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, PATCH");
}
