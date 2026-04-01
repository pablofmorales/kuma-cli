import { Command } from "commander";
import enquirer from "enquirer";
import { createAuthenticatedClient, Monitor } from "../client.js";
import { getClusterConfig, getInstanceConfig } from "../config.js";
import { resolveClient } from "../instance-manager.js";
import {
  createTable,
  statusLabel,
  formatUptime,
  formatPing,
  success,
  error,
  info,
  isJsonMode,
  jsonOut,
  jsonError,
} from "../utils/output.js";
import { handleError } from "../utils/errors.js";
import chalk from "chalk";

const { prompt } = enquirer as any;

/** Commander repeatable option collector for strings */
function collect(val: string, prev: string[]): string[] {
  return [...prev, val];
}
/** Commander repeatable option collector for integers */
function collectInt(val: string, prev: number[]): number[] {
  return [...prev, parseInt(val, 10)];
}

const MONITOR_TYPES = [
  "http",
  "tcp",
  "ping",
  "dns",
  "push",
  "steam",
  "mqtt",
  "sqlserver",
  "postgres",
  "mysql",
  "mongodb",
  "radius",
  "redis",
  "group"
];

export function monitorsCommand(program: Command): void {
  const monitors = program
    .command("monitors")
    .description("Create, view, update, pause, resume, and delete monitors")
    .addHelpText(
      "after",
      `
${chalk.dim("Subcommands:")}
  ${chalk.cyan("monitors list")}          List all monitors with status and uptime
  ${chalk.cyan("monitors add")}           Add a new monitor (interactive or via flags)
  ${chalk.cyan("monitors update <id>")}   Update name, URL, or interval of a monitor
  ${chalk.cyan("monitors delete <id>")}   Permanently delete a monitor
  ${chalk.cyan("monitors pause <id>")}    Pause checks for a monitor
  ${chalk.cyan("monitors resume <id>")}   Resume checks for a paused monitor

${chalk.dim("Run")} ${chalk.cyan("kuma monitors <subcommand> --help")} ${chalk.dim("for per-command examples.")}
`
    );

  // LIST
  monitors
    .command("list")
    .description("List all monitors with live status, uptime, and ping")
    .option("--json", "Output as JSON ({ ok, data })")
    .option(
      "--status <status>",
      "Filter to a specific status: up, down, pending, maintenance"
    )
    .option("--tag <tag>", "Filter to monitors that have this tag name")
    .option("--has-notification", "Filter to monitors that have at least one notification configured")
    .option("--without-notification", "Filter to monitors that have no notifications configured")
    .option("--search <query>", "Filter by monitor name or URL/hostname (case-insensitive)")
    .option("--uptime-below <percent>", "Filter to monitors with 24h uptime below this percentage (e.g. 99.9)")
    .option("--include-notifications", "Include notification channels in the JSON output")
    .option("--instance <name>", "Target a specific instance")
    .option("--cluster <name>", "Show a unified view across all instances in a named cluster")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors list")}                        List all monitors
  ${chalk.cyan("kuma monitors list --status down")}          Show only DOWN monitors
  ${chalk.cyan("kuma monitors list --tag production")}       Filter by tag
  ${chalk.cyan("kuma monitors list --without-notification")} Audit monitors missing alerts
  ${chalk.cyan("kuma monitors list --uptime-below 99.0")}    Find SLA-breaching monitors
  ${chalk.cyan("kuma monitors list --json | jq '.data[].name'")}
`
    )
    .action(
      async (opts: {
        json?: boolean;
        status?: string;
        tag?: string;
        hasNotification?: boolean;
        withoutNotification?: boolean;
        search?: string;
        uptimeBelow?: string;
        includeNotifications?: boolean;
        instance?: string;
        cluster?: string;
      }) => {
        // ---------------------------------------------------------------
        // Cluster unified view
        // ---------------------------------------------------------------
        if (opts.cluster) {
          const clusterConfig = getClusterConfig(opts.cluster);
          if (!clusterConfig) {
            if (isJsonMode(opts)) return jsonError(`Cluster '${opts.cluster}' not found.`);
            error(`Cluster '${opts.cluster}' not found.`);
            process.exit(1);
          }

          // Fetch from all instances concurrently
          const allMonitors: (Monitor & { _instance: string })[] = [];

          const results = await Promise.allSettled(
            clusterConfig.instances.map(async (instanceName) => {
              const instConfig = getInstanceConfig(instanceName);
              if (!instConfig) return [];
              try {
                const client = await createAuthenticatedClient(instConfig.url, instConfig.token);
                const monitorMap = await client.getMonitorList();
                const monitors = Object.values(monitorMap);
                client.disconnect();
                return monitors
                  .filter((m: Monitor) => !m.name.startsWith("[cluster] "))
                  .map((m: Monitor) => ({ ...m, _instance: instanceName }));
              } catch {
                return [];
              }
            })
          );

          for (const r of results) {
            if (r.status === "fulfilled") allMonitors.push(...(r.value as (Monitor & { _instance: string })[]));
          }

          // Deduplicate: worst-status-wins
          // Priority: DOWN (0) > MAINTENANCE (3) > PENDING (2) > UP (1)
          const STATUS_PRIORITY: Record<number, number> = { 0: 0, 3: 1, 2: 2, 1: 3 };
          const deduped = new Map<string, Monitor & { _instance: string }>();

          for (const m of allMonitors) {
            const key = `${m.name}|${m.type}|${m.url ?? m.hostname ?? ""}`;
            const existing = deduped.get(key);
            if (!existing) {
              deduped.set(key, m);
            } else {
              const existingPri = STATUS_PRIORITY[existing.heartbeat?.status ?? 2] ?? 2;
              const newPri = STATUS_PRIORITY[m.heartbeat?.status ?? 2] ?? 2;
              if (newPri < existingPri) deduped.set(key, m);
            }
          }

          const clusterMonitors = Array.from(deduped.values());

          if (isJsonMode(opts)) {
            return jsonOut({ cluster: opts.cluster, monitors: clusterMonitors });
          }

          if (clusterMonitors.length === 0) {
            info(`Cluster '${opts.cluster}' -- unified view (0 monitors)`);
            console.log("No monitors found.");
            return;
          }

          const table = createTable([
            "ID",
            "Name",
            "Type",
            "URL / Host",
            "Status",
            "Uptime 24h",
            "Ping",
          ]);

          for (const m of clusterMonitors) {
            const target = m.url ?? (m.hostname ? `${m.hostname}:${m.port}` : "\u2014");
            const status = m.heartbeat
              ? statusLabel(m.heartbeat.status)
              : m.active
              ? statusLabel(2)
              : "\u23F8 Paused";
            table.push([
              String(m.id),
              m.name,
              m.type,
              target,
              status,
              formatUptime(m.uptime),
              formatPing(m.heartbeat?.ping),
            ]);
          }

          info(`Cluster '${opts.cluster}' \u2014 unified view (${clusterMonitors.length} monitors, worst-status-wins)\n`);
          console.log(table.toString());
          console.log(`\n${clusterMonitors.length} monitor(s) total`);
          return;
        }


        const json = isJsonMode(opts);

        if (opts.hasNotification && opts.withoutNotification) {
          handleError(new Error("Cannot use both --has-notification and --without-notification"), opts);
        }

        const uptimeThreshold = opts.uptimeBelow ? parseFloat(opts.uptimeBelow) : undefined;
        if (uptimeThreshold !== undefined && isNaN(uptimeThreshold)) {
          handleError(new Error(`Invalid uptime threshold: ${opts.uptimeBelow}`), opts);
        }

        // Map human-readable status strings to numeric values
        const STATUS_MAP: Record<string, number> = {
          down: 0,
          up: 1,
          pending: 2,
          maintenance: 3,
        };

        try {
          const { client } = await resolveClient(opts);
          const monitorMap = await client.getMonitorList();
          client.disconnect();

          let list = Object.values(monitorMap);

          // Apply --status filter
          if (opts.status) {
            const statusKey = opts.status.toLowerCase();
            if (!(statusKey in STATUS_MAP)) {
              if (json) {
                jsonOut({ error: `Invalid status "${opts.status}". Valid values: up, down, pending, maintenance` });
              }
              error(
                `Invalid status "${opts.status}". Valid values: up, down, pending, maintenance`
              );
              process.exit(1);
            }
            const statusNum = STATUS_MAP[statusKey];
            list = list.filter((m: Monitor) => {
              if (m.heartbeat) return m.heartbeat.status === statusNum;
              if (statusNum === 2) return m.active && !m.heartbeat;
              return false;
            });
          }

          // Apply --tag filter
          if (opts.tag) {
            const tagName = opts.tag.toLowerCase();
            list = list.filter(
              (m: Monitor) =>
                Array.isArray(m.tags) &&
                m.tags.some((t) => t.name.toLowerCase() === tagName)
            );
          }

          // Apply --has-notification / --without-notification filter
          if (opts.hasNotification || opts.withoutNotification) {
            list = list.filter((m: Monitor) => {
              const hasAny = m.notificationIDList
                ? Object.values(m.notificationIDList).some((enabled) => enabled)
                : false;
              return opts.hasNotification ? hasAny : !hasAny;
            });
          }

          // Apply --search filter
          if (opts.search) {
            const query = opts.search.toLowerCase();
            list = list.filter((m: Monitor) => {
              const target = m.url ?? (m.hostname ? `${m.hostname}:${m.port}` : "");
              return m.name.toLowerCase().includes(query) || target.toLowerCase().includes(query);
            });
          }

          // Apply --uptime-below filter
          if (uptimeThreshold !== undefined) {
            list = list.filter((m: Monitor) => {
              if (m.uptime === undefined || m.uptime === null) return false;
              const pct = m.uptime * 100;
              return pct < uptimeThreshold;
            });
          }

          if (json) {
            if (opts.includeNotifications) {
              jsonOut(list);
            } else {
              // Strip notificationIDList from output unless requested
              const strippedList = list.map((m) => {
                const { notificationIDList, ...rest } = m;
                return rest;
              });
              jsonOut(strippedList);
            }
          }

          if (list.length === 0) {
            console.log("No monitors found matching the given filters.");
            return;
          }

          const table = createTable([
            "ID",
            "Name",
            "Type",
            "URL / Host",
            "Status",
            "Uptime 24h",
            "Ping",
          ]);

          list.forEach((m: Monitor) => {
            const target =
              m.url ?? (m.hostname ? `${m.hostname}:${m.port}` : "—");
            const status = m.heartbeat
              ? statusLabel(m.heartbeat.status)
              : m.active
              ? statusLabel(2)
              : "⏸ Paused";
            table.push([
              String(m.id),
              m.name,
              m.type,
              target,
              status,
              formatUptime(m.uptime),
              formatPing(m.heartbeat?.ping),
            ]);
          });

          console.log(table.toString());
          console.log(`\n${list.length} monitor(s) total`);
        } catch (err) {
          handleError(err, opts);
        }
      }
    );

  // ADD
  monitors
    .command("add")
    .description("Add a new monitor — runs interactively if flags are omitted")
    .option("--name <name>", "Display name for the monitor")
    .option("--type <type>", "Monitor type: http, tcp, ping, dns, push, steam, ...")
    .option("--url <url>", "URL (http), hostname:port (tcp), or hostname (ping/dns)")
    .option("--interval <seconds>", "How often to check, in seconds (default: 60)", "60")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--instance <name>", "Target a specific instance")
    .option("--parent <id>", "Add as a child monitor under an existing group monitor (ID)")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors add")}                                          Interactive mode
  ${chalk.cyan("kuma monitors add --name \"My API\" --type http --url https://api.example.com")}
  ${chalk.cyan("kuma monitors add --name \"DB\" --type tcp --url db.host:5432 --interval 30")}
  ${chalk.cyan("kuma monitors add --name \"Ping\" --type ping --url 8.8.8.8 --json")}
`
    )
    .action(
      async (opts: {
        name?: string;
        type?: string;
        url?: string;
        interval?: string;
        json?: boolean;
        instance?: string;
        parent?: string;
      }) => {
        const json = isJsonMode(opts);

        try {
          const answers = await prompt([
            ...(!opts.name
              ? [{ type: "input", name: "name", message: "Monitor name:" }]
              : []),
            ...(!opts.type
              ? [
                  {
                    type: "select",
                    name: "type",
                    message: "Monitor type:",
                    choices: MONITOR_TYPES,
                  },
                ]
              : []),
          ]);

          const name = opts.name ?? answers.name;
          const type = opts.type ?? answers.type;
          let url = opts.url;
          if (!url && type !== "group") {
            const urlAnswer = await prompt([
              {
                type: "input",
                name: "url",
                message: "URL or hostname:",
              },
            ]);
            url = urlAnswer.url;
          }
          const interval = parseInt(opts.interval ?? "60", 10);

          const { client } = await resolveClient(opts);
          const result = await client.addMonitor({ 
            name, 
            type, 
            url, 
            interval, 
            parent: opts.parent ? parseInt(opts.parent, 10) : undefined 
          });
          client.disconnect();

          if (json) {
            jsonOut({ id: result.id, name, type, url, interval });
          }

          success(`Monitor "${name}" created (ID: ${result.id})`);
        } catch (err) {
          handleError(err, opts);
        }
      }
    );

  // CREATE (non-interactive, with tag support — for CI/CD pipelines)
  monitors
    .command("create")
    .description("Create a monitor non-interactively — designed for CI/CD pipelines")
    .requiredOption("--name <name>", "Monitor display name")
    .requiredOption("--type <type>", "Monitor type: http, tcp, ping, dns, push, ...")
    .option("--url <url>", "URL or hostname to monitor")
    .option("--interval <seconds>", "Check interval in seconds (default: 60)", "60")
    .option("--tag <tag>", "Assign a tag by name (repeatable — must already exist in Kuma)", collect, [])
    .option("--notification-id <id>", "Assign a notification channel by ID (repeatable)", collectInt, [])
    .option("--json", "Output as JSON ({ ok, data }) — prints monitor ID and pushToken to stdout")
    .option("--instance <name>", "Target a specific instance")
    .option("--parent <id>", "Create as a child monitor under an existing group monitor (ID)")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors create --type http --name \"habitu.ar\" --url https://habitu.ar")}
  ${chalk.cyan("kuma monitors create --type http --name \"My API\" --url https://api.example.com --tag Production --tag BlackAsteroid")}
  ${chalk.cyan("kuma monitors create --type push --name \"GH Runner\" --json | jq '.data.pushToken'")}
  ${chalk.cyan("kuma monitors create --type tcp --name \"DB\" --url db.host:5432 --interval 30 --notification-id 1")}

${chalk.dim("Full pipeline (deploy → monitor → heartbeat):")}
  ${chalk.cyan("RESULT=\$(kuma monitors create --type push --name \"runner\" --json)")}
  ${chalk.cyan("PUSH_TOKEN=\$(echo \$RESULT | jq -r '.data.pushToken')")}
  ${chalk.cyan("kuma heartbeat send \$PUSH_TOKEN --msg \"Alive\"")}
`
    )
    .action(async (opts: {
      name: string;
      type: string;
      url?: string;
      interval?: string;
      tag: string[];
      notificationId: number[];
      json?: boolean;
      instance?: string;
      parent?: string;
    }) => {
      const json = isJsonMode(opts);
      const interval = parseInt(opts.interval ?? "60", 10);

      // Validate required fields per type
      if (["http", "keyword", "tcp", "ping", "dns"].includes(opts.type) && !opts.url) {
        handleError(new Error(`--url is required for monitor type "${opts.type}"`), opts);
      }

      try {
        const { client, instanceName } = await resolveClient(opts);

        // Create the monitor
        const result = await client.addMonitor({
          name: opts.name,
          type: opts.type,
          url: opts.url,
          interval,
          parent: opts.parent ? parseInt(opts.parent, 10) : undefined,
        });
        const monitorId = result.id;
        // pushToken is returned directly from addMonitor for push monitors
        // (auto-generated in the client before sending to Kuma)
        let pushToken: string | null = result.pushToken ?? null;

        // BUG-02 fix: track tag warnings explicitly so JSON consumers can see them
        const tagWarnings: string[] = [];

        // Assign tags if specified
        if (opts.tag.length > 0) {
          const allTags = await client.getTags();
          const tagMap = new Map(allTags.map((t) => [t.name.toLowerCase(), t]));

          for (const tagName of opts.tag) {
            const found = tagMap.get(tagName.toLowerCase());
            if (!found) {
              const warn = `Tag "${tagName}" not found — skipping. Create it in the Kuma UI first.`;
              tagWarnings.push(warn);
              if (!json) {
                console.warn(chalk.yellow(`⚠️  ${warn}`));
              }
              continue;
            }
            await client.addMonitorTag(found.id, monitorId);
          }
        }

        // Assign notifications if specified
        if (opts.notificationId.length > 0) {
          const monitorMap = await client.getMonitorList();
          for (const notifId of opts.notificationId) {
            await client.setMonitorNotification(monitorId, notifId, true, monitorMap);
          }
        }

        client.disconnect();

        if (json) {
          const data: Record<string, unknown> = {
            id: monitorId,
            name: opts.name,
            type: opts.type,
            url: opts.url ?? null,
            interval,
          };
          if (pushToken) data.pushToken = pushToken;
          if (tagWarnings.length > 0) data.warnings = tagWarnings;
          // BUG-02: exit 1 when warnings exist so pipelines can detect the issue
          jsonOut(data, tagWarnings.length > 0 ? 1 : 0);
        }

        success(`Monitor "${opts.name}" created (ID: ${monitorId})`);
        if (pushToken) {
          const instanceUrl = getInstanceConfig(instanceName)?.url ?? "";
          console.log(`   Push token: ${chalk.cyan(pushToken)}`);
          console.log(`   Push URL:   ${chalk.dim(`${instanceUrl}/api/push/${pushToken}`)}`);
        }
        if (opts.tag.length > 0) {
          const applied = opts.tag.filter((t) => !tagWarnings.some((w) => w.includes(t)));
          if (applied.length > 0) console.log(`   Tags: ${applied.join(", ")}`);
        }
        // BUG-02: exit 1 if any tags were not found — makes pipeline failures visible
        if (tagWarnings.length > 0) {
          process.exit(1);
        }
      } catch (err) {
        handleError(err, opts);
      }
    });

  // UPDATE
  monitors
    .command("update <id>")
    .description("Update the name, URL, interval, or active state of a monitor")
    .option("--name <name>", "Set a new display name")
    .option("--url <url>", "Set a new URL or hostname")
    .option("--interval <seconds>", "Set a new check interval (seconds)")
    .option("--active", "Resume the monitor (mark as active)")
    .option("--no-active", "Pause the monitor (mark as inactive)")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--instance <name>", "Target a specific instance")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors update 42 --name \"Prod API\"")}
  ${chalk.cyan("kuma monitors update 42 --url https://new-url.com --interval 30")}
  ${chalk.cyan("kuma monitors update 42 --no-active")}          Pause the monitor
  ${chalk.cyan("kuma monitors update 42 --active")}             Resume the monitor
  ${chalk.cyan("kuma monitors update 42 --name \"New\" --json")}
`
    )
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          url?: string;
          interval?: string;
          active?: boolean;
          json?: boolean;
          instance?: string;
        }
      ) => {
        const json = isJsonMode(opts);
        const monitorId = parseInt(id, 10);
        if (isNaN(monitorId)) {
          handleError(new Error(`Invalid monitor ID: ${id}`), opts);
        }

        const hasPatch =
          opts.name !== undefined ||
          opts.url !== undefined ||
          opts.interval !== undefined ||
          opts.active !== undefined;

        if (!hasPatch) {
          handleError(
            new Error("No fields to update. Use --name, --url, --interval, --active, or --no-active."),
            opts
          );
        }

        try {
          const { client } = await resolveClient(opts);

          const monitorMap = await client.getMonitorList();
          const existing = monitorMap[String(monitorId)];

          if (!existing) {
            client.disconnect();
            const ids = Object.keys(monitorMap).join(", ");
            handleError(
              new Error(`Monitor ${monitorId} not found. Available IDs: ${ids || "none"}`),
              opts
            );
          }

          const changes: string[] = [];

          const hasFieldChanges =
            opts.name !== undefined ||
            opts.url !== undefined ||
            opts.interval !== undefined;

          if (hasFieldChanges) {
            const updated: Monitor = { ...existing };
            if (opts.name !== undefined) {
              updated.name = opts.name;
              changes.push(`name → "${opts.name}"`);
            }
            if (opts.url !== undefined) {
              updated.url = opts.url;
              changes.push(`url → "${opts.url}"`);
            }
            if (opts.interval !== undefined) {
              updated.interval = parseInt(opts.interval, 10);
              changes.push(`interval → ${opts.interval}s`);
            }
            await client.editMonitor(monitorId, updated);
          }

          if (opts.active !== undefined) {
            if (opts.active) {
              await client.resumeMonitor(monitorId);
              changes.push("activated");
            } else {
              await client.pauseMonitor(monitorId);
              changes.push("deactivated");
            }
          }

          client.disconnect();

          if (json) {
            jsonOut({ id: monitorId, changes });
          }

          success(`Monitor ${monitorId} updated (${changes.join(", ")})`);
        } catch (err) {
          handleError(err, opts);
        }
      }
    );

  // DELETE
  monitors
    .command("delete <id>")
    .description("Permanently delete a monitor and all its history")
    .option("--force", "Skip the confirmation prompt")
    .option("--json", "Output as JSON ({ ok, data }) — skips confirmation prompt")
    .option("--instance <name>", "Target a specific instance")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors delete 42")}              Prompt for confirmation first
  ${chalk.cyan("kuma monitors delete 42 --force")}      Delete without prompting
  ${chalk.cyan("kuma monitors delete 42 --json")}       Non-interactive JSON output

${chalk.dim("Note:")} This action is irreversible. All heartbeat history is deleted.
`
    )
    .action(async (id: string, opts: { force?: boolean; json?: boolean; instance?: string }) => {
      const json = isJsonMode(opts);

      try {
        if (!opts.force && !json) {
          // Skip prompt in JSON mode — caller drives non-interactive flows
          const { confirm } = (await prompt({
            type: "confirm",
            name: "confirm",
            message: `Delete monitor ${id}?`,
            initial: false,
          })) as { confirm: boolean };
          if (!confirm) {
            console.log("Aborted.");
            return;
          }
        }

        const { client } = await resolveClient(opts);
        await client.deleteMonitor(parseInt(id, 10));
        client.disconnect();

        if (json) {
          jsonOut({ id: parseInt(id, 10), deleted: true });
        }

        success(`Monitor ${id} deleted`);
      } catch (err) {
        handleError(err, opts);
      }
    });

  // PAUSE
  monitors
    .command("pause <id>")
    .description("Pause a monitor — stops checks without deleting it")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--instance <name>", "Target a specific instance")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors pause 42")}
  ${chalk.cyan("kuma monitors pause 42 --json")}
`
    )
    .action(async (id: string, opts: { json?: boolean; instance?: string }) => {
      const json = isJsonMode(opts);

      try {
        const { client } = await resolveClient(opts);
        await client.pauseMonitor(parseInt(id, 10));
        client.disconnect();

        if (json) {
          jsonOut({ id: parseInt(id, 10), paused: true });
        }

        success(`Monitor ${id} paused`);
      } catch (err) {
        handleError(err, opts);
      }
    });

  // RESUME
  monitors
    .command("resume <id>")
    .description("Resume checks for a paused monitor")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--instance <name>", "Target a specific instance")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors resume 42")}
  ${chalk.cyan("kuma monitors resume 42 --json")}
`
    )
    .action(async (id: string, opts: { json?: boolean; instance?: string }) => {
      const json = isJsonMode(opts);

      try {
        const { client } = await resolveClient(opts);
        await client.resumeMonitor(parseInt(id, 10));
        client.disconnect();

        if (json) {
          jsonOut({ id: parseInt(id, 10), resumed: true });
        }

        success(`Monitor ${id} resumed`);
      } catch (err) {
        handleError(err, opts);
      }
    });

  // BULK-PAUSE
  monitors
    .command("bulk-pause")
    .description("Pause all monitors matching a tag or status filter")
    .option("--tag <tag>", "Pause all monitors with this tag")
    .option("--status <status>", "Pause all monitors with this status: up, down, pending, maintenance")
    .option("--dry-run", "Preview which monitors would be paused without pausing them")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--instance <name>", "Target a specific instance")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors bulk-pause --tag Production")}              Pause all Production monitors
  ${chalk.cyan("kuma monitors bulk-pause --tag Production --dry-run")}    Preview without pausing
  ${chalk.cyan("kuma monitors bulk-pause --tag Production --json")}       Machine-readable results

${chalk.dim("CI/CD usage:")}
  ${chalk.cyan("kuma monitors bulk-pause --tag Production && ./deploy.sh && kuma monitors bulk-resume --tag Production")}
`
    )
    .action(async (opts: { tag?: string; status?: string; dryRun?: boolean; json?: boolean; instance?: string }) => {
      const json = isJsonMode(opts);

      if (!opts.tag && !opts.status) {
        handleError(new Error("At least one of --tag or --status is required"), opts);
      }

      const STATUS_MAP: Record<string, number> = { down: 0, up: 1, pending: 2, maintenance: 3 };

      try {
        const { client } = await resolveClient(opts);
        const monitorMap = await client.getMonitorList();
        const all = Object.values(monitorMap);

        let targets = all;
        if (opts.tag) {
          const tagName = opts.tag.toLowerCase();
          targets = targets.filter((m) =>
            Array.isArray(m.tags) && m.tags.some((t) => t.name.toLowerCase() === tagName)
          );
        }
        if (opts.status) {
          const statusNum = STATUS_MAP[opts.status.toLowerCase()];
          if (statusNum === undefined) {
            client.disconnect();
            handleError(new Error(`Invalid status "${opts.status}". Valid: up, down, pending, maintenance`), opts);
          }
          targets = targets.filter((m) => m.heartbeat?.status === statusNum);
        }

        if (targets.length === 0) {
          client.disconnect();
          if (json) jsonOut({ affected: 0, results: [] });
          console.log("No monitors matched the given filters.");
          return;
        }

        if (opts.dryRun) {
          client.disconnect();
          const preview = targets.map((m) => ({ id: m.id, name: m.name }));
          if (json) jsonOut({ dryRun: true, affected: targets.length, monitors: preview });
          console.log(chalk.yellow(`Dry run — would pause ${targets.length} monitor(s):`));
          preview.forEach((m) => console.log(`  ${chalk.dim(String(m.id).padStart(4))} ${m.name}`));
          return;
        }

        const results = await client.bulkPause((m) => targets.some((t) => t.id === m.id));
        client.disconnect();

        const failed = results.filter((r) => !r.ok);

        if (json) {
          jsonOut({ affected: results.length, failed: failed.length, results });
        }

        console.log(`Paused ${results.length - failed.length}/${results.length} monitor(s)`);
        if (failed.length > 0) {
          failed.forEach((r) => error(`  Monitor ${r.id} (${r.name}): ${r.error}`));
          process.exit(1);
        }
      } catch (err) {
        handleError(err, opts);
      }
    });

  // BULK-RESUME
  monitors
    .command("bulk-resume")
    .description("Resume all monitors matching a tag or status filter")
    .option("--tag <tag>", "Resume all monitors with this tag")
    .option("--status <status>", "Resume all monitors with this status: up, down, pending, maintenance")
    .option("--dry-run", "Preview which monitors would be resumed without resuming them")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--instance <name>", "Target a specific instance")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors bulk-resume --tag Production")}
  ${chalk.cyan("kuma monitors bulk-resume --tag Production --dry-run")}
  ${chalk.cyan("kuma monitors bulk-resume --tag Production --json")}
`
    )
    .action(async (opts: { tag?: string; status?: string; dryRun?: boolean; json?: boolean; instance?: string }) => {
      const json = isJsonMode(opts);

      if (!opts.tag && !opts.status) {
        handleError(new Error("At least one of --tag or --status is required"), opts);
      }

      const STATUS_MAP: Record<string, number> = { down: 0, up: 1, pending: 2, maintenance: 3 };

      try {
        const { client } = await resolveClient(opts);
        const monitorMap = await client.getMonitorList();
        const all = Object.values(monitorMap);

        let targets = all;
        if (opts.tag) {
          const tagName = opts.tag.toLowerCase();
          targets = targets.filter((m) =>
            Array.isArray(m.tags) && m.tags.some((t) => t.name.toLowerCase() === tagName)
          );
        }
        if (opts.status) {
          const statusNum = STATUS_MAP[opts.status.toLowerCase()];
          if (statusNum === undefined) {
            client.disconnect();
            handleError(new Error(`Invalid status "${opts.status}". Valid: up, down, pending, maintenance`), opts);
          }
          targets = targets.filter((m) => m.heartbeat?.status === statusNum);
        }

        if (targets.length === 0) {
          client.disconnect();
          if (json) jsonOut({ affected: 0, results: [] });
          console.log("No monitors matched the given filters.");
          return;
        }

        if (opts.dryRun) {
          client.disconnect();
          const preview = targets.map((m) => ({ id: m.id, name: m.name }));
          if (json) jsonOut({ dryRun: true, affected: targets.length, monitors: preview });
          console.log(chalk.yellow(`Dry run — would resume ${targets.length} monitor(s):`));
          preview.forEach((m) => console.log(`  ${chalk.dim(String(m.id).padStart(4))} ${m.name}`));
          return;
        }

        const results = await client.bulkResume((m) => targets.some((t) => t.id === m.id));
        client.disconnect();

        const failed = results.filter((r) => !r.ok);

        if (json) {
          jsonOut({ affected: results.length, failed: failed.length, results });
        }

        console.log(`Resumed ${results.length - failed.length}/${results.length} monitor(s)`);
        if (failed.length > 0) {
          failed.forEach((r) => error(`  Monitor ${r.id} (${r.name}): ${r.error}`));
          process.exit(1);
        }
      } catch (err) {
        handleError(err, opts);
      }
    });

  // SET-NOTIFICATION
  monitors
    .command("set-notification <id>")
    .description("Assign or remove a notification channel from a monitor")
    .requiredOption("--notification-id <nid>", "ID of the notification channel to assign")
    .option("--remove", "Remove the notification instead of assigning it")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--instance <name>", "Target a specific instance")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors set-notification 42 --notification-id 3")}
  ${chalk.cyan("kuma monitors set-notification 42 --notification-id 3 --remove")}
  ${chalk.cyan("kuma monitors set-notification 42 --notification-id 3 --json")}

${chalk.dim("Bulk assign via pipe:")}
  ${chalk.cyan("kuma monitors list --tag Production --json | jq '.data[].id' | xargs -I{} kuma monitors set-notification {} --notification-id 3")}
`
    )
    .action(async (
      id: string,
      opts: { notificationId: string; remove?: boolean; json?: boolean; instance?: string }
    ) => {
      const json = isJsonMode(opts);
      const monitorId = parseInt(id, 10);
      const notifId = parseInt(opts.notificationId, 10);

      if (isNaN(monitorId)) {
        handleError(new Error(`Invalid monitor ID: ${id}`), opts);
      }
      if (isNaN(notifId)) {
        handleError(new Error(`Invalid notification ID: ${opts.notificationId}`), opts);
      }

      try {
        const { client } = await resolveClient(opts);
        const monitorMap = await client.getMonitorList();
        await client.setMonitorNotification(
          monitorId,
          notifId,
          !opts.remove,
          monitorMap
        );
        client.disconnect();

        const action = opts.remove ? "removed from" : "assigned to";
        if (json) {
          jsonOut({ monitorId, notificationId: notifId, action: opts.remove ? "removed" : "assigned" });
        }

        success(`Notification ${notifId} ${action} monitor ${monitorId}`);
      } catch (err) {
        handleError(err, opts);
      }
    });
}
