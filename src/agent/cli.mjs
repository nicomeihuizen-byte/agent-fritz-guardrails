// Ask the demo agent one question about the sample site.
//
//   ANTHROPIC_API_KEY=... node src/agent/cli.mjs "What does Tidewatch cost?"
import { loadSite, answer } from "./agent.mjs";

const q = process.argv.slice(2).join(" ");
if (!q) { console.error('Usage: node src/agent/cli.mjs "your question"'); process.exit(1); }
const pages = await loadSite(new URL("../../sample-site/", import.meta.url).pathname);
const r = await answer(pages, [{ role: "user", content: q }], { dryRun: true });
console.log(r.text);
if (r.source) console.log(`\n  source: ${r.source.page} | "${r.source.quote}"`);
console.log(`  tools: ${r.tools.join(", ") || "none"}`);
