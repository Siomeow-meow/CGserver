import { prisma } from "./db";

export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "post_like"
  | "comment"
  | "reply"
  | "mention"
  | "group_post"
  | "group_invite";

type Input = {
  userId: string;
  actorId: string | null;
  type: NotificationType;
  content: string;
  link: string;
};

/**
 * Creates notifications. Never notifies people about their own actions, and
 * never lets a notification failure break the request that caused it.
 */
export async function notify(items: Input | Input[]) {
  const list = (Array.isArray(items) ? items : [items]).filter(
    (n) => n.userId && n.userId !== n.actorId,
  );
  if (list.length === 0) return;
  try {
    await prisma.notification.createMany({ data: list });
  } catch (error) {
    console.error("notify failed:", error);
  }
}

/** User ids of everyone @mentioned by username in `text`. */
export async function mentionedUserIds(text: string): Promise<string[]> {
  const names = [
    ...new Set([...text.matchAll(/@([a-zA-Z0-9_]{2,30})/g)].map((m) => m[1].toLowerCase())),
  ].slice(0, 20);
  if (names.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { OR: names.map((n) => ({ userName: { equals: n, mode: "insensitive" as const } })) },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export function excerpt(text: string | null | undefined, length = 80) {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > length ? `${t.slice(0, length - 1)}…` : t;
}
