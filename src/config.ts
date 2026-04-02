import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

// --- Config path ---

export function getConfigDir(): string {
  const platform = process.platform;
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "kuma-cli");
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "kuma-cli");
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
  const dirPath = path.dirname(filePath);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

// --- Hostname derivation ---

export function deriveInstanceName(url: string): string {
  try {
    const parsed = new URL(url);
    let name = parsed.hostname;
    if (parsed.port) {
      name += `-${parsed.port}`;
    }
    return name.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  } catch {
    return url.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
}

// --- Migration ---

export function migrateConfig(raw: Record<string, unknown>): KumaConfigSchema {
  // Already migrated
  if (raw.instances && typeof raw.instances === "object") {
    const instances = raw.instances as Record<string, unknown>;
    // If instances has entries, trust it as the migrated format
    if (Object.keys(instances).length > 0) {
      return raw as unknown as KumaConfigSchema;
    }
    // Empty instances object + legacy keys = needs migration
    if (raw.url && raw.token) {
      // Fall through to legacy migration below
    } else {
      // Empty instances, no legacy keys = fresh config
      return raw as unknown as KumaConfigSchema;
    }
  }

  // Legacy shape: { url, token }
  const legacy = raw as { url?: string; token?: string };
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

// --- Internal: load and save full config ---

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

function saveFullConfig(config: KumaConfigSchema): void {
  writeConfigFile(config as unknown as Record<string, unknown>);
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
  if (config.active?.type === "instance" && config.active.name === name) {
    config.active = null;
  }
  saveFullConfig(config);
  return true;
}

export function clearInstanceToken(name: string): boolean {
  const config = loadConfig();
  if (!config.instances[name]) return false;
  config.instances[name].token = "";
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

export function getConfig(): { url: string; token: string } | null {
  const config = loadConfig();
  const active = config.active;

  if (active) {
    if (active.type === "instance") {
      const inst = config.instances[active.name];
      if (inst && inst.token) return inst;
      return null;
    }
    if (active.type === "cluster") {
      const cluster = config.clusters[active.name];
      if (cluster) {
        const inst = config.instances[cluster.primary];
        if (inst && inst.token) return inst;
        return null;
      }
    }
  }

  const names = Object.keys(config.instances);
  if (names.length === 1) {
    const inst = config.instances[names[0]];
    if (inst && inst.token) return inst;
    return null;
  }

  return null;
}

export function saveConfig(instanceConfig: { url: string; token: string }, alias?: string): string {
  const name = alias ?? deriveInstanceName(instanceConfig.url);
  saveInstanceConfig(name, instanceConfig);
  setActiveContext({ type: "instance", name });
  return name;
}

export function clearConfig(): void {
  const filePath = getConfigFilePath();
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File doesn't exist — nothing to clear
  }
}

export function getConfigPath(): string {
  return getConfigFilePath();
}
