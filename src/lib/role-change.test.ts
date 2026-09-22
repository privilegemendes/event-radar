import { checkRoleChange, isNoop, isRole, type RoleChangeRequest } from "./role-change";

const ME = "admin_me";
const THEM = "user_them";

function req(over: Partial<RoleChangeRequest> = {}): RoleChangeRequest {
  return {
    actorId: ME,
    targetId: THEM,
    targetCurrentRole: "MEMBER",
    nextRole: "ADMIN",
    adminCount: 2,
    ...over,
  };
}

describe("isRole", () => {
  it("accepts the two real roles", () => {
    expect(isRole("ADMIN")).toBe(true);
    expect(isRole("MEMBER")).toBe(true);
  });

  it("rejects anything else, including the old VIEWER value", () => {
    // VIEWER was renamed to MEMBER; a stale client must not be able to write it
    // back and reintroduce the enum mismatch that broke GET /api/users before.
    expect(isRole("VIEWER")).toBe(false);
    expect(isRole("admin")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(1)).toBe(false);
  });
});

describe("checkRoleChange", () => {
  it("allows promoting a member", () => {
    expect(checkRoleChange(req())).toEqual({ allowed: true, reason: null });
  });

  it("allows demoting another admin while others remain", () => {
    // The case this screen exists for.
    expect(checkRoleChange(req({ targetCurrentRole: "ADMIN", nextRole: "MEMBER", adminCount: 3 })).allowed).toBe(true);
  });

  it("refuses an admin demoting themselves", () => {
    // Takes effect on their next request, and only another admin can undo it.
    const v = checkRoleChange(req({ targetId: ME, targetCurrentRole: "ADMIN", nextRole: "MEMBER", adminCount: 5 }));
    expect(v.allowed).toBe(false);
    expect(v.status).toBe(409);
    expect(v.reason).toMatch(/your own admin role/i);
  });

  it("refuses demoting the last admin, even by someone else", () => {
    // Zero admins means nobody can manage users or promote anyone, ever.
    const v = checkRoleChange(req({ targetCurrentRole: "ADMIN", nextRole: "MEMBER", adminCount: 1 }));
    expect(v.allowed).toBe(false);
    expect(v.status).toBe(409);
    expect(v.reason).toMatch(/last admin/i);
  });

  it("reports self-demotion rather than last-admin when both apply", () => {
    // The actionable message: "ask another admin" is wrong when there is none,
    // but a sole admin demoting themselves is first and foremost a self-demote.
    const v = checkRoleChange(req({ targetId: ME, targetCurrentRole: "ADMIN", nextRole: "MEMBER", adminCount: 1 }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/your own admin role/i);
  });

  it("lets an admin promote themselves to the role they already hold", () => {
    // A no-op, not a refusal — the guard is about losing admin, not keeping it.
    expect(checkRoleChange(req({ targetId: ME, targetCurrentRole: "ADMIN", nextRole: "ADMIN", adminCount: 1 })).allowed).toBe(true);
  });

  it("allows promoting a member when only one admin exists", () => {
    // Nothing is lost, and this is how a workspace escapes having one admin.
    expect(checkRoleChange(req({ targetCurrentRole: "MEMBER", nextRole: "ADMIN", adminCount: 1 })).allowed).toBe(true);
  });

  it("rejects a role value outside the enum", () => {
    const v = checkRoleChange(req({ nextRole: "SUPERUSER" as never }));
    expect(v.allowed).toBe(false);
    expect(v.status).toBe(400);
  });

  it("treats a same-role change as a no-op it need not block", () => {
    expect(checkRoleChange(req({ targetCurrentRole: "MEMBER", nextRole: "MEMBER" })).allowed).toBe(true);
    expect(isNoop({ targetCurrentRole: "MEMBER", nextRole: "MEMBER" })).toBe(true);
    expect(isNoop({ targetCurrentRole: "MEMBER", nextRole: "ADMIN" })).toBe(false);
  });
});
