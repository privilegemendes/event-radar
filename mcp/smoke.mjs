/**
 * End-to-end smoke test: drives mcp/server.mjs over a REAL stdio transport
 * using the MCP SDK's own client, exactly as Claude Desktop would.
 *
 *   node mcp/smoke.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, "server.mjs")],
  env: {
    PATH: process.env.PATH,
    EVENT_RADAR_URL: process.env.EVENT_RADAR_URL ?? "http://localhost:3000",
    MCP_SERVICE_EMAIL: process.env.MCP_SERVICE_EMAIL,
    MCP_SERVICE_PASSWORD: process.env.MCP_SERVICE_PASSWORD,
  },
});

const client = new Client({ name: "smoke", version: "0.1.0" });
await client.connect(transport);
console.log("\nEvent Radar MCP server — stdio smoke test\n");

const parse = (r) => JSON.parse(r.content[0].text);
const call = (n, a = {}) => client.callTool({ name: n, arguments: a });

console.log("1. Handshake");
const { tools } = await client.listTools();
const EXPECTED = ["search_events", "get_event", "get_pipeline_summary", "list_partners", "list_speakers", "score_my_inbox"];
const names = tools.map((t) => t.name).sort();
check("server advertises the expected tools", JSON.stringify(names) === JSON.stringify([...EXPECTED].sort()), names.join(", "));
check("every tool has a description", tools.every((t) => t.description?.length > 40));

/* score_my_inbox is NOT exercised here: it is the one WRITE tool and every call
   spends real model time. Its success path, both error branches and its
   no-overwrite guarantee are verified against mcp/mock-anthropic.mjs instead. */
const score = tools.find((t) => t.name === "score_my_inbox");
check("write tool is bounded by a limit", score?.inputSchema?.properties?.limit?.maximum === 200,
  `max=${score?.inputSchema?.properties?.limit?.maximum}`);

console.log("\n2. get_pipeline_summary");
const sum = parse(await call("get_pipeline_summary"));
check("returns the three badges", "toTriage" in sum && "coderEmeaEvents" in sum, JSON.stringify(sum).slice(0, 80));

console.log("\n3. search_events — bounded by default");
const d = parse(await call("search_events"));
check("defaults to 25 rows, not all 1300", d.events.length === 25, `${d.events.length} rows of ${d.total}`);
check("reports how to page", typeof d.more === "string", d.more);
const bytes = Buffer.byteLength(JSON.stringify(d));
check("payload is context-safe", bytes < 30_000, `${(bytes / 1024).toFixed(1)} KB (~${Math.round(bytes / 4)} tokens)`);

console.log("\n4. search_events — paging and filters");
const p2 = parse(await call("search_events", { offset: 25 }));
check("offset pages cleanly", p2.events.every((a) => !d.events.some((b) => b.id === a.id)), p2.showing);
/* A track filter returns 0 for THIS account by design, not by accident: the
   service account has judged nothing, and event-filter.ts excludes a speaker
   with no opportunity row from any category-filtered list ("No concrete
   category matches the default (null)"). Asserting `every()` over an empty
   array would pass vacuously, so assert the narrowing itself. */
const speak = parse(await call("search_events", { track: "SPEAK", limit: 5 }));
check("track filter narrows (0 for an unjudged account — correct)",
  speak.total < d.total && speak.events.every((e) => e.track === "SPEAK"),
  `${speak.total} SPEAK vs ${d.total} unfiltered`);
const coder = parse(await call("search_events", { coderEventsOnly: true, limit: 5 }));
check("coderEventsOnly filter applies", coder.events.every((e) => e.coderEvent), `${coder.total} Coder events`);
const found = parse(await call("search_events", { search: "AI", limit: 3 }));
check("free-text search applies", found.total > 0, `${found.total} matches for "AI"`);

console.log("\n5. get_event");
const one = parse(await call("get_event", { id: d.events[0].id }));
check("returns full detail", one.id === d.events[0].id && "description" in one, one.title?.slice(0, 50));

console.log("\n6. list_partners / list_speakers");
const partners = parse(await call("list_partners"));
check("partners listed", partners.total > 0, `${partners.total} partners`);
const emea = parse(await call("list_partners", { region: "EMEA" }));
check("territory filter applies (incl. multi-value rows)",
  emea.total > 0 && emea.total < partners.total, `${emea.total} of ${partners.total} in EMEA`);
const speakers = parse(await call("list_speakers"));
check("speakers bounded by default", speakers.showing <= 25, `${speakers.showing} of ${speakers.total}`);

console.log("\n7. Error handling");
const bad = await call("get_event", { id: "does-not-exist" });
check("unknown id is a clean tool error, not a crash", bad.isError === true, bad.content[0].text.slice(0, 60));

await client.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? ` — ${failed} FAILED` : ""}\n`);
process.exit(failed ? 1 : 0);
