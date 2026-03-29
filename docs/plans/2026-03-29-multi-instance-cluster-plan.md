# Multi-Instance & Cluster Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable kuma-cli to manage multiple Uptime Kuma instances with cluster support for HA.

**Architecture:** Layered — config migration, InstanceManager, new command modules. KumaClient unchanged.

**Tech Stack:** TypeScript, Commander.js, Socket.IO, conf library, Vitest (new, for testing).

**Tracking:** https://github.com/BlackAsteroid/kuma-cli/issues/59

---

### Task 1: Set Up Test Framework

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `src/__tests__/smoke.test.ts`

**Step 1: Install vitest**

Run: `npm install -D vitest`

**Step 2: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

**Step 3: Add test script to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Write smoke test**

```typescript
// src/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/__tests__/smoke.test.ts
git commit -m "chore: add vitest test framework"
```

---

### Task 2: Config Schema Migration

**Files:**
- Modify: `src/config.ts`
- Create: `src/__tests__/config.test.ts`

**Step 1: Write failing tests for new config schema**

```typescript
// src/__tests__/config.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// We'll mock the conf module to test config logic without filesystem
// First, let's test the migration and multi-instance functions

describe("config migration", () => {
  it("migrates old {url, token} to new schema", () => {
    // Old shape: { url: "https://kuma.example.com", token: "abc" }
    // New shape: { instances: { "kuma-example-com": { url, token } }, active: { type: "instance", name: "kuma-example-com" } }
    const oldConfig = { url: "https://kuma.example.com", token: "abc123" };
    const result = migrateConfig(oldConfig);
    expect(result.instances).toBeDefined();
    expect(result.instances["kuma-example-com"]).toEqual({
      url: "https://kuma.example.com",
      token: "abc123",
    });
    expect(result.active).toEqual({ type: "instance", name: "kuma-example-com" });
    expect(result.url).toBeUndefined();
    expect(result.token).toBeUndefined();
  });

  it("is idempotent — already-migrated config unchanged", () => {
    const newConfig = {
      instances: { prod: { url: "https://kuma.example.com", token: "abc" } },
      clusters: {},
      active: { type: "instance" as const, name: "prod" },
    };
    const result = migrateConfig(newConfig);
    expect(result).toEqual(newConfig);
  });

  it("derives hostname correctly", () => {
    expect(deriveInstanceName("https://kuma.prod.example.com")).toBe("kuma-prod-example-com");
    expect(deriveInstanceName("https://192.168.1.1:3001")).toBe("192-168-1-1-3001");
    expect(deriveInstanceName("http://localhost:3001")).toBe("localhost-3001");
  });
});

describe("instance config operations", () => {
  it("getInstanceConfig returns instance by name", () => {
    // tested after implementation
  });

  it("saveInstanceConfig adds a new instance", () => {
    // tested after implementation
  });

  it("removeInstanceConfig removes an instance", () => {
    // tested after implementation
  });

  it("getActiveContext returns active instance or cluster", () => {
    // tested after implementation
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `migrateConfig` and `deriveInstanceName` not defined

**Step 3: Implement new config.ts**

Replace `src/config.ts` entirely:

```typescript
import Conf from "conf";

// --- Interfaces ---

export interface InstanceConfig {
  url: string;
  token: string;
}

export interface ClusterConfig {
  instances: string[];
  primary: string;
}

export interface ActiveContext {
  type: "instance" | "cluster";
  name: string;
}

export interface KumaConfigSchema {
  instances: Record<string, InstanceConfig>;
  clusters: Record<string, ClusterConfig>;
  active: ActiveContext | null;
}

// Legacy shape for migration
interface LegacyConfig {
  url?: string;
  token?: string;
}

// --- Conf store (schemaless to support migration) ---

const conf = new Conf<Record<string, unknown>>({
  projectName: "kuma-cli",
});

// --- Hostname derivation ---

export function deriveInstanceName(url: string): string {
  try {
    const parsed = new URL(url);
    let name = parsed.hostname;
    if (parsed.port) {
      name += `-${parsed.port}`;
    }
    // Replace dots and other non-alphanumeric chars with hyphens
    return name.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  } catch {
    return url.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
}

// --- Migration ---

export function migrateConfig(raw: Record<string, unknown>): KumaConfigSchema {
  // Already migrated
  if (raw.instances && typeof raw.instances === "object") {
    return raw as unknown as KumaConfigSchema;
  }

  // Legacy shape: { url, token }
  const legacy = raw as unknown as LegacyConfig;
  if (legacy.url && legacy.token) {
    const name = deriveInstanceName(legacy.url);
    return {
      instances: {
        [name]: { url: legacy.url, token: legacy.token },
      },
      clusters: {},
      active: { type: "instance", name },
    };
  }

  // Empty/fresh config
  return { instances: {}, clusters: {}, active: null };
}

// --- Internal: load & save full config ---

function loadConfig(): KumaConfigSchema {
  const raw = conf.store;
  const migrated = migrateConfig(raw as Record<string, unknown>);
  // Persist migration if it changed shape
  if (!raw.instances) {
    conf.store = migrated as unknown as Record<string, unknown>;
  }
  return migrated;
}

function saveFullConfig(config: KumaConfigSchema): void {
  conf.store = config as unknown as Record<string, unknown>;
}

// --- Public API: Instances ---

export function getAllInstances(): Record<string, InstanceConfig> {
  return loadConfig().instances;
}

export function getInstanceConfig(name: string): InstanceConfig | null {
  const config = loadConfig();
  return config.instances[name] ?? null;
}

export function saveInstanceConfig(name: string, instance: InstanceConfig): void {
  const config = loadConfig();
  config.instances[name] = instance;
  saveFullConfig(config);
}

export function removeInstanceConfig(name: string): boolean {
  const config = loadConfig();
  if (!config.instances[name]) return false;
  delete config.instances[name];
  // Clear active if it was pointing to this instance
  if (config.active?.type === "instance" && config.active.name === name) {
    config.active = null;
  }
  saveFullConfig(config);
  return true;
}

export function getInstanceCluster(name: string): string | null {
  const config = loadConfig();
  for (const [clusterName, cluster] of Object.entries(config.clusters)) {
    if (cluster.instances.includes(name)) return clusterName;
  }
  return null;
}

// --- Public API: Clusters ---

export function getAllClusters(): Record<string, ClusterConfig> {
  return loadConfig().clusters;
}

export function getClusterConfig(name: string): ClusterConfig | null {
  const config = loadConfig();
  return config.clusters[name] ?? null;
}

export function saveClusterConfig(name: string, cluster: ClusterConfig): void {
  const config = loadConfig();
  config.clusters[name] = cluster;
  saveFullConfig(config);
}

export function removeClusterConfig(name: string): boolean {
  const config = loadConfig();
  if (!config.clusters[name]) return false;
  delete config.clusters[name];
  // Clear active if it was pointing to this cluster
  if (config.active?.type === "cluster" && config.active.name === name) {
    config.active = null;
  }
  saveFullConfig(config);
  return true;
}

// --- Public API: Active context ---

export function getActiveContext(): ActiveContext | null {
  return loadConfig().active;
}

export function setActiveContext(ctx: ActiveContext): void {
  const config = loadConfig();
  config.active = ctx;
  saveFullConfig(config);
}

export function clearActiveContext(): void {
  const config = loadConfig();
  config.active = null;
  saveFullConfig(config);
}

// --- Public API: Backward-compatible helpers ---

/**
 * Returns the "current" instance config, resolving from active context.
 * This is the backward-compatible equivalent of the old getConfig().
 */
export function getConfig(): { url: string; token: string } | null {
  const config = loadConfig();
  const active = config.active;

  if (active) {
    if (active.type === "instance") {
      return config.instances[active.name] ?? null;
    }
    if (active.type === "cluster") {
      const cluster = config.clusters[active.name];
      if (cluster) {
        return config.instances[cluster.primary] ?? null;
      }
    }
  }

  // Fallback: if there's exactly one instance, use it
  const names = Object.keys(config.instances);
  if (names.length === 1) {
    return config.instances[names[0]];
  }

  return null;
}

/**
 * Legacy saveConfig — saves as an instance (auto-names from hostname).
 * Used by login command when --as is not provided.
 */
export function saveConfig(instanceConfig: { url: string; token: string }, alias?: string): string {
  const name = alias ?? deriveInstanceName(instanceConfig.url);
  saveInstanceConfig(name, instanceConfig);
  setActiveContext({ type: "instance", name });
  return name;
}

export function clearConfig(): void {
  conf.clear();
}

export function getConfigPath(): string {
  return conf.path;
}
```

**Step 4: Update tests with proper imports and run**

Update `src/__tests__/config.test.ts` to import from config:

```typescript
import { describe, it, expect } from "vitest";
import { migrateConfig, deriveInstanceName } from "../config.js";

describe("config migration", () => {
  it("migrates old {url, token} to new schema", () => {
    const oldConfig = { url: "https://kuma.example.com", token: "abc123" };
    const result = migrateConfig(oldConfig as Record<string, unknown>);
    expect(result.instances["kuma-example-com"]).toEqual({
      url: "https://kuma.example.com",
      token: "abc123",
    });
    expect(result.active).toEqual({ type: "instance", name: "kuma-example-com" });
  });

  it("is idempotent — already-migrated config unchanged", () => {
    const newConfig = {
      instances: { prod: { url: "https://kuma.example.com", token: "abc" } },
      clusters: {},
      active: { type: "instance" as const, name: "prod" },
    };
    const result = migrateConfig(newConfig as unknown as Record<string, unknown>);
    expect(result.instances).toEqual(newConfig.instances);
    expect(result.active).toEqual(newConfig.active);
  });

  it("handles empty config", () => {
    const result = migrateConfig({});
    expect(result.instances).toEqual({});
    expect(result.clusters).toEqual({});
    expect(result.active).toBeNull();
  });

  it("derives hostname correctly", () => {
    expect(deriveInstanceName("https://kuma.prod.example.com")).toBe("kuma-prod-example-com");
    expect(deriveInstanceName("https://192.168.1.1:3001")).toBe("192-168-1-1-3001");
    expect(deriveInstanceName("http://localhost:3001")).toBe("localhost-3001");
  });
});
```

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: multi-instance config schema with migration"
```

---

### Task 3: Instance Manager

**Files:**
- Create: `src/instance-manager.ts`
- Create: `src/__tests__/instance-manager.test.ts`

**Step 1: Write failing tests**

```typescript
// src/__tests__/instance-manager.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveInstanceName } from "../instance-manager.js";

// Mock the config module
vi.mock("../config.js", () => ({
  getInstanceConfig: vi.fn(),
  getClusterConfig: vi.fn(),
  getActiveContext: vi.fn(),
  getAllInstances: vi.fn(),
}));

import { getInstanceConfig, getClusterConfig, getActiveContext, getAllInstances } from "../config.js";

const mockGetInstanceConfig = vi.mocked(getInstanceConfig);
const mockGetClusterConfig = vi.mocked(getClusterConfig);
const mockGetActiveContext = vi.mocked(getActiveContext);
const mockGetAllInstances = vi.mocked(getAllInstances);

describe("resolveInstanceName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns --instance flag when provided", () => {
    mockGetInstanceConfig.mockReturnValue({ url: "https://kuma.example.com", token: "abc" });
    const result = resolveInstanceName({ instance: "production" });
    expect(result).toBe("production");
  });

  it("throws if --instance flag references unknown instance", () => {
    mockGetInstanceConfig.mockReturnValue(null);
    expect(() => resolveInstanceName({ instance: "unknown" })).toThrow();
  });

  it("returns cluster primary when --cluster flag provided", () => {
    mockGetClusterConfig.mockReturnValue({ instances: ["prod", "staging"], primary: "prod" });
    const result = resolveInstanceName({ cluster: "prod-ha" });
    expect(result).toBe("prod");
  });

  it("returns active instance from context", () => {
    mockGetActiveContext.mockReturnValue({ type: "instance", name: "staging" });
    mockGetInstanceConfig.mockReturnValue({ url: "https://staging.example.com", token: "def" });
    const result = resolveInstanceName({});
    expect(result).toBe("staging");
  });

  it("returns sole instance when only one exists", () => {
    mockGetActiveContext.mockReturnValue(null);
    mockGetAllInstances.mockReturnValue({
      onlyone: { url: "https://kuma.example.com", token: "abc" },
    });
    const result = resolveInstanceName({});
    expect(result).toBe("onlyone");
  });

  it("throws when no context and multiple instances", () => {
    mockGetActiveContext.mockReturnValue(null);
    mockGetAllInstances.mockReturnValue({
      a: { url: "https://a.com", token: "1" },
      b: { url: "https://b.com", token: "2" },
    });
    expect(() => resolveInstanceName({})).toThrow("No active instance");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found

**Step 3: Implement instance-manager.ts**

```typescript
// src/instance-manager.ts
import {
  getInstanceConfig,
  getClusterConfig,
  getActiveContext,
  getAllInstances,
  type InstanceConfig,
  type ClusterConfig,
} from "./config.js";
import { createAuthenticatedClient, type KumaClient } from "./client.js";

export interface CommandFlags {
  instance?: string;
  cluster?: string;
}

/**
 * Resolves which instance name to use, given CLI flags and active context.
 * Priority: --instance > --cluster (primary) > active context > sole instance > error
 */
export function resolveInstanceName(flags: CommandFlags): string {
  // 1. Explicit --instance flag
  if (flags.instance) {
    const inst = getInstanceConfig(flags.instance);
    if (!inst) {
      throw new Error(`Instance '${flags.instance}' not found. Run: kuma instances list`);
    }
    return flags.instance;
  }

  // 2. Explicit --cluster flag → return primary
  if (flags.cluster) {
    const cluster = getClusterConfig(flags.cluster);
    if (!cluster) {
      throw new Error(`Cluster '${flags.cluster}' not found. Run: kuma cluster list`);
    }
    return cluster.primary;
  }

  // 3. Active context
  const active = getActiveContext();
  if (active) {
    if (active.type === "instance") {
      const inst = getInstanceConfig(active.name);
      if (inst) return active.name;
    }
    if (active.type === "cluster") {
      const cluster = getClusterConfig(active.name);
      if (cluster) return cluster.primary;
    }
  }

  // 4. Sole instance fallback
  const all = getAllInstances();
  const names = Object.keys(all);
  if (names.length === 1) return names[0];

  // 5. Ambiguous
  if (names.length === 0) {
    throw new Error("No instances configured. Run: kuma login <url>");
  }
  throw new Error(
    `No active instance. Multiple instances found: ${names.join(", ")}. Run: kuma use <name>`
  );
}

/**
 * Resolves and returns an authenticated KumaClient for the target instance.
 */
export async function resolveClient(flags: CommandFlags): Promise<{ client: KumaClient; instanceName: string }> {
  const name = resolveInstanceName(flags);
  const config = getInstanceConfig(name);
  if (!config) {
    throw new Error(`Instance '${name}' not found.`);
  }
  const client = await createAuthenticatedClient(config.url, config.token);
  return { client, instanceName: name };
}

/**
 * Resolves cluster name from flags or active context.
 */
export function resolveClusterName(flags: CommandFlags): string {
  if (flags.cluster) {
    const cluster = getClusterConfig(flags.cluster);
    if (!cluster) {
      throw new Error(`Cluster '${flags.cluster}' not found. Run: kuma cluster list`);
    }
    return flags.cluster;
  }

  const active = getActiveContext();
  if (active?.type === "cluster") {
    const cluster = getClusterConfig(active.name);
    if (cluster) return active.name;
  }

  throw new Error("No cluster specified. Use --cluster <name> or: kuma use --cluster <name>");
}

/**
 * Creates authenticated clients for all instances in a cluster.
 * Returns successful connections and reports failures.
 */
export async function resolveClusterClients(
  clusterName: string
): Promise<{ clients: { name: string; client: KumaClient }[]; failures: { name: string; error: string }[] }> {
  const cluster = getClusterConfig(clusterName);
  if (!cluster) {
    throw new Error(`Cluster '${clusterName}' not found.`);
  }

  const clients: { name: string; client: KumaClient }[] = [];
  const failures: { name: string; error: string }[] = [];

  const results = await Promise.allSettled(
    cluster.instances.map(async (instanceName) => {
      const config = getInstanceConfig(instanceName);
      if (!config) throw new Error(`Instance '${instanceName}' not configured`);
      const client = await createAuthenticatedClient(config.url, config.token);
      return { name: instanceName, client };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      clients.push(result.value);
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      // Extract instance name from error context
      failures.push({ name: "unknown", error: msg });
    }
  }

  return { clients, failures };
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/instance-manager.ts src/__tests__/instance-manager.test.ts
git commit -m "feat: add InstanceManager for multi-instance resolution"
```

---

### Task 4: Update Login Command with --as Flag

**Files:**
- Modify: `src/commands/login.ts`

**Step 1: Update login to support --as alias**

In `src/commands/login.ts`, add the `--as` option and update `saveConfig` call:

Find the `.command("login <url>")` chain and add:
```typescript
.option("--as <alias>", "Name this instance (default: derived from hostname)")
```

Update the action handler — after successful login, change the `saveConfig` call from:
```typescript
saveConfig({ url, token });
```
to:
```typescript
const instanceName = saveConfig({ url, token }, opts.as);
```

Update the success output to include the instance name:
- Text mode: `success(\`Logged in to ${url} as "${instanceName}"\`)`
- JSON mode: include `instanceName` in the data object

**Step 2: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/commands/login.ts
git commit -m "feat: add --as flag to login for instance naming"
```

---

### Task 5: Update Logout Command

**Files:**
- Modify: `src/commands/logout.ts`

**Step 1: Update logout for multi-instance**

Add `--all` option:
```typescript
.option("--all", "Logout from all instances and clear all config")
```

Update action handler:
- If `--all`: call `clearConfig()` (wipes everything), output "Logged out from all instances"
- Otherwise: resolve active instance, call `removeInstanceConfig(name)` to remove just that instance's token, output `Logged out from "${name}"`
- If no active instance and no `--all`: show error "No active instance. Use --all to logout from all"

Import `removeInstanceConfig`, `getActiveContext`, `getInstanceConfig` from config.

**Step 2: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/commands/logout.ts
git commit -m "feat: update logout for multi-instance support"
```

---

### Task 6: Instances Command

**Files:**
- Create: `src/commands/instances.ts`
- Modify: `src/index.ts`

**Step 1: Create instances command**

```typescript
// src/commands/instances.ts
import { Command } from "commander";
import {
  getAllInstances,
  getActiveContext,
  removeInstanceConfig,
  getInstanceCluster,
  getConfigPath,
} from "../config.js";
import { createTable, success, error, warn, isJsonMode, jsonOut, jsonError } from "../utils/output.js";

export function instancesCommand(program: Command): void {
  const instances = program
    .command("instances")
    .description("Manage Uptime Kuma instances");

  // --- list ---
  instances
    .command("list")
    .description("List all configured instances")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const all = getAllInstances();
      const active = getActiveContext();
      const names = Object.keys(all);

      if (names.length === 0) {
        if (isJsonMode(opts)) {
          return jsonOut({ instances: [] });
        }
        warn("No instances configured. Run: kuma login <url>");
        return;
      }

      if (isJsonMode(opts)) {
        const data = names.map((name) => ({
          name,
          url: all[name].url,
          active: active?.type === "instance" && active.name === name,
          token: all[name].token.slice(0, 4) + "..." + all[name].token.slice(-4),
        }));
        return jsonOut({ instances: data });
      }

      const table = createTable(["", "Name", "URL", "Token"]);
      for (const name of names) {
        const isActive = active?.type === "instance" && active.name === name;
        table.push([
          isActive ? "\u2192" : "",
          name,
          all[name].url,
          all[name].token.slice(0, 4) + "..." + all[name].token.slice(-4),
        ]);
      }
      console.log(table.toString());
    });

  // --- remove ---
  instances
    .command("remove <name>")
    .description("Remove a configured instance")
    .option("--force", "Skip confirmation")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { force?: boolean; json?: boolean }) => {
      const { default: Enquirer } = await import("enquirer");

      // Check if instance belongs to a cluster
      const clusterName = getInstanceCluster(name);
      if (clusterName) {
        const msg = `Instance '${name}' belongs to cluster '${clusterName}'. Remove it from the cluster first.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      if (!opts.force && !isJsonMode(opts)) {
        const enquirer = new Enquirer();
        const response = await enquirer.prompt<{ confirm: boolean }>({
          type: "confirm",
          name: "confirm",
          message: `Remove instance '${name}'?`,
        });
        if (!response.confirm) return;
      }

      const removed = removeInstanceConfig(name);
      if (!removed) {
        const msg = `Instance '${name}' not found.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      if (isJsonMode(opts)) return jsonOut({ removed: name });
      success(`Removed instance '${name}'`);
    });
}
```

**Step 2: Register in index.ts**

In `src/index.ts`, add import:
```typescript
import { instancesCommand } from "./commands/instances.js";
```

Add registration after existing commands:
```typescript
instancesCommand(program);
```

**Step 3: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/commands/instances.ts src/index.ts
git commit -m "feat: add instances list and remove commands"
```

---

### Task 7: Use Command

**Files:**
- Create: `src/commands/use.ts`
- Modify: `src/index.ts`

**Step 1: Create use command**

```typescript
// src/commands/use.ts
import { Command } from "commander";
import {
  getInstanceConfig,
  getClusterConfig,
  setActiveContext,
  getAllInstances,
  getAllClusters,
} from "../config.js";
import { success, error, isJsonMode, jsonOut, jsonError } from "../utils/output.js";

export function useCommand(program: Command): void {
  program
    .command("use [name]")
    .description("Set the active instance or cluster context")
    .option("--cluster <name>", "Set active cluster instead of instance")
    .option("--json", "Output as JSON")
    .action((name: string | undefined, opts: { cluster?: string; json?: boolean }) => {
      // Cluster mode
      if (opts.cluster) {
        const cluster = getClusterConfig(opts.cluster);
        if (!cluster) {
          const all = Object.keys(getAllClusters());
          const msg = all.length
            ? `Cluster '${opts.cluster}' not found. Available: ${all.join(", ")}`
            : `Cluster '${opts.cluster}' not found. No clusters configured.`;
          if (isJsonMode(opts)) return jsonError(msg);
          error(msg);
          process.exit(1);
        }
        setActiveContext({ type: "cluster", name: opts.cluster });
        if (isJsonMode(opts)) return jsonOut({ active: { type: "cluster", name: opts.cluster, primary: cluster.primary } });
        success(`Active context: cluster '${opts.cluster}' (primary: ${cluster.primary})`);
        return;
      }

      // Instance mode
      if (!name) {
        const msg = "Specify an instance name. Run: kuma instances list";
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      const inst = getInstanceConfig(name);
      if (!inst) {
        const all = Object.keys(getAllInstances());
        const msg = all.length
          ? `Instance '${name}' not found. Available: ${all.join(", ")}`
          : `Instance '${name}' not found. No instances configured.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      setActiveContext({ type: "instance", name });
      if (isJsonMode(opts)) return jsonOut({ active: { type: "instance", name } });
      success(`Active instance: '${name}' (${inst.url})`);
    });
}
```

**Step 2: Register in index.ts**

Add import:
```typescript
import { useCommand } from "./commands/use.js";
```

Add registration:
```typescript
useCommand(program);
```

**Step 3: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/commands/use.ts src/index.ts
git commit -m "feat: add use command for instance/cluster context switching"
```

---

### Task 8: Update Status Command

**Files:**
- Modify: `src/index.ts`

**Step 1: Update the inline status command**

The `status` command is defined inline in `src/index.ts`. Update it to show multi-instance info:

Replace the existing status action to show:
- Active context (instance name + URL, or cluster name + primary)
- Total instances count
- Total clusters count
- Config path

Example output:
```
Active: production (https://kuma1.example.com)
         Member of cluster: prod-ha

Instances: 2
Clusters:  1
Config:    ~/.config/kuma-cli-nodejs/config.json
```

Import `getAllInstances`, `getAllClusters`, `getActiveContext`, `getInstanceConfig`, `getInstanceCluster` from config.

**Step 2: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: update status command for multi-instance context"
```

---

### Task 9: Add --instance Flag to Existing Commands

**Files:**
- Modify: `src/commands/monitors.ts`
- Modify: `src/commands/notifications.ts`
- Modify: `src/commands/status-pages.ts`
- Modify: `src/commands/heartbeat.ts`
- Modify: `src/commands/config.ts` (export/import)

**Step 1: Update each command file**

The pattern is the same for each file. Replace the existing auth + client creation:

**Before** (current pattern in every command action):
```typescript
const config = getConfig();
if (!config) return requireAuth(opts);
const client = await createAuthenticatedClient(config.url, config.token);
```

**After** (new pattern):
```typescript
import { resolveClient } from "../instance-manager.js";

// In each action handler:
const { client } = await resolveClient(opts);
```

For each command/subcommand that has a `.action()`, add the `--instance` option:
```typescript
.option("--instance <name>", "Target a specific instance")
```

This applies to every subcommand in:
- `monitors.ts`: list, add, create, update, delete, pause, resume, bulk-pause, bulk-resume, set-notification
- `notifications.ts`: list, create, delete
- `status-pages.ts`: list
- `heartbeat.ts`: view (not `send` — that uses direct HTTP, no auth)
- `config.ts`: export, import

Remove the `requireAuth` import from these files since `resolveClient` will throw if not authenticated.

Wrap each action in a try/catch that calls `handleError`:
```typescript
try {
  const { client } = await resolveClient(opts);
  // ... existing logic ...
} catch (err) {
  handleError(err, opts);
}
```

**Step 2: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 3: Manual smoke test**

Run: `kuma monitors list` (should work the same as before with migrated config)

**Step 4: Commit**

```bash
git add src/commands/monitors.ts src/commands/notifications.ts src/commands/status-pages.ts src/commands/heartbeat.ts src/commands/config.ts
git commit -m "feat: add --instance flag to all existing commands"
```

---

### Task 10: Cluster Create, List, Remove Commands

**Files:**
- Create: `src/commands/cluster.ts`
- Modify: `src/index.ts`

**Step 1: Create cluster command**

```typescript
// src/commands/cluster.ts
import { Command } from "commander";
import {
  getAllClusters,
  getClusterConfig,
  saveClusterConfig,
  removeClusterConfig,
  getInstanceConfig,
  getAllInstances,
} from "../config.js";
import { createTable, success, error, warn, isJsonMode, jsonOut, jsonError } from "../utils/output.js";

export function clusterCommand(program: Command): void {
  const cluster = program
    .command("cluster")
    .description("Manage Uptime Kuma instance clusters");

  // --- create ---
  cluster
    .command("create <name>")
    .description("Create a cluster from existing instances")
    .requiredOption("--instances <names>", "Comma-separated instance names")
    .requiredOption("--primary <name>", "Primary instance name")
    .option("--json", "Output as JSON")
    .action((name: string, opts: { instances: string; primary: string; json?: boolean }) => {
      const instanceNames = opts.instances.split(",").map((s) => s.trim());

      // Validate all instances exist
      for (const inst of instanceNames) {
        if (!getInstanceConfig(inst)) {
          const msg = `Instance '${inst}' not found. Run: kuma instances list`;
          if (isJsonMode(opts)) return jsonError(msg);
          error(msg);
          process.exit(1);
        }
      }

      // Validate primary is in the list
      if (!instanceNames.includes(opts.primary)) {
        const msg = `Primary '${opts.primary}' must be one of the listed instances: ${instanceNames.join(", ")}`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      // Validate at least 2 instances
      if (instanceNames.length < 2) {
        const msg = "A cluster requires at least 2 instances.";
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      // Check if cluster already exists
      if (getClusterConfig(name)) {
        const msg = `Cluster '${name}' already exists. Remove it first: kuma cluster remove ${name}`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      saveClusterConfig(name, {
        instances: instanceNames,
        primary: opts.primary,
      });

      if (isJsonMode(opts)) {
        return jsonOut({ cluster: name, instances: instanceNames, primary: opts.primary });
      }
      success(`Cluster '${name}' created with instances: ${instanceNames.join(", ")} (primary: ${opts.primary})`);
    });

  // --- list ---
  cluster
    .command("list")
    .description("List all clusters")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const all = getAllClusters();
      const names = Object.keys(all);

      if (names.length === 0) {
        if (isJsonMode(opts)) return jsonOut({ clusters: [] });
        warn("No clusters configured. Run: kuma cluster create <name> --instances a,b --primary a");
        return;
      }

      if (isJsonMode(opts)) {
        const data = names.map((n) => ({ name: n, ...all[n] }));
        return jsonOut({ clusters: data });
      }

      const table = createTable(["Name", "Instances", "Primary"]);
      for (const n of names) {
        table.push([n, all[n].instances.join(", "), all[n].primary]);
      }
      console.log(table.toString());
    });

  // --- remove ---
  cluster
    .command("remove <name>")
    .description("Remove a cluster definition (does not delete instances or health monitors)")
    .option("--force", "Skip confirmation")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { force?: boolean; json?: boolean }) => {
      if (!getClusterConfig(name)) {
        const msg = `Cluster '${name}' not found.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      if (!opts.force && !isJsonMode(opts)) {
        const { default: Enquirer } = await import("enquirer");
        const enquirer = new Enquirer();
        const response = await enquirer.prompt<{ confirm: boolean }>({
          type: "confirm",
          name: "confirm",
          message: `Remove cluster '${name}'? (instances and health monitors will not be deleted)`,
        });
        if (!response.confirm) return;
      }

      removeClusterConfig(name);
      if (isJsonMode(opts)) return jsonOut({ removed: name });
      success(`Removed cluster '${name}'`);
    });
}
```

**Step 2: Register in index.ts**

Add import:
```typescript
import { clusterCommand } from "./commands/cluster.js";
```

Add registration:
```typescript
clusterCommand(program);
```

**Step 3: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/commands/cluster.ts src/index.ts
git commit -m "feat: add cluster create, list, remove commands"
```

---

### Task 11: Cluster Info Command

**Files:**
- Modify: `src/commands/cluster.ts`

**Step 1: Add info subcommand**

Add inside `clusterCommand`, after the `remove` subcommand:

```typescript
  // --- info ---
  cluster
    .command("info <name>")
    .description("Show cluster details with live instance status")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      const clusterConfig = getClusterConfig(name);
      if (!clusterConfig) {
        const msg = `Cluster '${name}' not found.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      const { info } = await import("../utils/output.js");
      info(`Cluster: ${name}\n`);

      // Connect to each instance concurrently
      const results = await Promise.allSettled(
        clusterConfig.instances.map(async (instanceName) => {
          const config = getInstanceConfig(instanceName);
          if (!config) return { instanceName, reachable: false, error: "Not configured", monitors: 0, healthMonitor: null };

          try {
            const { createAuthenticatedClient } = await import("../client.js");
            const client = await createAuthenticatedClient(config.url, config.token);
            const monitors = await client.getMonitorList();

            // Check for health monitors targeting other cluster instances
            const clusterTag = `kuma-cluster:${name}`;
            const healthMonitors = monitors.filter((m) =>
              m.tags?.some((t) => t.name === clusterTag)
            );

            client.disconnect();
            return {
              instanceName,
              reachable: true,
              monitors: monitors.length - healthMonitors.length,
              healthMonitors: healthMonitors.map((m) => ({
                name: m.name,
                status: m.heartbeat?.status,
              })),
            };
          } catch (err) {
            return {
              instanceName,
              reachable: false,
              error: err instanceof Error ? err.message : String(err),
              monitors: 0,
              healthMonitors: [],
            };
          }
        })
      );

      const instanceData = results.map((r) =>
        r.status === "fulfilled" ? r.value : { instanceName: "unknown", reachable: false, error: "Connection failed", monitors: 0, healthMonitors: [] }
      );

      if (isJsonMode(opts)) {
        return jsonOut({ cluster: name, primary: clusterConfig.primary, instances: instanceData });
      }

      const { statusLabel } = await import("../utils/output.js");
      const table = createTable(["", "Instance", "URL", "Reachable", "Monitors", "Health Monitors"]);
      for (const inst of instanceData) {
        const config = getInstanceConfig(inst.instanceName);
        const isPrimary = inst.instanceName === clusterConfig.primary;
        const healthStr = inst.healthMonitors?.length
          ? inst.healthMonitors.map((h: { name: string; status?: number }) => `${h.name}: ${statusLabel(h.status ?? 2)}`).join(", ")
          : isPrimary ? "\u2014" : "none";

        table.push([
          isPrimary ? "\u2192" : "",
          inst.instanceName,
          config?.url ?? "N/A",
          inst.reachable ? "yes" : `no (${inst.error})`,
          String(inst.monitors),
          healthStr,
        ]);
      }
      console.log(table.toString());
    });
```

Add missing import at top of file if not present:
```typescript
import { createAuthenticatedClient } from "../client.js";
```

**Step 2: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/commands/cluster.ts
git commit -m "feat: add cluster info command with live status"
```

---

### Task 12: Cluster Sync — Monitors

**Files:**
- Modify: `src/commands/cluster.ts`

**Step 1: Add sync subcommand (monitors portion)**

```typescript
  // --- sync ---
  cluster
    .command("sync <name>")
    .description("Sync monitors from primary to all secondary instances")
    .option("--dry-run", "Show what would be synced without making changes")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { dryRun?: boolean; json?: boolean }) => {
      const clusterConfig = getClusterConfig(name);
      if (!clusterConfig) {
        const msg = `Cluster '${name}' not found.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      const { createAuthenticatedClient } = await import("../client.js");
      const { info, warn: warnOut } = await import("../utils/output.js");

      // Connect to primary
      const primaryConfig = getInstanceConfig(clusterConfig.primary);
      if (!primaryConfig) {
        const msg = `Primary instance '${clusterConfig.primary}' not configured.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      let primaryClient;
      try {
        primaryClient = await createAuthenticatedClient(primaryConfig.url, primaryConfig.token);
      } catch (err) {
        const msg = `Cannot connect to primary '${clusterConfig.primary}': ${err instanceof Error ? err.message : err}`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      const primaryMonitors = await primaryClient.getMonitorList();
      const clusterTag = `kuma-cluster:${name}`;

      // Filter out cluster health monitors from sync
      const monitorsToSync = primaryMonitors.filter(
        (m) => !m.tags?.some((t) => t.name === clusterTag)
      );

      if (!isJsonMode(opts)) {
        info(`Syncing cluster '${name}' (primary: ${clusterConfig.primary})`);
        info(`Monitors to sync: ${monitorsToSync.length}`);
      }

      const secondaries = clusterConfig.instances.filter((i) => i !== clusterConfig.primary);
      const syncResults: Record<string, { created: number; skipped: number; failed: number }> = {};

      for (const secName of secondaries) {
        const secConfig = getInstanceConfig(secName);
        if (!secConfig) {
          if (!isJsonMode(opts)) warnOut(`Skipping '${secName}': not configured`);
          continue;
        }

        let secClient;
        try {
          secClient = await createAuthenticatedClient(secConfig.url, secConfig.token);
        } catch (err) {
          if (!isJsonMode(opts)) warnOut(`Skipping '${secName}': ${err instanceof Error ? err.message : err}`);
          syncResults[secName] = { created: 0, skipped: 0, failed: monitorsToSync.length };
          continue;
        }

        const secMonitors = await secClient.getMonitorList();
        let created = 0;
        let skipped = 0;
        let failed = 0;

        for (const monitor of monitorsToSync) {
          // Match by name + type + url/hostname
          const exists = secMonitors.some(
            (m) =>
              m.name === monitor.name &&
              m.type === monitor.type &&
              (m.url === monitor.url || m.hostname === monitor.hostname)
          );

          if (exists) {
            skipped++;
            continue;
          }

          if (opts.dryRun) {
            created++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would create: ${monitor.name} (${monitor.type})`);
            continue;
          }

          try {
            // Strip instance-specific fields before creating
            const { id, heartbeat, uptime, active, ...monitorData } = monitor as Record<string, unknown>;
            // Remove notificationIDList — notifications are handled separately
            delete monitorData.notificationIDList;
            await secClient.addMonitor(monitorData);
            created++;
          } catch (err) {
            failed++;
            if (!isJsonMode(opts)) warnOut(`  Failed to create '${monitor.name}' on ${secName}: ${err instanceof Error ? err.message : err}`);
          }
        }

        syncResults[secName] = { created, skipped, failed };
        secClient.disconnect();
      }

      // --- Cross-health monitors ---
      let healthCreated = 0;
      let healthSkipped = 0;

      for (const instanceName of clusterConfig.instances) {
        const instConfig = getInstanceConfig(instanceName);
        if (!instConfig) continue;

        let client;
        try {
          client = instanceName === clusterConfig.primary
            ? primaryClient
            : await createAuthenticatedClient(instConfig.url, instConfig.token);
        } catch {
          continue;
        }

        const monitors = await client.getMonitorList();
        const otherInstances = clusterConfig.instances.filter((i) => i !== instanceName);

        for (const otherName of otherInstances) {
          const otherConfig = getInstanceConfig(otherName);
          if (!otherConfig) continue;

          // Check if health monitor already exists (match by URL)
          const exists = monitors.some((m) => m.url === otherConfig.url || m.url === otherConfig.url + "/");

          if (exists) {
            healthSkipped++;
            continue;
          }

          if (opts.dryRun) {
            healthCreated++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would create health monitor: ${instanceName} -> ${otherName}`);
            continue;
          }

          try {
            const result = await client.addMonitor({
              name: `[cluster] ${otherName}`,
              type: "http",
              url: otherConfig.url,
              interval: 60,
              maxretries: 3,
              retryInterval: 30,
              accepted_statuscodes: ["200-299"],
            });

            // Tag the monitor with the cluster tag
            const tags = await client.getTags();
            let clusterTagObj = tags.find((t) => t.name === clusterTag);
            if (!clusterTagObj) {
              // Tag will be created via addMonitorTag if the API supports it
              // For now, we tag with the cluster name
            }
            if (clusterTagObj && result.id) {
              await client.addMonitorTag(clusterTagObj.id, result.id, "");
            }

            healthCreated++;
          } catch (err) {
            if (!isJsonMode(opts)) warnOut(`  Failed to create health monitor on ${instanceName} -> ${otherName}: ${err instanceof Error ? err.message : err}`);
          }
        }

        if (instanceName !== clusterConfig.primary) {
          client.disconnect();
        }
      }

      // --- Notification sync (disabled on secondaries) ---
      const primaryNotifications = await primaryClient.getNotificationList();
      let notifSynced = 0;
      let notifSkipped = 0;

      for (const secName of secondaries) {
        const secConfig = getInstanceConfig(secName);
        if (!secConfig) continue;

        let secClient;
        try {
          secClient = await createAuthenticatedClient(secConfig.url, secConfig.token);
        } catch {
          continue;
        }

        const secNotifications = await secClient.getNotificationList();

        for (const notif of primaryNotifications) {
          const exists = secNotifications.some((n) => n.name === notif.name);
          if (exists) {
            notifSkipped++;
            continue;
          }

          if (opts.dryRun) {
            notifSynced++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would sync notification: ${notif.name} (disabled)`);
            continue;
          }

          try {
            // Parse the notification config and set active to false
            const config = typeof notif.config === "string" ? JSON.parse(notif.config) : notif.config;
            await secClient.addNotification({
              ...config,
              name: notif.name,
              active: false,
              isDefault: false,
            });
            notifSynced++;
          } catch (err) {
            if (!isJsonMode(opts)) warnOut(`  Failed to sync notification '${notif.name}' to ${secName}: ${err instanceof Error ? err.message : err}`);
          }
        }

        secClient.disconnect();
      }

      primaryClient.disconnect();

      // --- Summary ---
      if (isJsonMode(opts)) {
        return jsonOut({
          cluster: name,
          dryRun: opts.dryRun ?? false,
          monitors: syncResults,
          health: { created: healthCreated, skipped: healthSkipped },
          notifications: { synced: notifSynced, skipped: notifSkipped },
        });
      }

      console.log("");
      for (const [secName, result] of Object.entries(syncResults)) {
        info(`${clusterConfig.primary} \u2192 ${secName}: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`);
      }
      info(`Health monitors: ${healthCreated} created, ${healthSkipped} skipped`);
      info(`Notifications: ${notifSynced} synced (disabled on secondaries), ${notifSkipped} skipped`);
      if (opts.dryRun) warnOut("Dry run — no changes were made.");
      else success("Sync complete.");
    });
```

**Step 2: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/commands/cluster.ts
git commit -m "feat: add cluster sync with monitors, health checks, and notifications"
```

---

### Task 13: Unified Cluster View on monitors list

**Files:**
- Modify: `src/commands/monitors.ts`

**Step 1: Add --cluster flag to monitors list**

In the `list` subcommand, add the option:
```typescript
.option("--cluster <name>", "Show unified view across all cluster instances")
```

**Step 2: Add cluster view logic**

At the start of the `list` action handler, before the existing logic, add a branch:

```typescript
if (opts.cluster) {
  const { getClusterConfig, getInstanceConfig } = await import("../config.js");
  const { createAuthenticatedClient } = await import("../client.js");
  const { resolveClusterName } = await import("../instance-manager.js");

  const clusterName = opts.cluster;
  const clusterConfig = getClusterConfig(clusterName);
  if (!clusterConfig) {
    if (isJsonMode(opts)) return jsonError(`Cluster '${clusterName}' not found.`);
    error(`Cluster '${clusterName}' not found.`);
    process.exit(1);
  }

  const clusterTag = `kuma-cluster:${clusterName}`;

  // Fetch monitors from all instances concurrently
  type MonitorWithInstance = Monitor & { _instance: string };
  const allMonitors: MonitorWithInstance[] = [];

  const results = await Promise.allSettled(
    clusterConfig.instances.map(async (instanceName) => {
      const config = getInstanceConfig(instanceName);
      if (!config) return [];
      try {
        const client = await createAuthenticatedClient(config.url, config.token);
        const monitors = await client.getMonitorList();
        client.disconnect();
        return monitors
          .filter((m) => !m.tags?.some((t) => t.name === clusterTag)) // Exclude health monitors
          .map((m) => ({ ...m, _instance: instanceName }));
      } catch {
        return [];
      }
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") allMonitors.push(...r.value);
  }

  // Deduplicate by name + type + url, worst-status-wins
  // Status priority: 0 (DOWN) > 3 (MAINTENANCE) > 2 (PENDING) > 1 (UP)
  const STATUS_PRIORITY: Record<number, number> = { 0: 0, 3: 1, 2: 2, 1: 3 };
  const deduped = new Map<string, MonitorWithInstance>();

  for (const m of allMonitors) {
    const key = `${m.name}|${m.type}|${m.url ?? m.hostname ?? ""}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, m);
    } else {
      // Keep the one with worse status
      const existingPriority = STATUS_PRIORITY[existing.heartbeat?.status ?? 2] ?? 2;
      const newPriority = STATUS_PRIORITY[m.heartbeat?.status ?? 2] ?? 2;
      if (newPriority < existingPriority) {
        deduped.set(key, m);
      }
    }
  }

  const monitors = Array.from(deduped.values());

  // Apply existing filters (--status, --tag, --search, etc.) to the deduped list
  // ... apply the same filtering logic as the existing list command ...

  if (isJsonMode(opts)) {
    return jsonOut({ cluster: clusterName, monitors });
  }

  const table = createTable(["ID", "Name", "URL", "Status", "Uptime"]);
  for (const m of monitors) {
    table.push([
      String(m.id),
      m.name,
      m.url ?? m.hostname ?? "",
      statusLabel(m.heartbeat?.status ?? 2),
      formatUptime(m.uptime),
    ]);
  }
  info(`Cluster '${clusterName}' — unified view (${monitors.length} monitors, worst-status-wins)\n`);
  console.log(table.toString());
  return;
}
```

**Step 3: Verify build passes**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/commands/monitors.ts
git commit -m "feat: add unified cluster view to monitors list"
```

---

### Task 14: Update CLI Help & Final Integration

**Files:**
- Modify: `src/index.ts`

**Step 1: Update help text**

Update the program description and help epilog in `src/index.ts` to mention multi-instance and cluster support. Add examples:

```
Examples:
  $ kuma login https://kuma.example.com --as production
  $ kuma login https://kuma2.example.com --as staging
  $ kuma use production
  $ kuma cluster create prod-ha --instances production,staging --primary production
  $ kuma cluster sync prod-ha
  $ kuma monitors list --cluster prod-ha
  $ kuma monitors list --instance staging
```

**Step 2: Verify full build and typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 3: Run all tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "docs: update CLI help with multi-instance and cluster examples"
```

---

### Task 15: End-to-End Manual Testing Checklist

This task is a manual verification pass. No code to write — run each command and verify behavior.

**Step 1: Fresh start**

```bash
# Back up and clear config
cp ~/.config/kuma-cli-nodejs/config.json ~/.config/kuma-cli-nodejs/config.json.bak
```

**Step 2: Test migration**

If you have an existing config with old `{url, token}` format, run any command (e.g. `kuma status`) and verify it auto-migrates.

**Step 3: Test instance management**

```bash
kuma login https://kuma1.example.com --as production
kuma login https://kuma2.example.com --as staging
kuma instances list
kuma use staging
kuma instances list   # staging should be active
kuma use production
```

**Step 4: Test cluster management**

```bash
kuma cluster create prod-ha --instances production,staging --primary production
kuma cluster list
kuma cluster info prod-ha
```

**Step 5: Test cluster sync**

```bash
kuma cluster sync prod-ha --dry-run
kuma cluster sync prod-ha
```

**Step 6: Test unified view**

```bash
kuma monitors list --cluster prod-ha
```

**Step 7: Test --instance flag**

```bash
kuma monitors list --instance staging
kuma monitors list --instance production
```

**Step 8: Test backward compatibility**

```bash
# With only active context set, no flags needed
kuma monitors list
kuma notifications list
kuma status
```

**Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
