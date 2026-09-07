# Configuration

Toco MCP is **zero-config**. Every endpoint it reads is public, so there is no API key,
no OAuth, and no login step. This page covers install options and optional tuning.

## Client setup

### npx (recommended)

```json
{
  "mcpServers": {
    "toco": {
      "command": "npx",
      "args": ["-y", "@bintangtimurlangit/toco-mcp"]
    }
  }
}
```

### Global install

```bash
npm install -g @bintangtimurlangit/toco-mcp
```

```json
{
  "mcpServers": {
    "toco": {
      "command": "toco-mcp"
    }
  }
}
```

### From source

```bash
git clone https://github.com/bintangtimurlangit/toco-mcp.git
cd toco-mcp
npm install
npm run build
```

```json
{
  "mcpServers": {
    "toco": {
      "command": "node",
      "args": ["/absolute/path/to/toco-mcp/build/index.js"]
    }
  }
}
```

Use an **absolute** path — MCP clients do not resolve relative ones.

## Where the config file lives

| Client                   | Path                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| Claude Desktop (macOS)   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| Claude Code              | `.mcp.json` in the project root, or `claude mcp add`              |

Restart the client after editing.

## Environment variables

All optional. Copy `.env.example` to `.env`, or set them in the `env` block of your
`mcpServers` entry.

| Variable            | Default | Description                                             |
| ------------------- | ------- | ------------------------------------------------------- |
| `CACHE_TTL_MS`      | `30000` | How long a cached response stays fresh, in milliseconds |
| `CACHE_MAX_ENTRIES` | `200`   | Entries kept before the oldest are evicted              |
| `DEBUG`             | `false` | Set to `true` to log startup info to stderr             |

Raising `CACHE_TTL_MS` cuts requests to Toco at the cost of staleness — prices and stock
move, so keep it low if you care about live figures.

```json
{
  "mcpServers": {
    "toco": {
      "command": "npx",
      "args": ["-y", "@bintangtimurlangit/toco-mcp"],
      "env": { "CACHE_TTL_MS": "60000", "DEBUG": "true" }
    }
  }
}
```

## Verifying it works

```bash
npm test
```

This spawns the server and calls every tool against live Toco. All checks passing means
your network can reach Toco and no endpoint has drifted. If checks fail, see
[Development](./DEVELOPMENT.md#when-toco-changes).

## Troubleshooting

**Server doesn't appear in the client.** Confirm the JSON is valid, the path is absolute,
and you restarted the client.

**Every tool errors with a network message.** Check that `toco.id` and
`api-main.tocobagus.net` are reachable from your machine; both are required.

**Reviews or store info fail while search works.** Those two read Toco's server-rendered
pages via a build id that rotates on each Toco deploy. The server re-scrapes automatically;
a persistent failure means the page shape changed — please open an issue.
