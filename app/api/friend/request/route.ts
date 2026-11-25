import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, serverError } from "@/lib/http";
import { friendUserSelect } from "@/lib/friends";

/**
 * Pending friend requests for the signed-in user.
 * ?direction=incoming (default) lists requests sent to you;
 * ?direction=sent lists requests you sent that are still pending.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const direction = new URL(req.url).searchParams.get("direction");
    const sent = direction === "sent";

    const requests = await prisma.friend.findMany({
      where: sent
        ? { userId, status: "PENDING" }
        : { receiverId: userId, status: "PENDING" },
      include: {
        user: { select: friendUserSelect },
        receiver: { select: friendUserSelect },
      },
      orderBy: { createdAt: "desc" },
    });

    return json(
      req,
      requests.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        isSender: sent,
        otherUser: sent ? r.receiver : r.user,
      })),
    );
  } catch (error) {
    return serverError(req, "GET /api/friend/request", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET");
}
