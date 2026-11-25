import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { asUser, call, ctx, makeUser, req, resetDb } from "./helpers";

import * as postRoute from "@/app/api/post/route";
import * as postIdRoute from "@/app/api/post/[id]/route";
import * as postLikeRoute from "@/app/api/post/[id]/likes/route";
import * as postSaveRoute from "@/app/api/post/[id]/save/route";
import * as savedRoute from "@/app/api/saved/route";
import * as commentRoute from "@/app/api/comment/route";
import * as commentIdRoute from "@/app/api/comment/[id]/route";
import * as commentLikeRoute from "@/app/api/comment/[id]/likes/route";
import * as userRoute from "@/app/api/user/route";
import * as userIdRoute from "@/app/api/user/[id]/route";
import * as groupRoute from "@/app/api/group/route";
import * as groupIdRoute from "@/app/api/group/[id]/route";
import * as memberRoute from "@/app/api/group/[id]/member/route";
import * as friendRoute from "@/app/api/friend/route";
import * as friendIdRoute from "@/app/api/friend/[id]/route";
import * as friendReqRoute from "@/app/api/friend/request/route";
import * as convoRoute from "@/app/api/conversation/route";
import * as convoIdRoute from "@/app/api/conversation/[id]/route";
import * as convoReadRoute from "@/app/api/conversation/[id]/read/route";
import * as participantsRoute from "@/app/api/conversation/[id]/participants/route";
import * as messageRoute from "@/app/api/conversation/[id]/message/route";
import * as messageIdRoute from "@/app/api/conversation/[id]/message/[messageId]/route";
import * as notificationRoute from "@/app/api/notification/route";

async function createGroup(owner: string, extra: Record<string, unknown> = {}) {
  asUser(owner);
  const { body } = await call(
    await groupRoute.POST(
      req("POST", "/api/group", {
        groupName: `g_${Math.random().toString(36).slice(2, 8)}`,
        groupImg: "i.png",
        bannerImg: "b.png",
        ...extra,
      }),
    ),
  );
  return body;
}

async function join(userId: string, groupId: number) {
  asUser(userId);
  return call(await memberRoute.POST(req("POST", `/api/group/${groupId}/member`, { role: "admin" }), ctx({ id: String(groupId) })));
}

async function createPost(author: string, groupId: number, extra: Record<string, unknown> = {}) {
  asUser(author);
  return call(
    await postRoute.POST(
      req("POST", "/api/post", { title: "Hello", content: "World", groupId, status: "published", ...extra }),
    ),
  );
}

beforeEach(async () => {
  await resetDb();
  await makeUser("alice");
  await makeUser("bob");
  await makeUser("carol");
});

describe("auth", () => {
  it("rejects signed-out requests", async () => {
    asUser(null);
    expect((await call(await postRoute.GET(req("GET", "/api/post")))).status).toBe(401);
    expect((await call(await userIdRoute.PATCH(req("PATCH", "/api/user/alice", { bio: "x" }), ctx({ id: "alice" })))).status).toBe(401);
    expect((await call(await userRoute.POST(req("POST", "/api/user", {})))).status).toBe(401);
  });
});

describe("posts", () => {
  it("S1: uses the signed-in user as author, ignoring authorId in the body", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    const { status, body } = await createPost("bob", g.id, { authorId: "alice" });
    expect(status).toBe(201);
    expect(body.authorId).toBe("bob");
  });

  it("requires group membership to post", async () => {
    const g = await createGroup("alice");
    expect((await createPost("bob", g.id)).status).toBe(403);
  });

  it("B7: text-only post without an images field works", async () => {
    const g = await createGroup("alice");
    asUser("alice");
    const res = await call(await postRoute.POST(req("POST", "/api/post", { title: "t", content: "c", groupId: g.id })));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("published");
  });

  it("S5: only the author can edit; author or group admin can delete", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    await join("carol", g.id);
    const { body: post } = await createPost("bob", g.id);
    const id = String(post.id);

    asUser("carol");
    expect((await call(await postIdRoute.PATCH(req("PATCH", `/api/post/${id}`, { title: "hacked" }), ctx({ id })))).status).toBe(403);
    expect((await call(await postIdRoute.DELETE(req("DELETE", `/api/post/${id}`), ctx({ id })))).status).toBe(403);

    asUser("bob");
    expect((await call(await postIdRoute.PATCH(req("PATCH", `/api/post/${id}`, { title: "edited" }), ctx({ id })))).body.title).toBe("edited");

    asUser("alice"); // group admin
    expect((await call(await postIdRoute.DELETE(req("DELETE", `/api/post/${id}`), ctx({ id })))).status).toBe(200);
  });

  it("B2: a post with likes, comment likes and saves can be deleted", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    const { body: post } = await createPost("alice", g.id);
    const id = String(post.id);
    asUser("bob");
    await postLikeRoute.POST(req("POST", `/api/post/${id}/likes`, {}), ctx({ id }));
    await postSaveRoute.POST(req("POST", `/api/post/${id}/save`), ctx({ id }));
    const { body: c } = await call(await commentRoute.POST(req("POST", "/api/comment", { content: "hi", postId: post.id })));
    await commentLikeRoute.POST(req("POST", `/api/comment/${c.id}/likes`, {}), ctx({ id: String(c.id) }));
    await prisma.viewers.create({ data: { postId: post.id, viewerId: "bob" } });

    asUser("alice");
    expect((await call(await postIdRoute.DELETE(req("DELETE", `/api/post/${id}`), ctx({ id })))).status).toBe(200);
    expect(await prisma.post.count()).toBe(0);
  });

  it("B8: feed is newest first and hides other people's drafts", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    await createPost("alice", g.id, { title: "first" });
    await createPost("alice", g.id, { title: "second" });
    await createPost("alice", g.id, { title: "draft", status: "draft" });

    asUser("bob");
    const { body } = await call(await postRoute.GET(req("GET", "/api/post")));
    expect(body.map((p: { title: string }) => p.title)).toEqual(["second", "first"]);

    asUser("alice");
    const mine = await call(await postRoute.GET(req("GET", "/api/post")));
    expect(mine.body).toHaveLength(3);
  });

  it("U1/S14: anonymous posts are stored and hide the author from others", async () => {
    const g = await createGroup("alice", { allowAnonymity: true });
    await join("bob", g.id);
    const { body: post } = await createPost("bob", g.id, { isAnonymous: true });
    expect(post.isAnonymous).toBe(true);

    asUser("carol");
    const { body: feed } = await call(await postRoute.GET(req("GET", "/api/post")));
    expect(feed[0].authorId).not.toBe("bob");
    expect(feed[0].author.userName).toBeNull();
    expect(JSON.stringify(feed)).not.toContain("bob");

    const profile = await call(await postRoute.GET(req("GET", "/api/post?authorId=bob")));
    expect(profile.body).toHaveLength(0);
  });

  it("anonymous flag is ignored when the group does not allow it", async () => {
    const g = await createGroup("alice");
    const { body } = await createPost("alice", g.id, { isAnonymous: true });
    expect(body.isAnonymous).toBe(false);
  });

  it("U3: saved posts persist on the server", async () => {
    const g = await createGroup("alice");
    const { body: post } = await createPost("alice", g.id);
    asUser("bob");
    const id = String(post.id);
    expect((await call(await postSaveRoute.POST(req("POST", `/api/post/${id}/save`), ctx({ id })))).body.saved).toBe(true);
    const { body: saved } = await call(await savedRoute.GET(req("GET", "/api/saved")));
    expect(saved.map((p: { id: number }) => p.id)).toEqual([post.id]);
    expect(saved[0].isSaved).toBe(true);
  });
});

describe("comments", () => {
  it("S2 + B1: commenter comes from the token; delete removes the comment, not a user", async () => {
    const g = await createGroup("alice");
    const { body: post } = await createPost("alice", g.id);

    asUser("bob");
    const { body: c } = await call(
      await commentRoute.POST(req("POST", "/api/comment", { content: "hi", postId: post.id, commenterId: "carol" })),
    );
    expect(c.commenterId).toBe("bob");

    asUser("carol");
    const id = String(c.id);
    expect((await call(await commentIdRoute.PATCH(req("PATCH", `/api/comment/${id}`, { content: "x" }), ctx({ id })))).status).toBe(403);
    expect((await call(await commentIdRoute.DELETE(req("DELETE", `/api/comment/${id}`), ctx({ id })))).status).toBe(403);

    asUser("bob");
    expect((await call(await commentIdRoute.DELETE(req("DELETE", `/api/comment/${id}`), ctx({ id })))).status).toBe(200);
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.user.count()).toBe(3);
  });

  it("notifies the post author and mentioned users", async () => {
    const g = await createGroup("alice");
    const { body: post } = await createPost("alice", g.id);
    asUser("bob");
    await commentRoute.POST(req("POST", "/api/comment", { content: "nice @carol", postId: post.id }));

    asUser("alice");
    const a = await call(await notificationRoute.GET(req("GET", "/api/notification")));
    expect(a.body.notifications.map((n: { type: string }) => n.type)).toContain("comment");
    asUser("carol");
    const c = await call(await notificationRoute.GET(req("GET", "/api/notification")));
    expect(c.body.notifications.map((n: { type: string }) => n.type)).toContain("mention");
    expect(c.body.unreadCount).toBe(1);
    await notificationRoute.PATCH(req("PATCH", "/api/notification", { all: true }));
    const after = await call(await notificationRoute.GET(req("GET", "/api/notification")));
    expect(after.body.unreadCount).toBe(0);
  });
});

describe("users", () => {
  it("S6: you can only edit your own profile", async () => {
    asUser("bob");
    expect((await call(await userIdRoute.PATCH(req("PATCH", "/api/user/alice", { bio: "x" }), ctx({ id: "alice" })))).status).toBe(403);
    expect((await call(await userIdRoute.PATCH(req("PATCH", "/api/user/bob", { bio: "hi" }), ctx({ id: "bob" })))).body.bio).toBe("hi");
  });

  it("rejects a taken username", async () => {
    asUser("bob");
    expect((await call(await userIdRoute.PATCH(req("PATCH", "/api/user/bob", { userName: "alice" }), ctx({ id: "bob" })))).status).toBe(409);
  });

  it("S12: user list and other profiles do not expose email", async () => {
    asUser("bob");
    const list = await call(await userRoute.GET(req("GET", "/api/user")));
    expect(JSON.stringify(list.body)).not.toContain("@example.com");
    const other = await call(await userIdRoute.GET(req("GET", "/api/user/alice"), ctx({ id: "alice" })));
    expect(other.body.email).toBeUndefined();
    const me = await call(await userIdRoute.GET(req("GET", "/api/user/bob"), ctx({ id: "bob" })));
    expect(me.body.email).toBe("bob@example.com");
  });

  it("S13 + B5: onboarding uses the token's id and makes a unique username", async () => {
    await prisma.user.create({ data: { id: "x", email: "x@example.com", userName: "dave_name" } });
    asUser("dave");
    const { status, body } = await call(await userRoute.POST(req("POST", "/api/user", { id: "evil", email: "a@b.c" })));
    expect(status).toBe(201);
    expect(body.id).toBe("dave");
    expect(body.email).toBe("dave@example.com");
    expect(body.userName).toBe("dave_name2");
  });
});

describe("groups", () => {
  it("S7: joining always gives the member role", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    const m = await prisma.groupMember.findUnique({ where: { memberId_groupId: { memberId: "bob", groupId: g.id } } });
    expect(m?.role).toBe("member");
  });

  it("S8: only admins can edit or delete a group", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    const id = String(g.id);
    asUser("bob");
    expect((await call(await groupIdRoute.PATCH(req("PATCH", `/api/group/${id}`, { description: "x" }), ctx({ id })))).status).toBe(403);
    expect((await call(await groupIdRoute.DELETE(req("DELETE", `/api/group/${id}`), ctx({ id })))).status).toBe(403);
    asUser("alice");
    const res = await call(await groupIdRoute.PATCH(req("PATCH", `/api/group/${id}`, { allowAnonymity: true }), ctx({ id })));
    expect(res.body.allowAnonymity).toBe(true);
  });

  it("B9: description is optional", async () => {
    const g = await createGroup("alice");
    expect(g.description).toBe("");
  });

  it("the only admin cannot leave a group that still has members", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    expect((await join("alice", g.id)).status).toBe(409);
  });
});

describe("friends", () => {
  it("S9: only the receiver can accept; only the two people can delete", async () => {
    asUser("alice");
    const { body: fr } = await call(await friendRoute.POST(req("POST", "/api/friend", { receiverId: "bob" })));
    const id = String(fr.id);

    asUser("alice");
    expect((await call(await friendIdRoute.PATCH(req("PATCH", `/api/friend/${id}`, { status: "ACCEPTED" }), ctx({ id })))).status).toBe(403);
    asUser("carol");
    expect((await call(await friendIdRoute.DELETE(req("DELETE", `/api/friend/${id}`), ctx({ id })))).status).toBe(403);

    asUser("bob");
    expect((await call(await friendIdRoute.PATCH(req("PATCH", `/api/friend/${id}`, { status: "ACCEPTED" }), ctx({ id })))).body.status).toBe("ACCEPTED");
    const friends = await call(await friendRoute.GET(req("GET", "/api/friend")));
    expect(friends.body[0].otherUser.id).toBe("alice");
  });

  it("U4: lists sent requests", async () => {
    asUser("alice");
    await friendRoute.POST(req("POST", "/api/friend", { receiverId: "bob" }));
    const sent = await call(await friendReqRoute.GET(req("GET", "/api/friend/request?direction=sent")));
    expect(sent.body[0].otherUser.id).toBe("bob");
    asUser("bob");
    const incoming = await call(await friendReqRoute.GET(req("GET", "/api/friend/request")));
    expect(incoming.body[0].otherUser.id).toBe("alice");
  });

  it("cannot friend yourself or send a duplicate", async () => {
    asUser("alice");
    expect((await call(await friendRoute.POST(req("POST", "/api/friend", { receiverId: "alice" })))).status).toBe(400);
    await friendRoute.POST(req("POST", "/api/friend", { receiverId: "bob" }));
    asUser("bob");
    expect((await call(await friendRoute.POST(req("POST", "/api/friend", { receiverId: "alice" })))).status).toBe(409);
  });
});

describe("conversations", () => {
  it("S3 + S10: messages use the token's sender and outsiders cannot read", async () => {
    asUser("alice");
    const { body: convo } = await call(await convoRoute.POST(req("POST", "/api/conversation", { participants: ["bob"] })));
    const id = String(convo.id);
    const sent = await call(await messageRoute.POST(req("POST", `/api/conversation/${id}/message`, { content: "hey", senderId: "bob" }), ctx({ id })));
    expect(sent.body.senderId).toBe("alice");

    asUser("carol");
    expect((await call(await messageRoute.GET(req("GET", `/api/conversation/${id}/message`), ctx({ id })))).status).toBe(404);
    expect((await call(await convoIdRoute.GET(req("GET", `/api/conversation/${id}`), ctx({ id })))).status).toBe(404);
    expect((await call(await messageRoute.POST(req("POST", `/api/conversation/${id}/message`, { content: "x" }), ctx({ id })))).status).toBe(404);
    const list = await call(await convoRoute.GET(req("GET", "/api/conversation")));
    expect(list.body).toHaveLength(0);
  });

  it("reuses the same direct chat", async () => {
    asUser("alice");
    const a = await call(await convoRoute.POST(req("POST", "/api/conversation", { participants: ["bob"] })));
    asUser("bob");
    const b = await call(await convoRoute.POST(req("POST", "/api/conversation", { participants: ["alice"] })));
    expect(b.body.id).toBe(a.body.id);
  });

  it("B3: creates a group chat with everyone in it", async () => {
    asUser("alice");
    const { body } = await call(await convoRoute.POST(req("POST", "/api/conversation", { participants: ["bob", "carol"] })));
    expect(body.isGroup).toBe(true);
    expect(body.participants).toHaveLength(3);
  });

  it("S11: outsiders cannot delete a chat or add people", async () => {
    asUser("alice");
    const { body } = await call(await convoRoute.POST(req("POST", "/api/conversation", { participants: ["bob", "carol"] })));
    await makeUser("dave");
    const id = String(body.id);
    asUser("dave");
    expect((await call(await convoIdRoute.DELETE(req("DELETE", `/api/conversation/${id}`), ctx({ id })))).status).toBe(404);
    expect((await call(await participantsRoute.POST(req("POST", `/api/conversation/${id}/participants`, { participantId: "dave" }), ctx({ id })))).status).toBe(404);
  });

  it("B4: senders can edit and delete their own messages only", async () => {
    asUser("alice");
    const { body: convo } = await call(await convoRoute.POST(req("POST", "/api/conversation", { participants: ["bob"] })));
    const id = String(convo.id);
    const { body: m } = await call(await messageRoute.POST(req("POST", `/api/conversation/${id}/message`, { content: "hey" }), ctx({ id })));
    const p = ctx({ id, messageId: String(m.id) });

    asUser("bob");
    expect((await call(await messageIdRoute.DELETE(req("DELETE", "/x"), p))).status).toBe(403);
    asUser("alice");
    expect((await call(await messageIdRoute.PATCH(req("PATCH", "/x", { content: "edited" }), p))).body.content).toBe("edited");
    expect((await call(await messageIdRoute.DELETE(req("DELETE", "/x"), p))).status).toBe(200);
  });

  it("U6: unread counts drop after marking read", async () => {
    asUser("alice");
    const { body: convo } = await call(await convoRoute.POST(req("POST", "/api/conversation", { participants: ["bob"] })));
    const id = String(convo.id);
    await messageRoute.POST(req("POST", `/api/conversation/${id}/message`, { content: "1" }), ctx({ id }));
    await messageRoute.POST(req("POST", `/api/conversation/${id}/message`, { content: "2" }), ctx({ id }));

    asUser("bob");
    let list = await call(await convoRoute.GET(req("GET", "/api/conversation")));
    expect(list.body[0].unreadCount).toBe(2);
    await convoReadRoute.POST(req("POST", `/api/conversation/${id}/read`), ctx({ id }));
    list = await call(await convoRoute.GET(req("GET", "/api/conversation")));
    expect(list.body[0].unreadCount).toBe(0);
  });
});

import * as memberIdRoute from "@/app/api/group/[id]/member/[memberId]/route";

describe("group member management", () => {
  it("B13: invites add the friend, not toggle the inviter", async () => {
    const g = await createGroup("alice");
    asUser("alice");
    const res = await call(await memberRoute.POST(req("POST", `/api/group/${g.id}/member`, { userId: "bob" }), ctx({ id: String(g.id) })));
    expect(res.status).toBe(201);
    expect(await prisma.groupMember.count({ where: { groupId: g.id } })).toBe(2);
    asUser("carol");
    expect((await call(await memberRoute.POST(req("POST", `/api/group/${g.id}/member`, { userId: "carol" }), ctx({ id: String(g.id) })))).body.followed).toBe(true);
  });

  it("B14: only admins kick or change roles; the last admin is protected", async () => {
    const g = await createGroup("alice");
    await join("bob", g.id);
    await join("carol", g.id);
    const p = (memberId: string) => ctx({ id: String(g.id), memberId });

    asUser("bob");
    expect((await call(await memberIdRoute.DELETE(req("DELETE", "/x"), p("carol")))).status).toBe(403);
    expect((await call(await memberIdRoute.PATCH(req("PATCH", "/x", { role: "admin" }), p("bob")))).status).toBe(403);

    asUser("alice");
    expect((await call(await memberIdRoute.PATCH(req("PATCH", "/x", { role: "ADMIN" }), p("bob")))).body.role).toBe("admin");
    expect((await call(await memberIdRoute.DELETE(req("DELETE", "/x"), p("carol")))).status).toBe(200);

    asUser("bob");
    await memberIdRoute.PATCH(req("PATCH", "/x", { role: "member" }), p("alice"));
    expect((await call(await memberIdRoute.PATCH(req("PATCH", "/x", { role: "member" }), p("bob")))).status).toBe(409);
  });
});
