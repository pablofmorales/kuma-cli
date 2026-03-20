import { Command } from "commander";
import { createAuthenticatedClient, Monitor, Notification } from "../client.js";
import { getConfig } from "../config.js";
import { handleError, requireAuth } from "../utils/errors.js";
import { isJsonMode, jsonOut, success, warn, error } from "../utils/output.js";
import { readFileSync, writeFileSync } from "fs";
import yaml from "js-yaml";
import chalk from "chalk";

export function configCommand(program: Command): void {
  const cfg = program.command("config").description("Export and import Kuma configuration");

  cfg
    .command("export")
    .description("Export monitors and notifications to a file")
    .option("--tag <tag>", "Export only monitors with this tag")
    .option("--output <file>", "Output file path (JSON or YAML) or '-' for stdout", "-")
    .option("--json", "Output as JSON ({ ok, data })")
    .action(async (opts: { tag?: string; output: string; json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

      const json = isJsonMode(opts);

      try {
        const client = await createAuthenticatedClient(config!.url, config!.token);
        const monitorMap = await client.getMonitorList();
        const allMonitors = Object.values(monitorMap);
        const allNotifications = await client.getNotificationList();
        client.disconnect();

        let targetMonitors = allMonitors;
        if (opts.tag) {
          const tagName = opts.tag.toLowerCase();
          targetMonitors = targetMonitors.filter(
            (m) => Array.isArray(m.tags) && m.tags.some((t) => t.name.toLowerCase() === tagName)
          );
        }

        // Clean sensitive data from monitors
        const exportedMonitors = targetMonitors.map((m) => {
          const { id, heartbeat, uptime, active, pushToken, ...rest } = m as any;
          return { ...rest };
        });

        // Filter notifications used by these monitors
        const usedNotifs = new Set<string>();
        targetMonitors.forEach((m) => {
          if (m.notificationIDList) {
            Object.entries(m.notificationIDList).forEach(([nid, enabled]) => {
              if (enabled) usedNotifs.add(nid);
            });
          }
        });

        const exportedNotifications = allNotifications
          .filter((n) => !opts.tag || usedNotifs.has(String(n.id)))
          .map((n) => {
            const { id, active, ...rest } = n;
            let parsedConfig = {};
            try {
              parsedConfig = JSON.parse(n.config);
            } catch {
              // ignore
            }
            // Strip sensitive fields (passwords, tokens, webhooks)
            const cleanConfig = Object.fromEntries(
              Object.entries(parsedConfig).map(([k, v]) => {
                const lower = k.toLowerCase();
                if (lower.includes("token") || lower.includes("password") || lower.includes("webhook") || lower.includes("secret")) {
                  return [k, "********"];
                }
                return [k, v];
              })
            );

            return { ...rest, config: JSON.stringify(cleanConfig) };
          });

        const exportData = {
          version: "1",
          exportedAt: new Date().toISOString(),
          monitors: exportedMonitors,
          notifications: exportedNotifications,
        };

        if (json && opts.output === "-") {
          jsonOut(exportData);
        }

        let outputStr = "";
        if (opts.output.endsWith(".yaml") || opts.output.endsWith(".yml")) {
          outputStr = yaml.dump(exportData);
        } else {
          outputStr = JSON.stringify(exportData, null, 2);
        }

        if (opts.output === "-") {
          console.log(outputStr);
        } else {
          writeFileSync(opts.output, outputStr, "utf8");
          if (!json) success(`Configuration exported to ${opts.output}`);
        }
      } catch (err) {
        handleError(err, opts);
      }
    });

  cfg
    .command("import <file>")
    .description("Import monitors and notifications from an export file")
    .option("--on-conflict <action>", "What to do if monitor exists by name: skip, update", "skip")
    .option("--dry-run", "Preview what would be created/updated without saving")
    .option("--json", "Output as JSON ({ ok, data })")
    .action(async (file: string, opts: { onConflict: string; dryRun?: boolean; json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

      const json = isJsonMode(opts);

      try {
        const raw = readFileSync(file, "utf8");
        let data: any;
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
        } else {
          data = JSON.parse(raw);
        }

        if (data.version !== "1" || !Array.isArray(data.monitors)) {
          throw new Error("Invalid export file format");
        }

        const client = await createAuthenticatedClient(config!.url, config!.token);
        const existingMonitors = Object.values(await client.getMonitorList());
        const existingMap = new Map(existingMonitors.map((m) => [m.name, m]));

        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        for (const m of data.monitors) {
          const existing = existingMap.get(m.name);

          if (existing) {
            if (opts.onConflict === "update") {
              updatedCount++;
              if (!opts.dryRun) {
                const { tags, notificationIDList, ...patch } = m;
                await client.editMonitor(existing.id, patch);
              }
            } else {
              skippedCount++;
            }
          } else {
            createdCount++;
            if (!opts.dryRun) {
              const { tags, notificationIDList, ...payload } = m;
              await client.addMonitor(payload);
            }
          }
        }

        const existingNotifications = await client.getNotificationList();
        const existingNotifMap = new Map(existingNotifications.map((n) => [n.name, n]));

        let createdNotifCount = 0;
        let updatedNotifCount = 0;
        let skippedNotifCount = 0;

        for (const n of data.notifications || []) {
          const existing = existingNotifMap.get(n.name);

          if (existing) {
            if (opts.onConflict === "update") {
              updatedNotifCount++;
              if (!opts.dryRun) {
                let parsedConfig = {};
                try {
                  parsedConfig = JSON.parse(n.config);
                } catch {
                  // ignore
                }
                await client.addNotification({ ...parsedConfig, name: n.name, type: parsedConfig.type || n.type } as any, existing.id);
              }
            } else {
              skippedNotifCount++;
            }
          } else {
            createdNotifCount++;
            if (!opts.dryRun) {
              let parsedConfig = {};
              try {
                parsedConfig = JSON.parse(n.config);
              } catch {
                // ignore
              }
              await client.addNotification({ ...parsedConfig, name: n.name, type: parsedConfig.type || n.type } as any);
            }
          }
        }

        client.disconnect();

        if (json) {
          jsonOut({
            dryRun: !!opts.dryRun,
            monitors: { created: createdCount, updated: updatedCount, skipped: skippedCount },
            notifications: { created: createdNotifCount, updated: updatedNotifCount, skipped: skippedNotifCount },
          });
        }

        if (opts.dryRun) {
          console.log(chalk.yellow("Dry run summary:"));
        } else {
          success("Import complete:");
        }
        console.log(chalk.bold("\nMonitors:"));
        console.log(`  Created: ${createdCount}`);
        console.log(`  Updated: ${updatedCount}`);
        console.log(`  Skipped: ${skippedCount}`);
        console.log(chalk.bold("\nNotifications:"));
        console.log(`  Created: ${createdNotifCount}`);
        console.log(`  Updated: ${updatedNotifCount}`);
        console.log(`  Skipped: ${skippedNotifCount}`);

      } catch (err) {
        handleError(err, opts);
      }
    });
}
