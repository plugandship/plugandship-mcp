import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiError, PlugAndShipApi, type Tool } from "./api.js";

export const VERSION = "0.1.0";
const TYPES = ["mcp", "skill", "plugin"] as const;
const CLIENTS = ["claude-code", "cursor", "codex", "grok-bot"] as const;

const fmt = (n: number) => n.toLocaleString("en-US");
export function toolLine(t: Tool, i?: number) {
  const bits = [`${i !== undefined ? `${i + 1}. ` : ""}**${t.name}** (${t.type}, ${fmt(t.stars)} stars${t.stars_per_day !== undefined ? `, ${t.stars_per_day}/day` : ""})`];
  if (t.description) bits.push(`   ${t.description.slice(0, 200)}`);
  if (t.remote_endpoint) bits.push(`   Remote endpoint: ${t.remote_endpoint}`);
  if (t.install) bits.push(`   Install: \`${t.install}\``);
  bits.push(`   ${t.page}  (slug: ${t.slug})`);
  return bits.join("\n");
}
const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
async function guard(fn: () => Promise<ReturnType<typeof text>>) {
  try { return await fn(); }
  catch (e) {
    const msg = e instanceof ApiError ? (e.status === 404 ? `Not found: ${e.message}` : e.status === 429 ? "Rate limited by plugandship.dev, try again in a minute." : `API error ${e.status}: ${e.message}`) : `Request failed: ${(e as Error).message}`;
    return { ...text(msg), isError: true };
  }
}

export function createServer(api = new PlugAndShipApi()) {
  const server = new McpServer({ name: "plugandship", version: VERSION, title: "Plug and Ship" });
  const ro = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;

  server.registerTool("search_tools", {
    title: "Search agent tools",
    description: "Search the Plug and Ship index of MCP servers, agent skills (SKILL.md) and coding-agent plugins. Results are ranked by name match, then GitHub stars, and include install commands. Use client to narrow to a coding agent (grok-bot returns only MCP servers with a public HTTPS endpoint).",
    inputSchema: {
      query: z.string().max(100).describe("Keywords, e.g. 'postgres', 'figma', 'browser automation'"),
      type: z.enum(TYPES).optional().describe("Only this kind of tool"),
      client: z.enum(CLIENTS).optional().describe("Only tools for this coding agent"),
      limit: z.number().int().min(1).max(50).optional().describe("Max results, default 10"),
    },
    annotations: ro,
  }, async ({ query, type, client, limit }) => guard(async () => {
    const r = await api.search({ query, type, client, limit: limit ?? 10 });
    if (!r.results.length) return text(`No tools found for "${query}".`);
    return text(`${r.results.length} result(s) for "${query}"${type ? `, type ${type}` : ""}${client ? `, client ${client}` : ""}:\n\n${r.results.map(toolLine).join("\n\n")}`);
  }));

  server.registerTool("get_tool", {
    title: "Get tool details",
    description: "Full details for one tool by its Plug and Ship slug (from search_tools): description, stars, install command, remote endpoint, license, tags and last commit.",
    inputSchema: { slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,120}$/i).describe("Tool slug, e.g. 'github-mcp-server'") },
    annotations: ro,
  }, async ({ slug }) => guard(async () => {
    const { tool: t } = await api.tool(slug);
    const rows: [string, string | null][] = [["Type", t.type], ["Stars", fmt(t.stars)], ["Upvotes", fmt(t.upvotes)], ["Install", t.install], ["Remote endpoint", t.remote_endpoint], ["Repo", t.repo_url], ["Homepage", t.homepage], ["Language", t.language], ["License", t.license], ["Last commit", t.last_commit?.slice(0, 10) ?? null], ["Categories", t.categories.join(", ") || null], ["Tags", t.tags.slice(0, 12).join(", ") || null], ["Verified maker", t.verified ? "yes" : null], ["Page", t.page]];
    return text(`# ${t.name}\n\n${t.description ?? ""}\n\n${rows.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`);
  }));

  server.registerTool("trending", {
    title: "Trending tools",
    description: "New MCP servers, skills and plugins created on GitHub in the period, ranked by stars gained per day since creation.",
    inputSchema: {
      period: z.enum(["day", "week", "month"]).describe("Time window"),
      type: z.enum(TYPES).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: ro,
  }, async ({ period, type, limit }) => guard(async () => {
    const r = await api.trending(period, type, limit ?? 10);
    if (!r.results.length) return text(`Nothing new this ${period}.`);
    return text(`Trending this ${period} (${r.method}):\n\n${r.results.map(toolLine).join("\n\n")}`);
  }));

  server.registerTool("list_best", {
    title: "Best-of list",
    description: "A ranked best-of list by topic, e.g. 'grok-bot-connectors', 'voice-agents', 'local-models', 'figma-mcp-servers', 'mcp-servers-for-databases'. Omit topic to list all topics.",
    inputSchema: {
      topic: z.string().regex(/^[a-z0-9-]{2,80}$/).optional().describe("Topic slug; omit to list topics"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: ro,
  }, async ({ topic, limit }) => guard(async () => {
    if (!topic) { const r = await api.bestTopics(); return text(`Available topics:\n${r.topics.map((t) => `- ${t.topic}: ${t.title}`).join("\n")}`); }
    const r = await api.best(topic, limit ?? 10);
    const cur = r.curated?.length ? `Hand-checked remote servers:\n${r.curated.map((c, i) => `${i + 1}. **${c.name}**: ${c.remote_endpoint} (auth: ${c.auth})${c.caveat ? `\n   Caveat: ${c.caveat}` : ""}\n   Source: ${c.source}`).join("\n")}\n\n` : "";
    return text(`# ${r.title}\n${r.page}\n(${r.note})\n\n${cur}${r.tools.length ? `${r.curated ? "From the index:\n" : ""}${r.tools.map(toolLine).join("\n\n")}` : ""}`);
  }));

  return server;
}
