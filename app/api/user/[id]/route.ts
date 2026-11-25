import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  currentUserId,
  fail,
  json,
  options,
  publicUserSelect,
  readJson,
  serverError,
} from "@/lib/http";
import { USERNAME_PATTERN } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

/** A user's profile. Your own profile also includes your email. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { ...publicUserSelect, email: id === userId },
    });
    if (!user) return fail(req, "User not found", 404);
    return json(req, user);
  } catch (error) {
    return serverError(req, "GET /api/user/[id]", error);
  }
}

/** Edits your own profile. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const { id } = await params;
    if (id !== userId) return fail(req, "You can only edit your own profile", 403);

    const body = await readJson(req);
    if (!body) return fail(req, "Invalid JSON body", 400);

    const data: Record<string, string> = {};
    for (const key of ["fName", "lName", "bio", "profileImg", "bannerImg"]) {
      if (typeof body[key] === "string") data[key] = body[key] as string;
    }
    if (typeof body.userName === "string") {
      const userName = body.userName.trim();
      if (!USERNAME_PATTERN.test(userName)) {
        return fail(
          req,
          "Username must be 2-30 characters: letters, numbers or _",
          400,
        );
      }
      const taken = await prisma.user.findUnique({ where: { userName } });
      if (taken && taken.id !== userId) {
        return fail(req, "That username is already taken", 409);
      }
      data.userName = userName;
    }
    if (Object.keys(data).length === 0) return fail(req, "No change to add", 400);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return fail(req, "User not found", 404);

    const user = await prisma.user.update({ where: { id }, data });
    return json(req, user);
  } catch (error) {
    return serverError(req, "PATCH /api/user/[id]", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, PATCH");
}
