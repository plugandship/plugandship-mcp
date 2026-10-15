// Remote endpoint check with the official SDK client: initialize, list tools, call each tool.
// Runs only when MCP_REMOTE_URL is set, e.g. MCP_REMOTE_URL=https://plugandship.dev/mcp npm run test:remote
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exercise } from "./helpers.mjs";

const URL_ = process.env.MCP_REMOTE_URL;

test("remote Streamable HTTP endpoint", { skip: !URL_ && "set MCP_REMOTE_URL" }, async () => {
  const client = new Client({ name: "remote-check", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
  try {
    const info = client.getServerVersion();
    assert.equal(info?.name, "plugandship");
    assert.ok(client.getServerCapabilities()?.tools, "server advertises tools");
    await exercise(client);
  } finally { await client.close(); }
  const get = await fetch(URL_, { headers: { accept: "text/event-stream" } });
  assert.equal(get.status, 405, "stateless: no standalone SSE stream");
  const bad = await fetch(URL_, { method: "POST", headers: { origin: "http://evil.example", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
  assert.equal(bad.status, 403, "foreign Origin rejected");
});
