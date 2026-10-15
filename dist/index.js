#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, VERSION } from "./server.js";
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes("--help") || args.includes("-h")) {
    console.log(`plugandship-mcp ${VERSION}\n\nUsage:\n  plugandship-mcp            stdio transport (default)\n  plugandship-mcp --http [--port 3333] [--host 127.0.0.1]   Streamable HTTP at /mcp\n\nEnv: PLUGANDSHIP_API_URL (default https://plugandship.dev)`);
    process.exit(0);
}
if (args.includes("--http")) {
    const port = Number(flag("--port") ?? process.env.PORT ?? 3333);
    const host = flag("--host") ?? "127.0.0.1";
    const http = createHttpServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        if (url.pathname !== "/mcp") {
            res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not_found", hint: "POST /mcp" }));
            return;
        }
        // Reject browser requests from foreign origins (DNS rebinding protection for a local server).
        const origin = req.headers.origin;
        if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            res.writeHead(403).end("Forbidden origin");
            return;
        }
        if (req.method !== "POST") {
            res.writeHead(405, { allow: "POST" }).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)" }, id: null }));
            return;
        }
        let body = "";
        for await (const c of req) {
            body += c;
            if (body.length > 1e6) {
                res.writeHead(413).end();
                return;
            }
        }
        let parsed;
        try {
            parsed = JSON.parse(body);
        }
        catch {
            res.writeHead(400).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
            return;
        }
        // Stateless: a fresh server + transport per request.
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on("close", () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res, parsed);
    });
    http.listen(port, host, () => console.error(`plugandship-mcp ${VERSION}: Streamable HTTP on http://${host}:${port}/mcp`));
}
else {
    const server = createServer();
    await server.connect(new StdioServerTransport());
    console.error(`plugandship-mcp ${VERSION} running on stdio`);
}
