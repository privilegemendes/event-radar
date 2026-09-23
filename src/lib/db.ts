import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Scalar-list fields per model, read from Prisma's own datamodel rather than
 * hardcoded, so it stays correct as the schema changes.
 */
const LIST_FIELDS: Record<string, Set<string>> = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    new Set(m.fields.filter((f) => f.isList && f.kind === "scalar").map((f) => f.name)),
  ]),
);

/**
 * Drop `null` values aimed at scalar-list columns.
 *
 * Better Auth's core fills unset optional fields with null, and the Prisma
 * client refuses null on a list field ("Argument `allowedScopes` must not be
 * null"), so registering an OAuth client throws before it reaches the database
 * — even though the generated columns are nullable in Postgres. Omitting the
 * key instead lets the write through.
 *
 * KNOW THIS BEFORE RELYING ON NULL SEMANTICS: a NULL scalar list does not
 * round-trip. Postgres stores NULL and Prisma reads it back as `[]`. Where the
 * plugin distinguishes the two — @better-auth/oauth-provider treats a null
 * `allowedScopes` as "unrestricted" but an empty one as "nothing permitted" —
 * this shim is NOT enough, and every authorization fails with invalid_scope.
 * That field is therefore configured explicitly (see MCP_SCOPES in auth.ts)
 * rather than left unset. Anything else that means something by "absent"
 * needs the same treatment.
 *
 * Remove this when better-auth and the Prisma adapter agree on optional
 * arrays; as of better-auth 1.7.5 (the latest) they do not.
 */
function stripNullLists(model: string | undefined, data: unknown): unknown {
  const fields = model ? LIST_FIELDS[model] : undefined;
  if (!fields?.size || !data || typeof data !== "object" || Array.isArray(data)) return data;
  const out = { ...(data as Record<string, unknown>) };
  for (const key of fields) if (out[key] === null) delete out[key];
  return out;
}

function createClient(): PrismaClient {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        /* The casts are unavoidable: `query` is typed as a union of every
           model's arg shape, and TypeScript cannot narrow it from the runtime
           `model` string. The rewritten object is structurally identical bar
           the removed nulls. */
        create({ model, args, query }) {
          const next = { ...args, data: stripNullLists(model, args.data) };
          return query(next as unknown as Parameters<typeof query>[0]);
        },
        update({ model, args, query }) {
          const next = { ...args, data: stripNullLists(model, args.data) };
          return query(next as unknown as Parameters<typeof query>[0]);
        },
        upsert({ model, args, query }) {
          const next = {
            ...args,
            create: stripNullLists(model, args.create),
            update: stripNullLists(model, args.update),
          };
          return query(next as unknown as Parameters<typeof query>[0]);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
