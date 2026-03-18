# kuma-cli

> CLI for managing [Uptime Kuma](https://github.com/louislam/uptime-kuma) via its native Socket.IO API.

No more clicking through the web panel — manage monitors, status pages, and heartbeats directly from your terminal.

## Install

```bash
npm install -g @blackasteroid/kuma-cli
```

Or use without installing:

```bash
npx @blackasteroid/kuma-cli login https://kuma.example.com
```

## Quick Start

```bash
# 1. Authenticate
kuma login https://kuma.example.com

# 2. List monitors
kuma monitors list

# 3. Add a monitor
kuma monitors add --name "My API" --type http --url https://api.example.com
```

## Commands

### Auth

| Command | Description |
|---------|-------------|
| `kuma login <url>` | Authenticate with Uptime Kuma and save session |
| `kuma logout` | Clear saved session credentials |
| `kuma status` | Show current connection config |

### Monitors

| Command | Description |
|---------|-------------|
| `kuma monitors list` | List all monitors with status + uptime |
| `kuma monitors list --json` | Output raw JSON (for scripting) |
| `kuma monitors add` | Add a monitor interactively |
| `kuma monitors add --name <n> --type http --url <url>` | Add non-interactively |
| `kuma monitors update <id>` | Update name/url/interval of a monitor |
| `kuma monitors delete <id>` | Delete a monitor (with confirmation) |
| `kuma monitors delete <id> --force` | Delete without confirmation prompt |
| `kuma monitors pause <id>` | Pause a monitor |
| `kuma monitors resume <id>` | Resume a paused monitor |

#### `monitors add` flags

| Flag | Description | Default |
|------|-------------|---------|
| `--name <name>` | Monitor name | (prompted) |
| `--type <type>` | Monitor type: `http`, `tcp`, `ping`, `dns`, `push`, ... | (prompted) |
| `--url <url>` | URL or hostname to monitor | (prompted) |
| `--interval <seconds>` | Check interval | `60` |

#### `monitors update` flags

| Flag | Description |
|------|-------------|
| `--name <name>` | New monitor name |
| `--url <url>` | New URL or hostname |
| `--interval <seconds>` | New check interval |

### Heartbeats

| Command | Description |
|---------|-------------|
| `kuma heartbeat <monitor-id>` | View last 20 heartbeats for a monitor |
| `kuma heartbeat <monitor-id> --limit 50` | Show last N heartbeats |
| `kuma heartbeat <monitor-id> --json` | Output raw JSON |

### Status Pages

| Command | Description |
|---------|-------------|
| `kuma status-pages list` | List all status pages |
| `kuma status-pages list --json` | Output raw JSON |

## Config

Session is persisted automatically after login:

```
~/.config/kuma-cli-nodejs/config.json   (Linux/macOS)
%APPDATA%\kuma-cli-nodejs\Config        (Windows)
```

```json
{
  "url": "https://kuma.example.com",
  "token": "<session-token>"
}
```

Run `kuma status` to see the config path on your system.

## Architecture

Uses Uptime Kuma's native **Socket.IO API** — no REST API, no hacks. The same protocol the web UI uses.

```
kuma login   →  socket.emit("login")        →  receives token
kuma *       →  socket.emit("loginByToken") →  authenticated session
```

## Development

```bash
git clone https://github.com/BlackAsteroid/kuma-cli
cd kuma-cli
npm install

npm run dev        # watch mode (tsup)
npm run build      # compile to dist/
npm run typecheck  # tsc --noEmit
```

### Directory Structure

```
src/
├── index.ts           # Entry point, CLI setup
├── client.ts          # Socket.IO connection + auth
├── config.ts          # ~/.kuma-cli.json persistence
├── commands/
│   ├── login.ts
│   ├── logout.ts
│   ├── monitors.ts
│   ├── status-pages.ts
│   └── heartbeat.ts
└── utils/
    ├── output.ts      # Table rendering, chalk helpers
    └── errors.ts      # Error formatting + exit codes
```

## License

MIT — [Black Asteroid](https://blackasteroid.com.ar)
