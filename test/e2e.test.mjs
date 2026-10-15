// End-to-end: spawn the built server, connect with the official MCP SDK client over stdio and over
// Streamable HTTP, list tools and call each one against a live Plug and Ship API.
// API base: PLUGANDSHIP_API_URL (default https://plugandship.dev).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exercise } from "./helpers.mjs";

const API = process.env.PLUGANDSHIP_API_URL || "https://plugandship.dev";
const env = { ...process.env, PLUGANDSHIP_API_URL: API };
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
