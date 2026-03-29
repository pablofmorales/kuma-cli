import { Command } from "commander";
import {
  getAllClusters,
  getClusterConfig,
  saveClusterConfig,
  removeClusterConfig,
  getInstanceConfig,
} from "../config.js";
import { createTable, success, error, warn, info, isJsonMode, jsonOut, jsonError, statusLabel } from "../utils/output.js";
import { createAuthenticatedClient } from "../client.js";

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

      for (const inst of instanceNames) {
        if (!getInstanceConfig(inst)) {
          const msg = `Instance '${inst}' not found. Run: kuma instances list`;
          if (isJsonMode(opts)) return jsonError(msg);
          error(msg);
          process.exit(1);
        }
      }

      if (!instanceNames.includes(opts.primary)) {
        const msg = `Primary '${opts.primary}' must be one of: ${instanceNames.join(", ")}`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      if (instanceNames.length < 2) {
        const msg = "A cluster requires at least 2 instances.";
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      if (getClusterConfig(name)) {
        const msg = `Cluster '${name}' already exists. Remove it first: kuma cluster remove ${name}`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      saveClusterConfig(name, { instances: instanceNames, primary: opts.primary });

      if (isJsonMode(opts)) return jsonOut({ cluster: name, instances: instanceNames, primary: opts.primary });
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
        return jsonOut({ clusters: names.map((n) => ({ name: n, ...all[n] })) });
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
        const enquirer = await import("enquirer");
        const { prompt } = enquirer.default as any;
        const { confirm } = (await prompt({
          type: "confirm",
          name: "confirm",
          message: `Remove cluster '${name}'? (instances and health monitors will not be deleted)`,
          initial: false,
        })) as { confirm: boolean };
        if (!confirm) return;
      }

      removeClusterConfig(name);
      if (isJsonMode(opts)) return jsonOut({ removed: name });
      success(`Removed cluster '${name}'`);
    });

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

      if (!isJsonMode(opts)) info(`Cluster: ${name}\n`);

      const results = await Promise.allSettled(
        clusterConfig.instances.map(async (instanceName) => {
          const config = getInstanceConfig(instanceName);
          if (!config) return { instanceName, reachable: false, error: "Not configured", monitors: 0, healthMonitors: [] as { name: string; status?: number }[] };

          try {
            const client = await createAuthenticatedClient(config.url, config.token);
            const monitorMap = await client.getMonitorList();
            const monitors = Object.values(monitorMap);
            const healthMonitors = monitors.filter((m) => m.name.startsWith("[cluster] "));
            client.disconnect();
            return {
              instanceName,
              reachable: true,
              monitors: monitors.length - healthMonitors.length,
              healthMonitors: healthMonitors.map((m) => ({ name: m.name, status: m.heartbeat?.status })),
            };
          } catch (err) {
            return {
              instanceName,
              reachable: false,
              error: err instanceof Error ? err.message : String(err),
              monitors: 0,
              healthMonitors: [] as { name: string; status?: number }[],
            };
          }
        })
      );

      const instanceData = results.map((r) =>
        r.status === "fulfilled" ? r.value : { instanceName: "unknown", reachable: false, error: "Connection failed", monitors: 0, healthMonitors: [] as { name: string; status?: number }[] }
      );

      if (isJsonMode(opts)) return jsonOut({ cluster: name, primary: clusterConfig.primary, instances: instanceData });

      const table = createTable(["", "Instance", "URL", "Reachable", "Monitors", "Health Monitors"]);
      for (const inst of instanceData) {
        const config = getInstanceConfig(inst.instanceName);
        const isPrimary = inst.instanceName === clusterConfig.primary;
        const healthStr = inst.healthMonitors.length
          ? inst.healthMonitors.map((h) => `${h.name}: ${statusLabel(h.status ?? 2)}`).join(", ")
          : isPrimary ? "\u2014" : "none";

        table.push([
          isPrimary ? "\u2192" : "",
          inst.instanceName,
          config?.url ?? "N/A",
          inst.reachable ? "yes" : `no (${(inst as any).error ?? "unknown"})`,
          String(inst.monitors),
          healthStr,
        ]);
      }
      console.log(table.toString());
    });

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

      const secondaries = clusterConfig.instances.filter((i) => i !== clusterConfig.primary);

      // Connect to all secondaries upfront to avoid redundant connections
      const secClients: Record<string, ReturnType<typeof createAuthenticatedClient> extends Promise<infer T> ? T : never> = {};
      for (const secName of secondaries) {
        const secConfig = getInstanceConfig(secName);
        if (!secConfig) {
          if (!isJsonMode(opts)) warn(`Skipping '${secName}': not configured`);
          continue;
        }
        try {
          secClients[secName] = await createAuthenticatedClient(secConfig.url, secConfig.token);
        } catch (err) {
          if (!isJsonMode(opts)) warn(`Skipping '${secName}': ${err instanceof Error ? err.message : err}`);
          continue;
        }
      }

      try {
      const primaryMonitorMap = await primaryClient.getMonitorList();
      const primaryMonitors = Object.values(primaryMonitorMap);
      // Filter out cluster health monitors
      const monitorsToSync = primaryMonitors.filter(
        (m) => !m.name.startsWith("[cluster] ")
      );

      if (!isJsonMode(opts)) {
        info(`Syncing cluster '${name}' (primary: ${clusterConfig.primary})`);
        info(`Monitors to sync: ${monitorsToSync.length}`);
      }

      const syncResults: Record<string, { created: number; skipped: number; failed: number }> = {};

      for (const secName of secondaries) {
        if (!secClients[secName]) {
          syncResults[secName] = { created: 0, skipped: 0, failed: monitorsToSync.length };
          continue;
        }

        const secClient = secClients[secName];

        const secMonitorMap = await secClient.getMonitorList();
        const secMonitors = Object.values(secMonitorMap);
        let created = 0, skipped = 0, failed = 0;

        for (const monitor of monitorsToSync) {
          const exists = secMonitors.some(
            (m) => m.name === monitor.name && m.type === monitor.type && (m.url === monitor.url || m.hostname === monitor.hostname)
          );

          if (exists) { skipped++; continue; }

          if (opts.dryRun) {
            created++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would create: ${monitor.name} (${monitor.type})`);
            continue;
          }

          try {
            const { id, heartbeat, uptime, active, tags, notificationIDList, ...monitorData } = monitor as any;
            await secClient.addMonitor(monitorData);
            created++;
          } catch (err) {
            failed++;
            if (!isJsonMode(opts)) warn(`  Failed to create '${monitor.name}' on ${secName}: ${err instanceof Error ? err.message : err}`);
          }
        }

        syncResults[secName] = { created, skipped, failed };
      }

      // --- Cross-health monitors ---
      let healthCreated = 0, healthSkipped = 0;

      for (const instanceName of clusterConfig.instances) {
        const client = instanceName === clusterConfig.primary
          ? primaryClient
          : secClients[instanceName];
        if (!client) continue;

        const monitorMap = await client.getMonitorList();
        const monitors = Object.values(monitorMap);
        const otherInstances = clusterConfig.instances.filter((i) => i !== instanceName);

        for (const otherName of otherInstances) {
          const otherConfig = getInstanceConfig(otherName);
          if (!otherConfig) continue;

          const exists = monitors.some((m) => m.url === otherConfig.url || m.url === otherConfig.url + "/");

          if (exists) { healthSkipped++; continue; }

          if (opts.dryRun) {
            healthCreated++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would create health monitor: ${instanceName} -> ${otherName}`);
            continue;
          }

          try {
            await client.addMonitor({
              name: `[cluster] ${otherName}`,
              type: "http",
              url: otherConfig.url,
              interval: 60,
            });
            healthCreated++;
          } catch (err) {
            if (!isJsonMode(opts)) warn(`  Failed to create health monitor on ${instanceName} -> ${otherName}: ${err instanceof Error ? err.message : err}`);
          }
        }
      }

      // --- Notification sync (disabled on secondaries) ---
      const primaryNotifications = await primaryClient.getNotificationList();
      let notifSynced = 0, notifSkipped = 0;

      for (const secName of secondaries) {
        const secClient = secClients[secName];
        if (!secClient) continue;

        const secNotifications = await secClient.getNotificationList();

        for (const notif of primaryNotifications) {
          const exists = secNotifications.some((n) => n.name === notif.name);
          if (exists) { notifSkipped++; continue; }

          if (opts.dryRun) {
            notifSynced++;
            if (!isJsonMode(opts)) info(`  [dry-run] Would sync notification: ${notif.name} (disabled)`);
            continue;
          }

          try {
            const config = typeof notif.config === "string" ? JSON.parse(notif.config) : notif.config;
            await secClient.addNotification({
              ...config,
              name: notif.name,
              active: false,
              isDefault: false,
            });
            notifSynced++;
          } catch (err) {
            if (!isJsonMode(opts)) warn(`  Failed to sync notification '${notif.name}' to ${secName}: ${err instanceof Error ? err.message : err}`);
          }
        }
      }

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
      if (opts.dryRun) warn("Dry run \u2014 no changes were made.");
      else success("Sync complete.");

      } finally {
        primaryClient.disconnect();
        for (const client of Object.values(secClients)) {
          client.disconnect();
        }
      }
    });
}
