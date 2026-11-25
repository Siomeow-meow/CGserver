import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, readJson, serverError } from "@/lib/http";
import { friendUserSelect } from "@/lib/friends";
import { notify } from "@/lib/notify";

/** Sends a friend request from the signed-in user. */
export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const body = await readJson(req);
    const receiverId = typeof body?.receiverId === "string" ? body.receiverId : "";
    if (!receiverId) return fail(req, "Missing receiverId", 400);
    if (receiverId === userId) return fail(req, "You cannot add yourself", 400);

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) return fail(req, "User not found", 404);

    const existing = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId, receiverId },
          { userId: receiverId, receiverId: userId },
        ],
      },
    });
    if (existing && existing.status !== "DECLINED") {
      return fail(req, "Friend request already exists", 409);
    }
    if (existing) await prisma.friend.delete({ where: { id: existing.id } });

    const friend = await prisma.friend.create({
      data: { userId, receiverId, status: "PENDING" },
    });
    await notify({
      userId: receiverId,
      actorId: userId,
      type: "friend_request",
      content: "sent you a friend request",
      link: `/user/${userId}`,
    });
    return json(req, friend, 201);
  } catch (error) {
    return serverError(req, "POST /api/friend", error);
  }
}

/** Lists the signed-in user's accepted friends. */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const friends = await prisma.friend.findMany({
      where: { status: "ACCEPTED", OR: [{ userId }, { receiverId: userId }] },
      include: {
        receiver: { select: friendUserSelect },
        user: { select: friendUserSelect },
      },
      orderBy: { createdAt: "desc" },
    });

    return json(
      req,
      friends.map((f) => ({
        id: f.id,
        status: f.status,
        createdAt: f.createdAt,
        otherUser: f.userId === userId ? f.receiver : f.user,
      })),
    );
  } catch (error) {
    return serverError(req, "GET /api/friend", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
