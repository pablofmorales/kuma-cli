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
  const raw = conf.store;
  const migrated = migrateConfig(raw as Record<string, unknown>);
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
      return config.instances[active.name] ?? null;
    }
    if (active.type === "cluster") {
      const cluster = config.clusters[active.name];
      if (cluster) {
        return config.instances[cluster.primary] ?? null;
      }
    }
  }

  const names = Object.keys(config.instances);
  if (names.length === 1) {
    return config.instances[names[0]];
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
  conf.clear();
}

export function getConfigPath(): string {
  return conf.path;
}
