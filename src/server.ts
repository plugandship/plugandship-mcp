import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiError, PlugAndShipApi, type Tool } from "./api.js";

export const VERSION = "0.2.0";
const TYPES = ["mcp", "skill", "plugin"] as const;
const CLIENTS = ["claude-code", "cursor", "codex", "grok-bot"] as const;

const fmt = (n: number) => n.toLocaleString("en-US");
export function toolLine(t: Tool, i?: number) {
  const growth = t.stars_gained !== undefined ? `, +${fmt(t.stars_gained)} in period` : t.stars_per_day !== undefined ? `, ${t.stars_per_day}/day` : "";
  const bits = [`${i !== undefined ? `${i + 1}. ` : ""}**${t.name}** (${t.type}, ${fmt(t.stars)} stars${growth})`];
  if (t.description) bits.push(`   ${t.description.slice(0, 200)}`);
  if (t.why) bits.push(`   Why: ${t.why}`);
  if (t.remote_endpoint) bits.push(`   Remote endpoint: ${t.remote_endpoint}`);
  if (t.install) bits.push(`   Install: \`${t.install}\``);
  bits.push(`   ${t.page}  (slug: ${t.slug})`);
  return bits.join("\n");
}
const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
async function guard<T extends ReturnType<typeof text>>(fn: () => Promise<T>) {
  try { return await fn(); }
  catch (e) {
    const msg = e instanceof ApiError ? (e.status === 404 ? `Not found: ${e.message}` : e.status === 429 ? "Rate limited by plugandship.dev, try again in a minute." : `API error ${e.status}: ${e.message}`) : `Request failed: ${(e as Error).message}`;
    return { ...text(msg), isError: true };
  }
}

export function createServer(api = new PlugAndShipApi()) {
  const server = new McpServer({ name: "plugandship", version: VERSION, title: "Plug and Ship", websiteUrl: "https://plugandship.dev/developers" }, {
    instructions: "Read-only search over the Plug and Ship index of MCP servers, agent skills and coding-agent plugins (live GitHub data). Use search_tools with a plain-language task to find tools (each result says why it matches), get_tool for install details, trending for the fastest-growing tools, list_best for curated best-of lists (grok-bot-connectors lists hosted HTTPS MCP endpoints). No auth. About 60 requests per minute per IP.",
  });
  const ro = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;

  const hitSchema = z.object({
    slug: z.string(), name: z.string(), type: z.enum(TYPES), description: z.string().nullable(), stars: z.number(), install: z.string().nullable(),
    remote_endpoint: z.string().nullable(), page: z.string(), language: z.string().nullable(), license: z.string().nullable(), last_commit: z.string().nullable(),
    score: z.number().optional(), why: z.string().optional(), reasons: z.array(z.string()).optional(),
  });
  server.registerTool("search_tools", {
    title: "Search agent tools",
    description: "Find MCP servers, agent skills (SKILL.md) and coding-agent plugins for a task. Pass a plain-language task (e.g. 'query my Postgres from Cursor', 'post to Slack from Claude Code') or keywords. The task is parsed for kind (MCP/skill/plugin), client (Cursor, Claude Code, Codex, VS Code), remote vs local and language; results are ranked by relevance (full-text + semantic match), with stars, recent commits, a valid one-click config and a license only as tie-breakers. Every result explains why it matches. type, client and remote are strict filters (client grok-bot = MCP servers with a public HTTPS endpoint).",
    inputSchema: {
      query: z.string().max(300).optional().describe("Keywords or a short task, e.g. 'postgres', 'browser automation', 'query my Postgres from Cursor'"),
      task: z.string().max(300).optional().describe("What you want to do, in plain language. Used instead of query when given."),
      type: z.enum(TYPES).optional().describe("Only this kind of tool"),
      client: z.enum(CLIENTS).optional().describe("Only tools that name this coding agent (grok-bot: hosted HTTPS MCP servers)"),
      remote: z.boolean().optional().describe("Only MCP servers with a public HTTPS endpoint (nothing to install)"),
      limit: z.number().int().min(1).max(50).optional().describe("Max results, default 10"),
    },
    outputSchema: {
      query: z.string(),
      interpreted: z.object({ kind: z.string().nullable(), client: z.string().nullable(), remote: z.boolean(), local: z.boolean(), language: z.string().nullable(), terms: z.array(z.string()) }).nullable(),
      count: z.number(),
      results: z.array(hitSchema),
    },
    annotations: ro,
  }, async ({ query, task, type, client, remote, limit }) => guard(async () => {
    const q = (task ?? query ?? "").trim();
    const r = await api.search({ query: q, type, client, remote, limit: limit ?? 10 });
    const results = r.results.map((t) => ({ slug: t.slug, name: t.name, type: t.type, description: t.description, stars: t.stars, install: t.install, remote_endpoint: t.remote_endpoint, page: t.page, language: t.language, license: t.license, last_commit: t.last_commit, score: t.score, why: t.why, reasons: t.reasons }));
    const it = r.interpreted;
    const structuredContent = { query: q, interpreted: it ? { kind: it.kind, client: it.client, remote: it.remote, local: it.local, language: it.language, terms: it.terms } : null, count: results.length, results };
    const parsed = it ? [it.kind && `kind ${it.kind}`, it.client && `client ${it.client}`, it.remote && "remote", it.local && "local", it.language && `language ${it.language}`].filter(Boolean).join(", ") : "";
    const head = !r.results.length ? `No tools found for "${q}".` : `${r.results.length} result(s) for "${q}"${type ? `, type ${type}` : ""}${client ? `, client ${client}` : ""}${remote ? ", remote only" : ""}${parsed ? ` (understood: ${parsed})` : ""}:`;
    return { ...text(`${head}${r.results.length ? `\n\n${r.results.map(toolLine).join("\n\n")}` : ""}`), structuredContent };
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
    description: "Fastest-growing MCP servers, skills and plugins: stars gained in the period (day, week or month) from Plug and Ship's own daily star snapshots. While less than one period of history exists, a damped lifetime velocity fills in (repos with 20+ stars and a commit in the last 30 days).",
    inputSchema: {
      period: z.enum(["day", "week", "month"]).describe("Time window"),
      type: z.enum(TYPES).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: ro,
  }, async ({ period, type, limit }) => guard(async () => {
    const r = await api.trending(period, type, limit ?? 10);
    if (!r.results.length) return text(`No growth recorded this ${period}.`);
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
