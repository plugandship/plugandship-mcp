// End-to-end: spawn the built server, connect with the official MCP SDK client over stdio and over
// Streamable HTTP, list tools and call each one against a live Plug and Ship API.
// API base: PLUGANDSHIP_API_URL (default https://plugandship.dev).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const API = process.env.PLUGANDSHIP_API_URL || "https://plugandship.dev";
const env = { ...process.env, PLUGANDSHIP_API_URL: API };
const textOf = (r) => r.content.map((c) => c.text).join("\n");

async function exercise(client) {
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

test("stdio transport", async () => {
  const client = new Client({ name: "e2e", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env, stderr: "pipe" }));
  try { assert.equal(client.getServerVersion()?.name, "plugandship"); await exercise(client); } finally { await client.close(); }
});

test("Streamable HTTP transport", async () => {
  const port = 3900 + Math.floor(Math.random() * 90);
  const proc = spawn(process.execPath, ["dist/index.js", "--http", "--port", String(port)], { env, stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((ok, fail) => { proc.stderr.on("data", (d) => /Streamable HTTP on/.test(String(d)) && ok()); proc.on("exit", fail); setTimeout(() => fail(new Error("server did not start")), 10_000); });
  const client = new Client({ name: "e2e-http", version: "0.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await exercise(client);
    const forbidden = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    assert.equal(forbidden.status, 403, "foreign Origin rejected");
  } finally { await client.close(); proc.kill(); }
});
