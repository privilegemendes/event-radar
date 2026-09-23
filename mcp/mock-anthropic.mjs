/**
 * Minimal stand-in for the Anthropic Messages API, for verifying the scoring
 * path without a live model.
 *
 * The real ANTHROPIC_* values in this project point at a Coder-workspace AI
 * bridge that is not reachable outside a workspace (it answers 403), and PR #18
 * verified its own scoring work the same way. This exercises EVERYTHING except
 * the model's judgement: the route, auth, batching, reply parsing, validation
 * and the database write.
 *
 * It echoes one score per event in the prompt, deriving the count from the
 * prompt's own numbered list so batch sizes line up.
 *
 *   node mcp/mock-anthropic.mjs [port]
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4010);

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const prompt = (() => {
      try { return JSON.parse(body).messages?.[0]?.content ?? ""; } catch { return ""; }
    })();

    /* buildScoringPrompt() states the batch size outright ("exactly N
       objects"), which is far more robust than counting rendered events.
       Counting list markers under-reports, and a reply shorter than the batch
       leaves the remainder unscored — correct app behaviour, but a misleading
       verification. */
    const n = Number(prompt.match(/exactly (\d+) objects/)?.[1] ?? 1);

    const scores = Array.from({ length: n }, (_, i) => ({
      index: i,
      relevancyScore: 40 + ((i * 17) % 55),
      relevancyRationale: `Stubbed score for verification (event ${i}).`,
      acceptanceLikelihood: ["HIGH", "MEDIUM", "LOW"][i % 3],
      acceptanceRationale: "Stubbed rationale.",
      suggestedAction: ["ATTEND", "APPLY_TO_SPEAK", "BOTH"][i % 3],
      category: ["ATTEND", "SPEAK", "PARTICIPATE"][i % 3],
      employerRelevant: i % 2 === 0,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(scores) + "\n```" }],
    }));
  });
}).listen(port, () => console.error(`mock anthropic on http://localhost:${port}`));
