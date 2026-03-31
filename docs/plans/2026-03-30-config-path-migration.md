# Config Path Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move config storage from the `conf` library's platform-specific path to a fixed `~/.config/kuma-cli/config.json` and drop the `conf` dependency.

**Architecture:** Replace `Conf` store with direct `fs` read/write to `~/.config/kuma-cli/config.json`. On first run, auto-migrate data from the old platform-specific path (macOS: `~/Library/Preferences/kuma-cli-nodejs/config.json`, Linux: `~/.config/kuma-cli-nodejs/config.json`). Public API unchanged.

**Tech Stack:** Node.js `fs`, `path`, `os` (no new dependencies).

**Tracking:** https://github.com/BlackAsteroid/kuma-cli/issues/61

---

### Task 1: Write Failing Tests for New Config Path Behavior

**Files:**
- Modify: `src/__tests__/config.test.ts`

**Step 1: Add tests for `getConfigDir()` and path migration**

Add the following test block to `src/__tests__/config.test.ts`, after the existing tests:

```typescript
import { getConfigDir, migrateConfigPath } from "../config.js";
import * as os from "os";
import * as path from "path";

describe("config path", () => {
  it("returns ~/.config/kuma-cli as config directory", () => {
    const dir = getConfigDir();
    expect(dir).toBe(path.join(os.homedir(), ".config", "kuma-cli"));
  });
});

describe("config path migration", () => {
  it("returns old config data when old path exists and new path does not", () => {
    // migrateConfigPath is a pure function:
    //   (oldPath: string | null, newPath: string | null) => { source: "old" | "new" | "none", data: object | null }
    const oldData = { instances: { prod: { url: "https://kuma.example.com", token: "abc" } }, clusters: {}, active: null };
    const result = migrateConfigPath(JSON.stringify(oldData), null);
    expect(result.source).toBe("old");
    expect(result.data).toEqual(oldData);
  });

  it("returns new config data when new path exists", () => {
    const newData = { instances: { staging: { url: "https://staging.example.com", token: "def" } }, clusters: {}, active: null };
    const result = migrateConfigPath(null, JSON.stringify(newData));
    expect(result.source).toBe("new");
    expect(result.data).toEqual(newData);
  });

  it("prefers new path over old path", () => {
    const oldData = { instances: { old: { url: "https://old.example.com", token: "old" } }, clusters: {}, active: null };
    const newData = { instances: { new: { url: "https://new.example.com", token: "new" } }, clusters: {}, active: null };
    const result = migrateConfigPath(JSON.stringify(oldData), JSON.stringify(newData));
    expect(result.source).toBe("new");
    expect(result.data).toEqual(newData);
  });

  it("returns none when neither path has data", () => {
    const result = migrateConfigPath(null, null);
    expect(result.source).toBe("none");
    expect(result.data).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL — `getConfigDir` and `migrateConfigPath` are not exported from config.ts yet.

---

### Task 2: Replace `conf` with Direct fs Operations

**Files:**
- Modify: `src/config.ts`

**Step 1: Replace the import and store initialization**

Replace lines 1 and 26-30 of `src/config.ts`:

```typescript
// OLD:
import Conf from "conf";

// ...

const conf = new Conf<Record<string, unknown>>({
  projectName: "kuma-cli",
});
```

With:

```typescript
// NEW:
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ...

// --- Config path ---

export function getConfigDir(): string {
  return path.join(os.homedir(), ".config", "kuma-cli");
}

function getConfigFilePath(): string {
  return path.join(getConfigDir(), "config.json");
}

/**
 * Returns the old platform-specific config path used by the `conf` library.
 * macOS: ~/Library/Preferences/kuma-cli-nodejs/config.json
 * Linux: ~/.config/kuma-cli-nodejs/config.json
 * Windows: %APPDATA%/kuma-cli-nodejs/config.json
 */
function getOldConfigFilePath(): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Preferences", "kuma-cli-nodejs", "config.json");
  }
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "kuma-cli-nodejs", "config.json");
  }
  // Linux and others: XDG
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "kuma-cli-nodejs", "config.json");
}

/**
 * Pure function to decide which config source to use.
 * Inputs are file contents as strings (null if file doesn't exist).
 */
export function migrateConfigPath(
  oldContent: string | null,
  newContent: string | null
): { source: "old" | "new" | "none"; data: Record<string, unknown> | null } {
  if (newContent !== null) {
    try {
      return { source: "new", data: JSON.parse(newContent) };
    } catch {
      // Corrupted new config — fall through
    }
  }
  if (oldContent !== null) {
    try {
      return { source: "old", data: JSON.parse(oldContent) };
    } catch {
      // Corrupted old config — fall through
    }
  }
  return { source: "none", data: null };
}

function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function writeConfigFile(data: Record<string, unknown>): void {
  const filePath = getConfigFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
```

**Step 2: Replace `loadConfig()` internals**

Replace the current `loadConfig` function:

```typescript
// OLD:
function loadConfig(): KumaConfigSchema {
  const raw = conf.store;
  const migrated = migrateConfig(raw as Record<string, unknown>);
  if (!raw.instances) {
    conf.store = migrated as unknown as Record<string, unknown>;
  }
  return migrated;
}
```

With:

```typescript
// NEW:
function loadConfig(): KumaConfigSchema {
  const newPath = getConfigFilePath();
  const oldPath = getOldConfigFilePath();
  const { source, data } = migrateConfigPath(readFileOrNull(oldPath), readFileOrNull(newPath));

  if (source === "none" || data === null) {
    return { instances: {}, clusters: {}, active: null };
  }

  const migrated = migrateConfig(data);

  // Persist to new location if read from old path or if schema migration happened
  if (source === "old" || !data.instances) {
    writeConfigFile(migrated as unknown as Record<string, unknown>);
  }

  return migrated;
}
```

**Step 3: Replace `saveFullConfig()`**

Replace:

```typescript
// OLD:
function saveFullConfig(config: KumaConfigSchema): void {
  conf.store = config as unknown as Record<string, unknown>;
}
```

With:

```typescript
// NEW:
function saveFullConfig(config: KumaConfigSchema): void {
  writeConfigFile(config as unknown as Record<string, unknown>);
}
```

**Step 4: Replace `clearConfig()`**

Replace:

```typescript
// OLD:
export function clearConfig(): void {
  conf.clear();
}
```

With:

```typescript
// NEW:
export function clearConfig(): void {
  const filePath = getConfigFilePath();
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File doesn't exist — nothing to clear
  }
}
```

**Step 5: Replace `getConfigPath()`**

Replace:

```typescript
// OLD:
export function getConfigPath(): string {
  return conf.path;
}
```

With:

```typescript
// NEW:
export function getConfigPath(): string {
  return getConfigFilePath();
}
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: ALL PASS — including the new `getConfigDir` and `migrateConfigPath` tests.

**Step 7: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: migrate config storage to ~/.config/kuma-cli

Replace conf library with direct fs read/write.
Auto-migrates data from old platform-specific path on first run."
```

---

### Task 3: Remove `conf` Dependency

**Files:**
- Modify: `package.json`

**Step 1: Uninstall the conf package**

Run: `npm uninstall conf`

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: SUCCESS — no remaining imports of `conf`.

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove conf dependency

No longer needed — config is managed via direct fs operations."
```

---

### Task 4: Verify End-to-End Behavior

**Step 1: Check the reported config path**

Run: `node dist/index.js status --json`
Expected: `configPath` field should show `~/.config/kuma-cli/config.json` (expanded to absolute).

**Step 2: Check CLI help text**

Run: `node dist/index.js --help`
Expected: The "Config stored at:" line should show the new path.

**Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS.

**Step 4: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

**Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address any issues from config path migration verification"
```

(Skip this step if no changes were needed.)
