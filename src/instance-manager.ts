import {
  getInstanceConfig,
  getClusterConfig,
  getActiveContext,
  getAllInstances,
  type InstanceConfig,
  type ClusterConfig,
} from "./config.js";
import { createAuthenticatedClient, buildBasicAuthHeaders, type KumaClient } from "./client.js";

export interface CommandFlags {
  instance?: string;
  cluster?: string;
}

/**
 * Resolves which instance name to use, given CLI flags and active context.
 * Priority: --instance > --cluster (primary) > active context > sole instance > error
 */
export function resolveInstanceName(flags: CommandFlags): string {
  if (flags.instance) {
    const inst = getInstanceConfig(flags.instance);
    if (!inst) throw new Error(`Instance '${flags.instance}' not found. Run: kuma instances list`);
    return flags.instance;
  }

  if (flags.cluster) {
    const cluster = getClusterConfig(flags.cluster);
    if (!cluster) throw new Error(`Cluster '${flags.cluster}' not found. Run: kuma cluster list`);
    return cluster.primary;
  }

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

  const all = getAllInstances();
  const names = Object.keys(all);
  if (names.length === 1) return names[0];

  if (names.length === 0) throw new Error("No instances configured. Run: kuma login <url>");
  throw new Error(`No active instance. Multiple instances found: ${names.join(", ")}. Run: kuma use <name>`);
}

export async function resolveClient(flags: CommandFlags): Promise<{ client: KumaClient; instanceName: string }> {
  const name = resolveInstanceName(flags);
  const config = getInstanceConfig(name);
  if (!config) throw new Error(`Instance '${name}' not found.`);
  const client = await createAuthenticatedClient(config.url, config.token, buildBasicAuthHeaders(config.basicAuthUser, config.basicAuthPass));
  return { client, instanceName: name };
}

export function resolveClusterName(flags: CommandFlags): string {
  if (flags.cluster) {
    const cluster = getClusterConfig(flags.cluster);
    if (!cluster) throw new Error(`Cluster '${flags.cluster}' not found. Run: kuma cluster list`);
    return flags.cluster;
  }

  const active = getActiveContext();
  if (active?.type === "cluster") {
    const cluster = getClusterConfig(active.name);
    if (cluster) return active.name;
  }

  throw new Error("No cluster specified. Use --cluster <name> or: kuma use --cluster <name>");
}

export async function resolveClusterClients(
  clusterName: string
): Promise<{ clients: { name: string; client: KumaClient }[]; failures: { name: string; error: string }[] }> {
  const cluster = getClusterConfig(clusterName);
  if (!cluster) throw new Error(`Cluster '${clusterName}' not found.`);

  const clients: { name: string; client: KumaClient }[] = [];
  const failures: { name: string; error: string }[] = [];

  const results = await Promise.allSettled(
    cluster.instances.map(async (instanceName) => {
      const config = getInstanceConfig(instanceName);
      if (!config) throw new Error(`Instance '${instanceName}' not configured`);
      const client = await createAuthenticatedClient(config.url, config.token, buildBasicAuthHeaders(config.basicAuthUser, config.basicAuthPass));
      return { name: instanceName, client };
    })
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      clients.push(result.value);
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failures.push({ name: cluster.instances[i], error: msg });
    }
  }

  return { clients, failures };
}
