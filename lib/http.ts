import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * Shared helpers for API routes: CORS headers, JSON responses and auth.
 *
 * Allowed browser origins come from ALLOWED_ORIGINS (comma separated) plus
 * NEXT_PUBLIC_APP_URL and localhost:3000. Requests from the frontend's
 * /api/proxy route are server to server and carry no Origin header.
 */
function allowedOrigins(): string[] {
  return [
    "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  ]
    .map((o) => o?.trim().replace(/\/$/, ""))
    .filter((o): o is string => !!o);
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function json(req: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}

export function fail(req: NextRequest, message: string, status: number) {
  return json(req, { error: message }, status);
}

export function options(req: NextRequest, methods: string) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

/** Returns the signed-in Clerk user id, or null. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/** Parses a route id as a positive integer, or returns null. */
export function toId(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function readJson<T = Record<string, unknown>>(
  req: NextRequest,
): Promise<T | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as T) : null;
  } catch {
    return null;
  }
}

export function serverError(req: NextRequest, where: string, error: unknown) {
  console.error(`${where} error:`, error);
  return fail(req, "Something went wrong", 500);
}

/** Public fields of a user that are safe to send to other users. */
export const publicUserSelect = {
  id: true,
  userName: true,
  fName: true,
  lName: true,
  bio: true,
  profileImg: true,
  bannerImg: true,
} as const;
