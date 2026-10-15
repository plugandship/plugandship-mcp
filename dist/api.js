/** Thin client for the Plug and Ship public read-only API (https://plugandship.dev/api/v1). */
export const DEFAULT_BASE = "https://plugandship.dev";
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export class PlugAndShipApi {
    base;
    fetchImpl;
    constructor(base = process.env.PLUGANDSHIP_API_URL || DEFAULT_BASE, fetchImpl = fetch) {
        this.base = base;
        this.fetchImpl = fetchImpl;
        this.base = this.base.replace(/\/$/, "");
    }
    async get(path, params = {}) {
        const u = new URL(`${this.base}/api/v1${path}`);
        for (const [k, v] of Object.entries(params))
            if (v !== undefined && v !== "")
                u.searchParams.set(k, String(v));
        const r = await this.fetchImpl(u, { headers: { accept: "application/json", "user-agent": "plugandship-mcp/0.1.0" }, signal: AbortSignal.timeout(15_000) });
        const body = (await r.json().catch(() => ({})));
        if (!r.ok)
            throw new ApiError(r.status, body?.message || `HTTP ${r.status}`);
        return body;
    }
    search(q) {
        return this.get("/search", { q: q.query, type: q.type, client: q.client, limit: q.limit });
    }
    tool(slug) { return this.get(`/tools/${encodeURIComponent(slug)}`); }
    trending(period, type, limit) { return this.get("/trending", { period, type, limit }); }
    bestTopics() { return this.get("/best"); }
    best(topic, limit) {
        return this.get(`/best/${encodeURIComponent(topic)}`, { limit });
    }
}
