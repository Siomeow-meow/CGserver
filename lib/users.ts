import { prisma } from "./db";

/** Turns a display name into a valid username: letters, digits and _ only (matches the UI @mention pattern). */
export function normalizeUserName(raw: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return cleaned || "user";
}

/** Returns `base`, or `base2`, `base3`, ... whichever is not taken yet. */
export async function uniqueUserName(base: string, exceptUserId?: string) {
  const name = normalizeUserName(base);
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? name : `${name}${i}`;
    const taken = await prisma.user.findUnique({ where: { userName: candidate } });
    if (!taken || taken.id === exceptUserId) return candidate;
  }
  return `${name}_${Date.now()}`;
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{2,30}$/;
