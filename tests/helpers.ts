import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export function asUser(id: string | null) {
  (globalThis as unknown as { __setUser: (id: string | null) => void }).__setUser(id);
}

export function req(method: string, url: string, body?: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

export async function call(res: Response) {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }
}

export async function makeUser(id: string) {
  return prisma.user.create({
    data: { id, email: `${id}@example.com`, userName: id },
  });
}
