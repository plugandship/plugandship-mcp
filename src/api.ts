/** Thin client for the Plug and Ship public read-only API (https://plugandship.dev/api/v1). */
export const DEFAULT_BASE = "https://plugandship.dev";

export type Tool = {
  slug: string; name: string; type: "mcp" | "skill" | "plugin"; description: string | null; page: string; repo_url: string; homepage: string | null;
  stars: number; upvotes: number; install: string | null; remote_endpoint: string | null; categories: string[]; tags: string[];
  language: string | null; license: string | null; last_commit: string | null; created: string | null; verified: boolean; stars_per_day?: number;
};

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export class PlugAndShipApi {
  constructor(private base = process.env.PLUGANDSHIP_API_URL || DEFAULT_BASE, private fetchImpl: typeof fetch = fetch) {
    this.base = this.base.replace(/\/$/, "");
  }
  private async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const u = new URL(`${this.base}/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
    const r = await this.fetchImpl(u, { headers: { accept: "application/json", "user-agent": "plugandship-mcp/0.1.0" }, signal: AbortSignal.timeout(15_000) });
    const body = (await r.json().catch(() => ({}))) as T & { message?: string };
    if (!r.ok) throw new ApiError(r.status, body?.message || `HTTP ${r.status}`);
    return body;
  }
  search(q: { query?: string; type?: string; client?: string; limit?: number }) {
    return this.get<{ count: number; results: Tool[] }>("/search", { q: q.query, type: q.type, client: q.client, limit: q.limit });
  }
  tool(slug: string) { return this.get<{ tool: Tool }>(`/tools/${encodeURIComponent(slug)}`); }
  trending(period: string, type?: string, limit?: number) { return this.get<{ period: string; method: string; results: Tool[] }>("/trending", { period, type, limit }); }
  bestTopics() { return this.get<{ topics: { topic: string; title: string; page: string }[] }>("/best"); }
  best(topic: string, limit?: number) {
    return this.get<{ topic: string; title: string; page: string; note: string; tools: Tool[]; curated?: { name: string; remote_endpoint: string; description: string; auth: string; caveat: string | null; source: string; page: string | null }[] }>(`/best/${encodeURIComponent(topic)}`, { limit });
  }
}
