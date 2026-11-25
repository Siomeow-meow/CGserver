import { vi } from "vitest";

/**
 * Tests run the real route handlers against a real Postgres database.
 * Set TEST_DATABASE_URL to an EMPTY database you don't mind being wiped;
 * run `npm run test:db` once to apply migrations to it.
 *
 * Clerk is replaced by a stub: `asUser("u1")` decides who is signed in.
 */
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL to an empty test database before running tests.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const state = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => ({
        id,
        username: `${id}_name`,
        firstName: "Test",
        lastName: "User",
        imageUrl: "https://example.com/a.png",
        primaryEmailAddress: { emailAddress: `${id}@example.com` },
        emailAddresses: [{ emailAddress: `${id}@example.com` }],
      }),
    },
  }),
}));

(globalThis as unknown as { __setUser: (id: string | null) => void }).__setUser = (
  id,
) => {
  state.userId = id;
};
