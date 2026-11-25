import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, fail, json, options, serverError, toId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const id = toId((await params).id);
    if (!id) return fail(req, "Invalid notification id", 400);

    const result = await prisma.notification.deleteMany({ where: { id, userId } });
    if (result.count === 0) return fail(req, "Notification not found", 404);
    return json(req, { id, deleted: true });
  } catch (error) {
    return serverError(req, "DELETE /api/notification/[id]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "DELETE");
}
