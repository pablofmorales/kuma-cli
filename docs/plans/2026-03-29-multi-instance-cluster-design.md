# Multi-Instance & Cluster Support — Design Document

**Date:** 2026-03-29

**Goal:** Enable kuma-cli to manage multiple Uptime Kuma instances and cluster them together for high availability, with synchronized monitor configurations and a unified status view.

**Architecture:** Layered approach — config schema migration, a thin InstanceManager that resolves which instance(s) to target, and new command modules for instance and cluster management. The existing `KumaClient` stays unchanged; the new layer orchestrates multiple clients when needed.

**Tech Stack:** Existing stack (TypeScript, Commander.js, Socket.IO, conf library). No new dependencies required.

---

## 1. Config Schema & Migration

### New Schema

```json
{
  "instances": {
    "production": { "url": "https://kuma1.example.com", "token": "abc123..." },
    "staging": { "url": "https://kuma2.example.com", "token": "def456..." }
  },
  "clusters": {
    "prod-ha": {
      "instances": ["production", "staging"],
      "primary": "production"
    }
  },
  "active": {
    "type": "instance",
    "name": "production"
  }
}
```

### Migration

On first run after upgrade, if the config contains the old `{url, token}` shape:

1. Derive instance name from hostname (e.g. `kuma1.example.com` -> `kuma1-example-com`)
2. Move to `instances.<name>: {url, token}`
3. Set `active: {type: "instance", name: "<name>"}`
4. Delete old `url` and `token` keys

The migration is idempotent — running it twice produces the same result.

---

## 2. Instance Manager

**File:** `src/instance-manager.ts`

Resolves which instance to connect to given CLI flags and active context.

### Resolution Priority

```
resolveInstance(flags) ->
  1. if flags.instance -> return that instance
  2. if flags.cluster -> return primary of that cluster
  3. if config.active -> return active (instance or cluster primary)
  4. if only one instance exists -> return it
  5. throw "no active instance, use 'kuma use <name>'"
```

### Cluster Resolution

```
resolveCluster(flags) ->
  1. if flags.cluster -> return that cluster
  2. if config.active.type === "cluster" -> return active cluster
  3. throw "no cluster specified"
```

Creates a `KumaClient` for each instance in a cluster, runs operations on all, and merges results.

**Key principle:** `KumaClient` stays unchanged — it handles one connection. The manager orchestrates multiple clients when needed.

---

## 3. Instance Commands

**File:** `src/commands/instances.ts`

### `kuma login <url> --as <alias>`

- If `--as` provided, use that as instance name
- Otherwise, derive from hostname: `https://kuma.prod.example.com` -> `kuma-prod-example-com`
- If name already exists in config, prompt: "Instance 'X' already exists. Overwrite? (y/n)"
- On success, auto-set as active instance
- Existing `login` behavior preserved when only one instance exists

### `kuma instances list`

```
  NAME        URL                          STATUS
-> production  https://kuma1.example.com     active
  staging     https://kuma2.example.com
```

### `kuma instances remove <name>`

- Refuse if instance belongs to a cluster (show which cluster, tell user to remove from cluster first)
- Confirm before removing
- If removing the active instance, clear active context

### `kuma use <name>`

- Set active context to instance
- `kuma use --cluster prod-ha` sets active context to cluster (commands default to primary)

### `kuma logout`

- Modified: logs out the active instance (removes token but keeps instance entry)
- `kuma logout --all` clears everything

---

## 4. Cluster Commands

**File:** `src/commands/cluster.ts`

### `kuma cluster create <name> --instances prod,staging --primary prod`

- Validates all instance names exist in config
- Validates primary is one of the listed instances
- Saves cluster definition to config
- Does NOT auto-create health monitors (that's `cluster sync`)

### `kuma cluster list`

```
NAME      INSTANCES              PRIMARY
prod-ha   production, staging    production
```

### `kuma cluster info <name>`

Connects to each instance to show live status:

```
Cluster: prod-ha

  INSTANCE     URL                         REACHABLE   MONITORS   HEALTH MONITOR
-> production   https://kuma1.example.com    yes         42         --
  staging      https://kuma2.example.com    yes         42         UP (checks production)
```

### `kuma cluster remove <name>`

- Removes cluster definition from config
- Does NOT delete cross-health monitors from instances (user can delete manually)
- Confirm before removing

### `kuma cluster sync <name>`

Connects to primary, fetches all monitors. For each secondary:

1. **Monitor sync:** Match by `name` + `type` + `url`. If exists, skip (idempotent). If not found, create.
2. **Cross-health monitors:** On each instance, check if a monitor targeting each other instance's URL already exists (match by URL). If not, create an HTTP monitor: name `[cluster] <other-instance-name>`, tag `kuma-cluster:<cluster-name>`, targeting the other instance's root URL.
3. **Notifications:** Synced to all instances but disabled on secondaries, enabled on primary only.

Summary output:

```
Syncing cluster prod-ha (primary: production -> staging)

Monitors:      42 checked, 3 created, 39 skipped (already exist)
Health:        1 created (staging -> production already exists)
Notifications: 5 synced (disabled on staging)
```

---

## 5. Unified Cluster View

### `kuma monitors list --cluster prod-ha`

- Connects to all instances concurrently
- Fetches monitors from each
- Deduplicates by `name` + `type` + `url`
- Worst-status-wins: DOWN > MAINTENANCE > PENDING > UP
- Excludes monitors tagged `kuma-cluster:<cluster-name>` (cross-health monitors are infrastructure noise)

```
NAME              URL                    STATUS   UPTIME
My API            https://api.example    UP       99.8%
Homepage          https://example.com    DOWN     94.2%
Database          tcp://db:5432          UP       100%
```

---

## 6. Existing Command Changes

### `--instance` flag on all commands

All commands that use `getConfig()` will instead go through the instance manager. `--instance <name>` overrides the active context:

```bash
kuma monitors list --instance staging
kuma monitors add --instance production --name "My API" --type http --url https://api.example
kuma notifications list --instance staging
```

### `--cluster` flag on read commands only

Only read commands get `--cluster` support (unified view): `monitors list`, `heartbeat view`. Write commands always target a single instance — use `cluster sync` to propagate.

### `kuma status` updated

Shows active context, all instances, and cluster membership:

```
Active: production (cluster: prod-ha)
Config: ~/.config/kuma-cli-nodejs/config.json

Instances: 2
Clusters:  1
```

---

## 7. Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Instance naming | Auto from hostname + `--as` override | Low friction, flexible |
| Config storage | Single `conf` store, structured keys | Single source of truth |
| Sync scope | Monitors now, notifications (disabled on secondary) | Core HA concern |
| Sync direction | Primary -> secondaries | Simple, predictable |
| Health checks | HTTP monitors inside Kuma itself | Visible in dashboard, Kuma does what it's good at |
| Dedup strategy | Match by name+type+url, worst-status-wins | Full picture, conservative |
| Failover | None — CLI is read/sync, Kuma handles alerting | Correct separation of concerns |
| CLI context | `kuma use` default + per-command `--instance`/`--cluster` flags | Ergonomic + scriptable |
| Notification failover | Primary owns active notifications, secondaries have them disabled | Avoids duplicate alerts |
