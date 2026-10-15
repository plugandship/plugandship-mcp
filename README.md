# plugandship-mcp

An MCP server for [Plug and Ship](https://plugandship.dev). It lets your coding agent search the Plug and Ship index of MCP servers, agent skills and coding-agent plugins without leaving the chat.

It is read-only. It calls the public Plug and Ship API (`/api/v1`) and needs no API key.

Listed in the official MCP Registry as `dev.plugandship/plugandship-mcp`.

## Tools

| Tool | Arguments | What it returns |
| --- | --- | --- |
| `search_tools` | `query`, `type?` (`mcp` / `skill` / `plugin`), `client?` (`claude-code` / `cursor` / `codex` / `grok-bot`), `limit?` (1 to 50, default 10) | Matching tools with stars, install command and page link. `client: "grok-bot"` keeps only MCP servers with a public remote (HTTP) endpoint. |
| `get_tool` | `slug` | Full details for one tool: description, repo, stars, tags, install command, remote endpoint if any. |
| `trending` | `period` (`day` / `week` / `month`), `type?`, `limit?` | Repos created in the period, ranked by stars per day. |
| `list_best` | `topic?`, `limit?` | A curated "best of" list. Leave `topic` empty to list topics (for example `grok-bot-connectors`, `voice-agents`, `postgres-mcp-servers`). |

## Use the hosted endpoint (no install)

Remote MCP server, Streamable HTTP, stateless, no auth:

```
https://plugandship.dev/mcp
```

**Claude Code**

```bash
claude mcp add --transport http plugandship https://plugandship.dev/mcp
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json` in a project)

```json
{
  "mcpServers": {
    "plugandship": { "url": "https://plugandship.dev/mcp" }
  }
}
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.plugandship]
url = "https://plugandship.dev/mcp"
```

## Run it locally (stdio)

Requires Node.js 18 or newer. Runs straight from GitHub, no npm package needed (the built `dist/` is committed):

```bash
npx -y github:plugandship/plugandship-mcp
```

**Claude Code**

```bash
claude mcp add plugandship -- npx -y github:plugandship/plugandship-mcp
```

**Cursor**

```json
{
  "mcpServers": {
    "plugandship": {
      "command": "npx",
      "args": ["-y", "github:plugandship/plugandship-mcp"]
    }
  }
}
```

**Codex**

```toml
[mcp_servers.plugandship]
command = "npx"
args = ["-y", "github:plugandship/plugandship-mcp"]
```

### From a checkout

```bash
git clone https://github.com/plugandship/plugandship-mcp
cd plugandship-mcp
npm install
npm run build
node dist/index.js
```

## Self-host Streamable HTTP

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
npm test                                            # stdio + local HTTP, against https://plugandship.dev
PLUGANDSHIP_API_URL=http://localhost:3000 npm test  # against a local site
MCP_REMOTE_URL=https://plugandship.dev/mcp npm run test:remote  # the hosted endpoint
```

`npm test` builds the server, starts it over stdio and over Streamable HTTP, connects with the official MCP SDK client, lists the tools and calls each one, including error cases (unknown slug, invalid input, foreign Origin). `test:remote` runs the same checks against a remote endpoint.

## Registry

`server.json` is the [MCP Registry](https://registry.modelcontextprotocol.io) entry: a remote-only listing (streamable-http, `https://plugandship.dev/mcp`) under the `dev.plugandship` namespace, verified by DNS.

## License

MIT
