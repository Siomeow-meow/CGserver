import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import { verifyToken } from "@clerk/backend";
import type { WebSocket as WSWebSocket } from "ws";
import {
  createMessage,
  findOrCreateDirectConversation,
  isParticipant,
  participantIds,
} from "@/lib/conversation";
import { prisma } from "@/lib/db";
import { toId } from "@/lib/http";

/**
 * Real-time chat.
 *
 * 1. The client sends { type: "authenticate", token } with its Clerk session
 *    token. The user id is taken from the verified token, never the payload.
 * 2. Then { type: "message", content, receiverId? , conversationId? }.
 *
 * Connected sockets are kept in memory, so live delivery only reaches users
 * on the same server instance. The frontend also polls, so messages still
 * arrive (a few seconds later) when the two users are on different instances.
 */
const sockets = new Map<string, Set<WSWebSocket>>();

function send(ws: WSWebSocket, payload: unknown) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // socket already closed
  }
}

export async function GET() {
  return experimental_upgradeWebSocket((ws: WSWebSocket) => {
    let userId: string | null = null;

    ws.on("close", () => {
      if (userId) sockets.get(userId)?.delete(ws);
    });

    ws.on("message", async (data: WebSocketData) => {
      try {
        const payload = JSON.parse(data.toString());

        if (payload?.type === "authenticate") {
          const claims = await verifyToken(String(payload.token ?? ""), {
            secretKey: process.env.CLERK_SECRET_KEY,
          });
          userId = claims.sub;
          if (!sockets.has(userId)) sockets.set(userId, new Set());
          sockets.get(userId)!.add(ws);
          send(ws, { type: "authenticated" });
          return;
        }

        if (!userId) {
          send(ws, { type: "error", message: "Not authenticated" });
          return;
        }

        if (payload?.type !== "message") return;
        const content = typeof payload.content === "string" ? payload.content.trim() : "";
        if (!content) return;

        let conversationId = toId(String(payload.conversationId ?? ""));
        if (conversationId) {
          if (!(await isParticipant(userId, conversationId))) {
            send(ws, { type: "error", message: "Conversation not found" });
            return;
          }
        } else {
          const receiverId = typeof payload.receiverId === "string" ? payload.receiverId : "";
          const receiver = receiverId
            ? await prisma.user.findUnique({ where: { id: receiverId } })
            : null;
          if (!receiver || receiverId === userId) {
            send(ws, { type: "error", message: "Recipient not found" });
            return;
          }
          conversationId = (await findOrCreateDirectConversation(userId, receiverId)).id;
        }

        const message = await createMessage(content, userId, conversationId);
        for (const pid of await participantIds(conversationId)) {
          sockets.get(pid)?.forEach((s) => send(s, { type: "message", message }));
        }
      } catch (error) {
        console.error("WebSocket error:", error);
        send(ws, {
          type: "error",
          message: userId ? "Failed to send message" : "Authentication failed",
        });
      }
    });
  });
}
