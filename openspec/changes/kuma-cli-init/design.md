# Design: kuma-cli

## Architecture

### Tech Stack
| Layer | Library | Reason |
|-------|---------|--------|
| Runtime | Node.js 20+ / TypeScript | Native socket.io support, familiar ecosystem |
| Transport | `socket.io-client` | Kuma's native API transport |
| CLI Framework | `commander` | Mature, minimal, widely used |
| Output | `chalk` + `cli-table3` | Colored tables, readable output |
| Config | `conf` (or `~/.kuma-cli.json`) | Persists URL + auth token between sessions |
| Build | `tsup` | Fast TS bundler, single binary output |

### Directory Structure
```
kuma-cli/
├── src/
│   ├── index.ts          # Entry point, register commands
│   ├── client.ts         # Socket.IO connection + auth logic
│   ├── config.ts         # Read/write ~/.kuma-cli.json
│   ├── commands/
│   │   ├── login.ts
│   │   ├── monitors.ts
│   │   ├── status-pages.ts
│   │   └── heartbeat.ts
│   └── utils/
│       ├── output.ts     # Table rendering, chalk helpers
│       └── errors.ts     # Error formatting
├── openspec/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

### Config File (`~/.kuma-cli.json`)
```json
{
  "url": "https://kuma.example.com",
  "token": "<session-token-from-login>"
}
```

### Socket.IO API Flow
1. Connect to `<url>/socket.io/?transport=websocket`
2. Emit `login` with `{ username, password }` → receive `loginResult` with token
3. Store token in config
4. For subsequent commands: connect + emit `loginByToken` → emit command

### Commands Design

#### `kuma login <url>`
- Prompts for username + password (hidden input)
- Connects to Kuma, emits `login`
- On success: saves `url` + `token` to config
- Output: ✅ Logged in as <username>

#### `kuma monitors list`
- Emits `getMonitorList`
- Renders table: ID | Name | Type | URL | Status | Uptime 24h
- Flags: `--json` for raw output

#### `kuma monitors add`
- Interactive prompts (or flags: `--name`, `--type`, `--url`, `--interval`)
- Emits `add` with monitor payload
- Output: ✅ Monitor "<name>" created (ID: <id>)

#### `kuma monitors delete <id>`
- Confirmation prompt (unless `--force`)
- Emits `deleteMonitor`
- Output: ✅ Monitor <id> deleted

#### `kuma monitors pause <id>`
- Emits `pauseMonitor`

#### `kuma monitors resume <id>`
- Emits `resumeMonitor`

#### `kuma status-pages list`
- Emits `getStatusPageList`
- Renders table: ID | Name | Slug | URL

#### `kuma heartbeat <slug>`
- Emits `getHeartbeatList` for the given monitor slug
- Renders last 20 heartbeats: Time | Status | Latency | Message

## Error Handling
- Connection errors: clear message + suggest `kuma login` to re-auth
- Auth errors: prompt to run `kuma login` again
- Unknown monitor ID: list available IDs

## JSON Output Mode
All list commands support `--json` flag → raw JSON to stdout for scripting.
