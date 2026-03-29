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

### Auth & Instances

| Command | Description |
|---------|-------------|
| `kuma login <url>` | Authenticate with Uptime Kuma and save session |
| `kuma login <url> --as <alias>` | Save the instance under a custom alias |
| `kuma logout` | Clear token for the active instance |
| `kuma logout --all` | Clear all saved instances and config |
| `kuma status` | Show active instance, cluster membership, and config path |
| `kuma instances list` | List all saved instances and their aliases |
| `kuma instances remove <name>` | Remove a saved instance by its alias |
| `kuma use <name>` | Switch the active instance |
| `kuma use --cluster <name>` | Switch the active cluster |

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

### Clusters

| Command | Description |
|---------|-------------|
| `kuma cluster create <name> --instances a,b --primary a` | Create a cluster from saved instances |
| `kuma cluster list` | List all clusters |
| `kuma cluster info <name>` | Show cluster details with live instance status |
| `kuma cluster sync <name>` | Sync monitors and notifications from primary to secondaries |
| `kuma cluster sync <name> --dry-run` | Preview sync without making changes |
| `kuma cluster remove <name>` | Remove a cluster definition |
| `kuma monitors list --cluster <name>` | Unified view across all cluster instances |

### Config Export/Import

| Command | Description |
|---------|-------------|
| `kuma config export --output <file>` | Export monitors and notifications to a JSON/YAML file |
| `kuma config import <file>` | Import monitors and notifications from a file |

For detailed usage, check [Config Export & Import](./docs/config-export-import.md).

## Multi-Instance & Clusters

kuma-cli can manage multiple Uptime Kuma servers and cluster them together for high availability.

### Connecting to multiple instances

Each time you login, you give the instance an **alias** — a short name you'll use to reference it in other commands. If you don't provide one, it's auto-derived from the hostname.

```bash
# Login and name each instance
$ kuma login https://kuma1.example.com --as server1
  ✓ Logged in to https://kuma1.example.com as "server1"

$ kuma login https://kuma2.example.com --as server2
  ✓ Logged in to https://kuma2.example.com as "server2"
```

The alias is how you reference this instance everywhere: `--instance server1`, `kuma use server1`, and when creating clusters.

```bash
# See all saved instances
$ kuma instances list
     Name     URL                          Token
  →  server1  https://kuma1.example.com    ab12...ef56
     server2  https://kuma2.example.com    cd34...gh78

# Switch the active instance
$ kuma use server2
  ✓ Active instance: 'server2' (https://kuma2.example.com)

# Or target a specific instance per-command without switching
$ kuma monitors list --instance server1
```

### Creating a cluster

A **cluster** groups instances together for HA. You need to be logged in to each instance first.

- `<name>` is any label you choose (e.g. `my-cluster`, `prod-ha`)
- `--instances` takes the aliases you created with `--as` during login
- `--primary` is the source of truth — its monitors get replicated to the others

```bash
# Create a cluster (this is a local config operation, no network calls)
$ kuma cluster create my-cluster --instances server1,server2 --primary server1
  ✓ Cluster 'my-cluster' created with instances: server1, server2 (primary: server1)

# See all clusters
$ kuma cluster list
  Name        Instances        Primary
  my-cluster  server1, server2 server1
```

### Syncing a cluster

`cluster sync` copies the primary's monitors to all secondaries. It's **idempotent** — existing monitors (matched by name + type + URL) are skipped.

```bash
# Preview what would be synced
$ kuma cluster sync my-cluster --dry-run

# Run the actual sync
$ kuma cluster sync my-cluster
  ℹ Syncing cluster 'my-cluster' (primary: server1)
  ℹ Monitors to sync: 42

  ℹ server1 → server2: 3 created, 39 skipped, 0 failed
  ℹ Health monitors: 2 created, 0 skipped
  ℹ Notifications: 5 synced (disabled on secondaries), 0 skipped
  ✓ Sync complete.
```

**What gets synced:**
1. **Monitors** from the primary are replicated to each secondary
2. **Health monitors** — each instance gets an HTTP check targeting every other instance's URL, so you can see in Uptime Kuma's dashboard if a cluster member goes down
3. **Notifications** are copied to secondaries but **kept disabled** to avoid duplicate alerts. The primary owns active notifications.

### Unified cluster view

See all monitors across the cluster in a single view. Monitors are deduplicated by name — if one instance reports DOWN while another reports UP, the worst status wins.

```bash
$ kuma monitors list --cluster my-cluster
  ℹ Cluster 'my-cluster' — unified view (42 monitors, worst-status-wins)

  ID   Name        Type  URL / Host             Status  Uptime 24h  Ping
  1    My API      http  https://api.example    ● UP    99.8%       45ms
  2    Homepage    http  https://example.com    ● DOWN  94.2%       --
  3    Database    tcp   db.internal:5432       ● UP    100%        12ms
```

### Cluster health

Check instance connectivity and health monitor status:

```bash
$ kuma cluster info my-cluster
  ℹ Cluster: my-cluster

     Instance  URL                        Reachable  Monitors  Health Monitors
  →  server1   https://kuma1.example.com  yes        42        —
     server2   https://kuma2.example.com  yes        42        [cluster] server1: ● UP
```

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
  "instances": {
    "server1": { "url": "https://kuma1.example.com", "token": "***" },
    "server2": { "url": "https://kuma2.example.com", "token": "***" }
  },
  "clusters": {
    "my-cluster": { "instances": ["server1", "server2"], "primary": "server1" }
  },
  "active": { "type": "instance", "name": "server1" }
}
```

> **Upgrading from a previous version?** The old `{url, token}` config is auto-migrated on first run. The instance alias is derived from the hostname.

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
├── index.ts              # Entry point, CLI setup
├── client.ts             # Socket.IO connection + auth
├── config.ts             # Multi-instance config persistence + migration
├── instance-manager.ts   # Instance/cluster resolution logic
├── commands/
│   ├── login.ts
│   ├── logout.ts
│   ├── monitors.ts
│   ├── heartbeat.ts
│   ├── notifications.ts
│   ├── status-pages.ts
│   ├── config.ts         # Export/import
│   ├── instances.ts      # Instance management
│   ├── use.ts            # Context switching
│   └── cluster.ts        # Cluster management + sync
└── utils/
    ├── output.ts         # Table rendering, chalk helpers
    └── errors.ts         # Error formatting + exit codes
```

## License

MIT — [Black Asteroid](https://blackasteroid.com.ar)
