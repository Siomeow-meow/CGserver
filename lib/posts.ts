import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

export const postInclude = (userId: string) =>
  ({
    author: { select: { userName: true, profileImg: true } },
    likedPost: { where: { likerId: userId }, select: { likerId: true } },
    savedBy: { where: { userId }, select: { userId: true } },
    group: { select: { groupName: true, groupImg: true, bannerImg: true } },
    _count: { select: { likedPost: true, comments: true } },
  }) satisfies Prisma.PostInclude;

type PostWithExtras = Prisma.PostGetPayload<{
  include: ReturnType<typeof postInclude>;
}>;

/**
 * Stable stand-in id for an anonymous author. The same person gets the same
 * value inside one group, but it cannot be turned back into their user id.
 */
export function anonymousAuthorId(authorId: string, groupId: number | null) {
  const secret = process.env.ANON_SALT ?? "commonground";
  return (
    "anon_" +
    createHash("sha256")
      .update(`${secret}:${groupId ?? "global"}:${authorId}`)
      .digest("hex")
      .slice(0, 16)
  );
}

/** Shapes a post for the API and hides the author of anonymous posts. */
export function shapePost(post: PostWithExtras, userId: string) {
  const { likedPost, savedBy, _count, ...rest } = post;
  const isOwner = post.authorId === userId;
  const shaped = {
    ...rest,
    likesCount: _count.likedPost,
    commentsCount: _count.comments,
    isLiked: likedPost.length > 0,
    isSaved: savedBy.length > 0,
    isOwner,
    // Same value for everyone (including the author), so the UI shows one
    // consistent "GuestN" label for an anonymous author within a group.
    anonymousId: post.isAnonymous
      ? anonymousAuthorId(post.authorId, post.groupId)
      : null,
  };
  if (post.isAnonymous && !isOwner) {
    return {
      ...shaped,
      authorId: shaped.anonymousId!,
      author: { userName: null, profileImg: null },
    };
  }
  return shaped;
}

/** Posts the user may see: published ones, plus their own drafts. */
export function visibleTo(userId: string): Prisma.PostWhereInput {
  return { OR: [{ status: { not: "draft" } }, { authorId: userId }] };
}

export function cleanStringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim())
    .slice(0, max);
}

export const POST_STATUSES = ["draft", "published", "archived"];
