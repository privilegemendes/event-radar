/**
 * Demo driver: ask the MCP server for one event, the way a client would.
 *
 *   node mcp/demo-apply.mjs <eventId>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];

const t = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, "server.mjs")],
  env: {
    PATH: process.env.PATH,
    EVENT_RADAR_URL: process.env.EVENT_RADAR_URL ?? "http://localhost:3000",
    MCP_SERVICE_EMAIL: process.env.MCP_SERVICE_EMAIL,
    MCP_SERVICE_PASSWORD: process.env.MCP_SERVICE_PASSWORD,
  },
});
const c = new Client({ name: "demo", version: "0.1.0" });
await c.connect(t);

const tool = process.argv[3] ?? "apply_to_event";
const r = await c.callTool({ name: tool, arguments: { id } });
if (r.isError) { console.log("TOOL ERROR:", r.content[0].text); await c.close(); process.exit(1); }
const e = JSON.parse(r.content[0].text);

console.log(JSON.stringify(tool === "apply_to_event" ? { ...e, fieldHints: "(omitted)" } : e, null, 2));

await c.close();
