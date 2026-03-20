# Agent Mode (JSON)

The Kuma CLI supports an extensive "Agent Mode" which makes it ideal for AI agents, CI/CD pipelines, and automation tools.

## Global JSON Mode

You can enable JSON mode for a single command by appending `--json`:
```bash
kuma monitors list --json
```

Or you can enable it globally for the current session by setting the `KUMA_JSON` environment variable:
```bash
export KUMA_JSON=1
kuma monitors list
```

## Response Envelope

All JSON responses follow a consistent envelope structure.

### Success Response
When a command succeeds, it exits with code `0` and outputs:
```json
{
  "ok": true,
  "data": { ... }
}
```

### Error Response
When a command fails, it outputs the error to `stdout` (not `stderr`, so it can be piped) and exits with a non-zero code.
```json
{
  "ok": false,
  "error": "Error message description",
  "code": 1
}
```

## Exit Codes

The CLI uses semantic exit codes:
- `0`: Success
- `1`: General Error (e.g. invalid arguments)
- `2`: Connection/Network Error (e.g. Kuma server down)
- `3`: Not Found (e.g. monitor ID does not exist)
- `4`: Auth Error (e.g. session expired, need to run `kuma login`)

## Filtering

You can perform advanced filtering to query the exact monitors you need:

- `--tag <tag>`: Filter by a specific tag
- `--status <up|down|pending|maintenance>`: Filter by monitor status
- `--search <query>`: Case-insensitive search by name or URL
- `--has-notification`: Only monitors with at least one notification
- `--without-notification`: Only monitors with NO notifications (useful for audits)
- `--uptime-below <percent>`: Only monitors with 24h uptime below the threshold

Example: Find all "Production" monitors that are down:
```bash
kuma monitors list --tag Production --status down --json
```

Example: Audit monitors missing notifications:
```bash
kuma monitors list --without-notification --json
```

## Config Export & Import

For backup or syncing across environments, you can export and import configs.

```bash
kuma config export --output backup.json --json
kuma config import backup.json --on-conflict update --json
```

The export includes both monitors and notifications, stripping out sensitive fields from notifications (passwords, tokens, webhooks) automatically.
