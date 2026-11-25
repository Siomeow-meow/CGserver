import { NextRequest } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
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
import { uniqueUserName } from "@/lib/users";

/**
 * Creates the database profile for the signed-in Clerk user, or returns the
 * existing one. The id and email always come from Clerk, never the body.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing) return json(req, existing);

    const clerkUser = await (await clerkClient()).users.getUser(userId);
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return fail(req, "Your account has no email address", 400);

    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      return fail(req, "That email already belongs to another profile", 409);
    }

    const body = (await readJson(req)) ?? {};
    const requested =
      (typeof body.userName === "string" && body.userName) ||
      clerkUser.username ||
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join("_") ||
      email.split("@")[0];

    const user = await prisma.user.create({
      data: {
        id: userId,
        email,
        userName: await uniqueUserName(requested),
        fName: clerkUser.firstName,
        lName: clerkUser.lastName,
        profileImg: clerkUser.imageUrl,
      },
    });
    return json(req, user, 201);
  } catch (error) {
    return serverError(req, "POST /api/user", error);
  }
}

/** Lists users (public fields only, no email addresses). */
export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return fail(req, "Unauthorized", 401);

    const users = await prisma.user.findMany({
      select: publicUserSelect,
      orderBy: { userName: "asc" },
    });
    return json(req, users);
  } catch (error) {
    return serverError(req, "GET /api/user", error);
  }
}

export async function OPTIONS(req: NextRequest) {
  return options(req, "GET, POST");
}
