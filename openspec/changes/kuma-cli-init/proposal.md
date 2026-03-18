# Proposal: kuma-cli

## Intent
Create a standalone CLI tool (`kuma-cli`) that allows managing an Uptime Kuma instance entirely from the terminal via its native Socket.IO API.

## Problem
Uptime Kuma has no official CLI. All management (adding/removing monitors, checking status, managing status pages) requires navigating the web UI — slow and inconvenient for homelab/power users.

## Solution
A Node.js/TypeScript CLI that authenticates with Uptime Kuma's Socket.IO API and exposes all common management operations as simple terminal commands.

## Goals
- Authenticate and persist session locally (`~/.kuma-cli.json`)
- List, create, update, delete, pause, and resume monitors
- View heartbeats and uptime stats
- Manage status pages
- Clean, readable output (tables, colors)
- Scriptable (JSON output mode for piping)

## Out of Scope (v1)
- Notification channel management
- Tag management
- Docker integration
- Multi-instance profiles (v2)

## Repo
- **Name:** `kuma-cli`
- **Owner:** pablofmorales (GitHub)
- **Type:** Standalone open-source repo
- **License:** MIT

## Notion Page
- https://www.notion.so/kuma-cli-327b4f172d2081df8d7fc21755189ca9
