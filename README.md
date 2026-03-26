# kuma-cli

> CLI for managing [Uptime Kuma](https://github.com/louislam/uptime-kuma) via its native Socket.IO API. No more clicking through the web panel — manage monitors, status pages, and heartbeats from your terminal.

[![kuma-cli demo](.github/assets/demo.gif)](https://github.com/BlackAsteroid/kuma-cli/releases/latest/download/demo.mp4)

## Install

### Homebrew (macOS / Linux)

```bash
brew tap BlackAsteroid/tap
brew install kuma-cli
```

### npm

```bash
npm install -g @blackasteroid/kuma-cli
```

Or use without installing:

```bash
npx @blackasteroid/kuma-cli login https://kuma.example.com
```

## Quick start

```bash
# 1. Authenticate
kuma login https://kuma.example.com

# 2. List monitors
kuma monitors list

# 3. Create a monitor
kuma monitors create --name "My API" --type http --url https://api.example.com
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
| `kuma monitors list --status down --json` | Filter by status |
| `kuma monitors list --tag <tag> --json` | Filter by tag |
| `kuma monitors add` | Add a monitor interactively |
| `kuma monitors add --name <n> --type http --url <url>` | Add non-interactively |
| `kuma monitors create --type http --name <n> --url <url>` | Create monitor non-interactively (pipeline-safe) |
| `kuma monitors create --type push --name <n> --json` | Create push monitor, returns pushToken |
| `kuma monitors update <id>` | Update name/url/interval of a monitor |
| `kuma monitors delete <id>` | Delete a monitor (with confirmation) |
| `kuma monitors delete <id> --force` | Delete without confirmation prompt |
| `kuma monitors pause <id>` | Pause a monitor |
| `kuma monitors resume <id>` | Resume a paused monitor |
| `kuma monitors bulk-pause --tag <tag>` | Pause all monitors matching tag |
| `kuma monitors bulk-pause --tag <tag> --dry-run` | Preview without touching anything |
| `kuma monitors bulk-resume --tag <tag>` | Resume all monitors matching tag |
| `kuma monitors set-notification <id> --notification-id <id>` | Assign notification to monitor |

### Heartbeats

| Command | Description |
|---------|-------------|
| `kuma heartbeat view <monitor-id>` | View last 20 heartbeats |
| `kuma heartbeat view <monitor-id> --limit 50` | Show last N heartbeats |
| `kuma heartbeat view <monitor-id> --json` | Output raw JSON |
| `kuma heartbeat send <push-token>` | Send push heartbeat (no auth needed) |
| `kuma heartbeat send <push-token> --status down --msg "text"` | Send with status/message |

### Notifications

| Command | Description |
|---------|-------------|
| `kuma notifications list` | List all notification channels |
| `kuma notifications create --type discord --name <n> --url <webhook>` | Create Discord notification channel |

### Status pages

| Command | Description |
|---------|-------------|
| `kuma status-pages list` | List all status pages |
| `kuma status-pages list --json` | Output raw JSON |

### Config Export/Import

| Command | Description |
|---------|-------------|
| `kuma config export --output <file>` | Export monitors and notifications to a JSON/YAML file |
| `kuma config import <file>` | Import monitors and notifications from a file |

For detailed usage, check [Config Export & Import](./docs/config-export-import.md).

## Using with AI agents

kuma-cli works well in agent and automation contexts. Every command supports `--json` output and exits non-zero on errors, so you can parse results reliably and short-circuit on failure.

For more details, see [Agent Mode (JSON)](./docs/agent-mode.md).

Set `KUMA_JSON=1` to force JSON output on all commands — useful when you don't control the call site.

**Check what's down:**
```bash
kuma monitors list --status down --json
```

**Pause/resume around a deploy:**
```bash
kuma monitors bulk-pause --tag Production --dry-run   # preview first
kuma monitors bulk-pause --tag Production
./deploy.sh
kuma monitors bulk-resume --tag Production
```

**Create a monitor and wire up a notification in one shot:**
```bash
MONITOR_ID=$(kuma monitors create --type http --name "my-service" \
  --url https://my-service.com --tag Production --json | jq -r '.data.id')
kuma monitors set-notification $MONITOR_ID --notification-id 1
```

**Push monitor for a GitHub Actions runner:**
```bash
# Create the monitor, capture the token
TOKEN=$(kuma monitors create --type push --name "runner-aang" --json | jq -r '.data.pushToken')

# In the workflow:
- name: Heartbeat
  run: kuma heartbeat send ${{ secrets.RUNNER_PUSH_TOKEN }}
```

**Connect a notification channel to all production monitors:**
```bash
NOTIF_ID=$(kuma notifications create --type discord --name "alerts" \
  --url $WEBHOOK --json | jq -r '.data.id')
kuma monitors list --tag Production --json | jq -r '.[].id' | \
  xargs -I{} kuma monitors set-notification {} --notification-id $NOTIF_ID
```

## Config

After login, your session is saved automatically — you won't need to re-authenticate on every command:

```
~/.config/kuma-cli-nodejs/config.json  (Linux/macOS)
%APPDATA%\kuma-cli-nodejs\Config       (Windows)
```

```json
{
  "url": "https://kuma.example.com",
  "token": "***"
}
```

Run `kuma status` to see the exact config path on your machine.

## Architecture

kuma-cli talks to Uptime Kuma through its native **Socket.IO API** — the same protocol the web UI uses. No REST shims, no scraping, no hacks.

```
kuma login  → socket.emit("login")         → receives token
kuma *      → socket.emit("loginByToken")  → authenticated session
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
├── index.ts          # Entry point, CLI setup
├── client.ts         # Socket.IO connection + auth
├── config.ts         # ~/.kuma-cli.json persistence
├── commands/
│   ├── login.ts
│   ├── logout.ts
│   ├── monitors.ts
│   ├── status-pages.ts
│   └── heartbeat.ts
└── utils/
    ├── output.ts     # Table rendering, chalk helpers
    └── errors.ts     # Error formatting + exit codes
```

## License

MIT — [Black Asteroid](https://blackasteroid.com.ar)
