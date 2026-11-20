import { vi } from "vitest";

/**
 * In-memory stand-ins for Supabase and Next.js request APIs used by the
 * server actions. Placeholder values only: nothing here resembles a real key.
 */

export class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}

type QueryResult = { data: unknown; error: unknown };

/** Chainable PostgREST-like builder that resolves to `result`. */
export function queryBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.insert = vi.fn(async () => ({ data: null, error: null }));
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

export type MembershipRow = {
  role: "owner" | "admin" | "manager" | "worker";
  status: "invited" | "active" | "suspended";
  organization: { id: string; name: string };
};

export function createSupabaseDouble(
  options: {
    userId?: string | null;
    memberships?: MembershipRow[];
  } = {},
) {
  const userId =
    options.userId === undefined
      ? "11111111-1111-4111-8111-111111111111"
      : options.userId;
  const memberships = options.memberships ?? [];
  const builders: Array<{ table: string; builder: ReturnType<typeof queryBuilder> }> = [];

  const client = {
    auth: {
      getUser: vi.fn(async () =>
        userId
          ? { data: { user: { id: userId, email: "korisnik@primer.test" } }, error: null }
          : {
              data: { user: null },
              error: { code: "session_not_found", message: "no session" },
            },
      ),
      signUp: vi.fn(async () => ({
        data: { user: { id: userId }, session: null },
        error: null,
      })),
      signInWithPassword: vi.fn(async () => ({
        data: { user: { id: userId }, session: {} },
        error: null,
      })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      updateUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: vi.fn(async () => ({
        data: { user: { id: userId }, session: {} },
        error: null,
      })),
      verifyOtp: vi.fn(async () => ({
        data: { user: { id: userId }, session: {} },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      const builder =
        table === "memberships"
          ? queryBuilder({ data: memberships, error: null })
          : queryBuilder({ data: { full_name: "Marko Marković" }, error: null });
      builders.push({ table, builder });
      return builder;
    }),
    rpc: vi.fn(async () => ({
      data: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as unknown,
      error: null as unknown,
    })),
  };

  return { client, builders };
}

/** Minimal cookies() store. */
export function createCookieStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn((name: string) =>
      values.has(name) ? { name, value: values.get(name)! } : undefined,
    ),
    getAll: vi.fn(() => [...values].map(([name, value]) => ({ name, value }))),
    set: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
    delete: vi.fn((name: string) => {
      values.delete(name);
    }),
  };
}
