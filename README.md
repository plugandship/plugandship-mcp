# plugandship-mcp

An MCP server for [Plug and Ship](https://plugandship.dev). It lets your coding agent search the Plug and Ship index of MCP servers, agent skills and coding-agent plugins without leaving the chat.

It is read-only. It calls the public Plug and Ship API (`/api/v1`) and needs no API key.

> Status: open source, **not published** to npm or any MCP registry yet. Install it from a local checkout (see below).

## Tools

| Tool | Arguments | What it returns |
| --- | --- | --- |
| `search_tools` | `query`, `type?` (`mcp` / `skill` / `plugin`), `client?` (`claude-code` / `cursor` / `codex` / `grok-bot`), `limit?` (1 to 25) | Matching tools with stars, install command and page link. `client: "grok-bot"` keeps only MCP servers with a public remote (HTTP) endpoint. |
| `get_tool` | `slug` | Full details for one tool: description, repo, stars, tags, install command, remote endpoint if any. |
| `trending` | `period?` (`day` / `week` / `month`), `limit?` | Repos created in the period, ranked by stars per day. |
| `list_best` | `topic?`, `limit?` | A curated "best of" list. Leave `topic` empty to list topics (for example `grok-bot-connectors`, `voice-agents`, `postgres-mcp-servers`). |

## Install (local checkout)

Requires Node.js 18 or newer.

```bash
cd plugandship-mcp
npm install
npm run build
```

Then point your client at `dist/index.js` (use the absolute path).

**Claude Code**

```bash
claude mcp add plugandship -- node /absolute/path/to/plugandship-mcp/dist/index.js
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json` in a project)

```json
{
  "mcpServers": {
    "plugandship": {
      "command": "node",
      "args": ["/absolute/path/to/plugandship-mcp/dist/index.js"]
    }
  }
}
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.plugandship]
command = "node"
args = ["/absolute/path/to/plugandship-mcp/dist/index.js"]
```

## Streamable HTTP mode

```bash
node dist/index.js --http --port 3333 --host 127.0.0.1
# endpoint: http://127.0.0.1:3333/mcp
```

Stateless, JSON responses, POST only. Requests with a browser `Origin` other than localhost are rejected. It binds to 127.0.0.1 by default. Put it behind HTTPS before exposing it anywhere.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PLUGANDSHIP_API_URL` | `https://plugandship.dev` | API base URL (use `http://localhost:3000` against a local site). |

The public API is cached and rate-limited (about 60 requests per minute per IP). On a 429 the tool returns a short "try again in a minute" error.

## Test

```bash
npm test                                         # against https://plugandship.dev
PLUGANDSHIP_API_URL=http://localhost:3101 npm test  # against a local site
```

The end-to-end test (`test/e2e.test.mjs`) builds the server, starts it over stdio and over Streamable HTTP, connects with the official MCP SDK client, lists the tools and calls each one, including error cases (unknown slug, invalid input, foreign Origin).

## License

MIT
