import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard against the owner-global profile bug.
 *
 * `getApplicantProfile()` and `setApplicantProfile(profile)` fall back to the
 * OWNER's row when no userId is given. That fallback exists so Phase 0 could
 * land without touching callers, and it quietly outlived its purpose: every
 * admin was shown Irmak's brief as their own, and saving the settings form
 * would have written over hers.
 *
 * The defect is not in settings.ts — the fallback is deliberate there. It is in
 * whoever calls it without saying whose profile they mean. So this test reads
 * the routes rather than exercising them: a unit test of a handler would need a
 * database and a session, and would still only cover the one route someone
 * remembered to write a test for.
 */

const API_DIR = join(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** `getApplicantProfile()` / `setApplicantProfile(x)` — no user argument. */
const UNSCOPED_GET = /getApplicantProfile\(\s*\)/;
const UNSCOPED_SET = /setApplicantProfile\(\s*[A-Za-z_$][\w$]*\s*\)/;

/**
 * Strip comments before matching.
 *
 * Without this the guard flags a doc comment that merely *names* the unscoped
 * call — which it did, on the very comment explaining the fix.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("profile reads are scoped to a speaker", () => {
  const files = routeFiles(API_DIR);

  it("finds the API routes to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f.replace(process.cwd() + "/", ""), f]))(
    "%s does not read the owner's profile by default",
    (_label, file) => {
      const src = code(readFileSync(file, "utf8"));
      expect(src).not.toMatch(UNSCOPED_GET);
      expect(src).not.toMatch(UNSCOPED_SET);
    },
  );
});

describe("the patterns this guard matches", () => {
  // Proving the guard can fail — a regex that matches nothing would pass the
  // suite above forever without testing anything.
  it("flags a bare read", () => {
    expect("const p = await getApplicantProfile();").toMatch(UNSCOPED_GET);
  });

  it("flags a write with only a profile argument", () => {
    expect("await setApplicantProfile(clean);").toMatch(UNSCOPED_SET);
  });

  it("allows a read scoped to a user", () => {
    expect("await getApplicantProfile(session.userId)").not.toMatch(UNSCOPED_GET);
  });

  it("allows a write scoped to a user", () => {
    expect("await setApplicantProfile(clean, session.userId)").not.toMatch(UNSCOPED_SET);
  });

  it("ignores a comment that merely names the unscoped call", () => {
    // A whole block comment, delimiters included — that is what a source file
    // actually contains, and what tripped this guard the first time.
    expect(code("/**\n * Without it `getApplicantProfile()` falls back.\n */")).not.toMatch(UNSCOPED_GET);
    expect(code("/* setApplicantProfile(clean) is the old form */")).not.toMatch(UNSCOPED_SET);
    expect(code("// await getApplicantProfile() was wrong")).not.toMatch(UNSCOPED_GET);
  });

  it("still sees real code on the same line as a trailing comment", () => {
    expect(code("await getApplicantProfile(); // wrong")).toMatch(UNSCOPED_GET);
  });
});
