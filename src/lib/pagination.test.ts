import { parsePage, MAX_LIMIT } from "./pagination";

const q = (s: string) => new URLSearchParams(s);

describe("parsePage", () => {
  it("is unpaginated when no limit is given — the historical behaviour", () => {
    expect(parsePage(q(""))).toEqual({ paginated: false });
  });

  it("takes a limit", () => {
    expect(parsePage(q("limit=25"))).toEqual({ take: 25, skip: undefined, paginated: true });
  });

  it("takes a limit and offset together", () => {
    expect(parsePage(q("limit=25&offset=50"))).toEqual({ take: 25, skip: 50, paginated: true });
  });

  it("caps an oversized limit at MAX_LIMIT", () => {
    expect(parsePage(q("limit=100000")).take).toBe(MAX_LIMIT);
  });

  it("ignores an offset with no limit, rather than silently dropping rows", () => {
    // Skipping without taking would lose the first N rows of an unbounded query
    // with no way to page past them.
    expect(parsePage(q("offset=50"))).toEqual({ paginated: false });
  });

  it("treats offset=0 as no offset", () => {
    expect(parsePage(q("limit=10&offset=0")).skip).toBeUndefined();
  });

  it.each(["limit=abc", "limit=-5", "limit=0", "limit=1.5", "limit="])(
    "falls back to unpaginated on junk input (%s)",
    (s) => expect(parsePage(q(s))).toEqual({ paginated: false }),
  );

  it("ignores a junk offset but keeps a valid limit", () => {
    expect(parsePage(q("limit=10&offset=abc"))).toEqual({ take: 10, skip: undefined, paginated: true });
  });
});
