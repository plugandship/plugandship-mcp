// Shared assertions: list the four tools and call each one, including error cases.
import assert from "node:assert/strict";
export const textOf = (r) => r.content.map((c) => c.text).join("\n");
export async function exercise(client) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_tool", "list_best", "search_tools", "trending"]);
  for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true, `${t.name} is read-only`);

  const s = await client.callTool({ name: "search_tools", arguments: { query: "postgres", type: "mcp", limit: 3 } });
  assert.ok(!s.isError, textOf(s)); assert.match(textOf(s), /slug: [a-z0-9-]+/);

  const g = await client.callTool({ name: "search_tools", arguments: { query: "", client: "grok-bot", limit: 2 } });
  assert.ok(!g.isError, textOf(g)); assert.match(textOf(g), /Remote endpoint: https:\/\//);

  const d = await client.callTool({ name: "get_tool", arguments: { slug: "github-mcp-server" } });
  assert.ok(!d.isError, textOf(d)); assert.match(textOf(d), /# Github MCP Server/i); assert.match(textOf(d), /Stars: [\d,]+/);

  const nf = await client.callTool({ name: "get_tool", arguments: { slug: "definitely-not-a-real-tool-xyz" } });
  assert.equal(nf.isError, true); assert.match(textOf(nf), /Not found/);

  const tr = await client.callTool({ name: "trending", arguments: { period: "week", limit: 3 } });
  assert.ok(!tr.isError, textOf(tr)); assert.match(textOf(tr), /Trending this week|Nothing new/);

  const lt = await client.callTool({ name: "list_best", arguments: {} });
  assert.match(textOf(lt), /grok-bot-connectors/);
  const lb = await client.callTool({ name: "list_best", arguments: { topic: "grok-bot-connectors", limit: 3 } });
  assert.ok(!lb.isError, textOf(lb)); assert.match(textOf(lb), /Hand-checked remote servers/); assert.match(textOf(lb), /https:\/\/api\.githubcopilot\.com\/mcp\//);
  const lv = await client.callTool({ name: "list_best", arguments: { topic: "voice-agents", limit: 3 } });
  assert.ok(!lv.isError, textOf(lv)); assert.match(textOf(lv), /Voice agents/);

  const bad = await client.callTool({ name: "trending", arguments: { period: "year" } });
  assert.equal(bad.isError, true, "invalid input is rejected");
}

