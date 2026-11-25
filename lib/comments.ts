export const commentInclude = (userId: string) => ({
  commenter: { select: { userName: true, profileImg: true } },
  likes: { where: { likerId: userId }, select: { likerId: true } },
  _count: { select: { likes: true } },
});

type RawComment = {
  id: number;
  parentId: number | null;
  likes: { likerId: string }[];
  _count: { likes: number };
};

export function shapeComment<T extends RawComment>(c: T) {
  const { likes, _count, ...rest } = c;
  return { ...rest, likesCount: _count.likes, isLiked: likes.length > 0 };
}
