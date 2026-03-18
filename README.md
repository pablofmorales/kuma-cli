# kuma-cli

> CLI for managing [Uptime Kuma](https://github.com/louislam/uptime-kuma) via its Socket.IO API.

No more clicking through the web panel — manage monitors, status pages, and heartbeats directly from your terminal.

## Install

```bash
npm install -g @blackasteroid/kuma-cli
# or
npx @blackasteroid/kuma-cli
```

## Usage

```bash
kuma login https://kuma.example.com   # authenticate + save session
kuma monitors list                    # list all monitors + status
kuma monitors add                     # add a monitor (interactive)
kuma monitors delete <id>             # delete a monitor
kuma monitors pause <id>              # pause a monitor
kuma monitors resume <id>             # resume a monitor
kuma status-pages list                # list status pages
kuma heartbeat <slug>                 # view recent heartbeats
```

## Config

Session is saved to `~/.kuma-cli.json`:

```json
{
  "url": "https://kuma.example.com",
  "token": "<session-token>"
}
```

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # compile
```

## Architecture

Uses Uptime Kuma's native Socket.IO API. No REST API required.

## License

MIT — [Black Asteroid](https://blackasteroid.com.ar)
