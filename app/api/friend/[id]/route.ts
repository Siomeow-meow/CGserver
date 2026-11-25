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
import { friendUserSelect, FRIEND_STATUSES } from "@/lib/friends";
import { notify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

/** The friendship record between the signed-in user and user `id`, or null. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const { id } = await params;
    const friendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId, receiverId: id },
          { userId: id, receiverId: userId },
        ],
      },
      include: {
        receiver: { select: friendUserSelect },
        user: { select: friendUserSelect },
      },
    });
    return json(req, friendship);
  } catch (error) {
    return serverError(req, "GET /api/friend/[id]", error);
  }
}

/** Accepts or declines a request. Only the person who received it may answer. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid request id", 400);

    const body = await readJson(req);
    const status = typeof body?.status === "string" ? body.status.toUpperCase() : "";
    if (!FRIEND_STATUSES.includes(status) || status === "PENDING") {
      return fail(req, "Status must be ACCEPTED or DECLINED", 400);
    }

    const request = await prisma.friend.findUnique({ where: { id } });
    if (!request) return fail(req, "Friend request not found", 404);
    if (request.receiverId !== userId) {
      return fail(req, "Only the person who received this request can answer it", 403);
    }

    const friend = await prisma.friend.update({ where: { id }, data: { status } });
    if (status === "ACCEPTED") {
      await notify({
        userId: request.userId,
        actorId: userId,
        type: "friend_accepted",
        content: "accepted your friend request",
        link: `/user/${userId}`,
      });
    }
    return json(req, friend);
  } catch (error) {
    return serverError(req, "PATCH /api/friend/[id]", error);
  }
}

/** Unfriends, cancels or rejects. Only the two people involved may do this. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid request id", 400);

    const request = await prisma.friend.findUnique({ where: { id } });
    if (!request) return fail(req, "Friend not found", 404);
    if (request.userId !== userId && request.receiverId !== userId) {
      return fail(req, "Not your friendship", 403);
    }

    await prisma.friend.delete({ where: { id } });
    return json(req, { id, deleted: true });
  } catch (error) {
    return serverError(req, "DELETE /api/friend/[id]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, PATCH, DELETE");
}
