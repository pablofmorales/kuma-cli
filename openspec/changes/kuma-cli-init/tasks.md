# Tasks: kuma-cli-init

## Phase 1 — Project Scaffolding
- [ ] Init GitHub repo `pablofmorales/kuma-cli` (public, MIT)
- [ ] `npm init` + TypeScript setup (`tsconfig.json`)
- [ ] Install deps: `socket.io-client`, `commander`, `chalk`, `cli-table3`, `conf`, `enquirer` (prompts)
- [ ] Install dev deps: `tsup`, `typescript`, `@types/node`
- [ ] Setup `tsup.config.ts` for build
- [ ] Add `bin` entry in `package.json` for `kuma` command
- [ ] Create directory structure (`src/commands/`, `src/utils/`)

## Phase 2 — Core Client
- [ ] `src/config.ts` — read/write `~/.kuma-cli.json`
- [ ] `src/client.ts` — Socket.IO connect + `loginByToken` helper
- [ ] `src/utils/output.ts` — table renderer, chalk color helpers
- [ ] `src/utils/errors.ts` — consistent error formatting + exit codes

## Phase 3 — Commands
- [ ] `kuma login <url>` — auth + save session
- [ ] `kuma monitors list` — table + `--json` flag
- [ ] `kuma monitors add` — interactive + flags
- [ ] `kuma monitors delete <id>` — with confirmation
- [ ] `kuma monitors pause <id>`
- [ ] `kuma monitors resume <id>`
- [ ] `kuma status-pages list`
- [ ] `kuma heartbeat <slug>`

## Phase 4 — Polish
- [ ] `README.md` — install, usage, commands reference
- [ ] `kuma --help` output looks clean
- [ ] Test against local Uptime Kuma instance
- [ ] Publish to npm as `kuma-cli` (optional)
- [ ] Update Notion page with repo link + status → ✅ Active

## Phase 5 — Archive
- [ ] Archive `openspec/changes/kuma-cli-init/` once v1 shipped
- [ ] Update MEMORY.md with project entry
