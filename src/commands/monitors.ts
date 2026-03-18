import { Command } from "commander";
import enquirer from "enquirer";
import { createAuthenticatedClient, Monitor } from "../client.js";
import { getConfig } from "../config.js";
import {
  createTable,
  statusLabel,
  formatUptime,
  formatPing,
  success,
  error,
} from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";

const { prompt } = enquirer as any;

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
];

export function monitorsCommand(program: Command): void {
  const monitors = program.command("monitors").description("Manage monitors");

  // LIST
  monitors
    .command("list")
    .description("List all monitors")
    .option("--json", "Output raw JSON")
    .option(
      "--status <status>",
      "Filter by status: up, down, pending, maintenance"
    )
    .option("--tag <tag>", "Filter by tag name")
    .action(
      async (opts: { json?: boolean; status?: string; tag?: string }) => {
        const config = getConfig();
        if (!config) requireAuth();

        // Map human-readable status strings to numeric values
        const STATUS_MAP: Record<string, number> = {
          down: 0,
          up: 1,
          pending: 2,
          maintenance: 3,
        };

        try {
          const client = await createAuthenticatedClient(
            config!.url,
            config!.token
          );
          const monitorMap = await client.getMonitorList();
          client.disconnect();

          let list = Object.values(monitorMap);

          // Apply --status filter
          if (opts.status) {
            const statusKey = opts.status.toLowerCase();
            if (!(statusKey in STATUS_MAP)) {
              error(
                `Invalid status "${opts.status}". Valid values: up, down, pending, maintenance`
              );
              process.exit(1);
            }
            const statusNum = STATUS_MAP[statusKey];
            list = list.filter((m: Monitor) => {
              if (m.heartbeat) return m.heartbeat.status === statusNum;
              // For monitors with no heartbeat yet, match "pending" (2)
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

          if (opts.json) {
            console.log(JSON.stringify(list, null, 2));
            return;
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
          handleError(err);
        }
      }
    );

  // ADD
  monitors
    .command("add")
    .description("Add a new monitor")
    .option("--name <name>", "Monitor name")
    .option("--type <type>", "Monitor type (http, tcp, ping, ...)")
    .option("--url <url>", "URL or hostname to monitor")
    .option("--interval <seconds>", "Check interval in seconds", "60")
    .action(
      async (opts: {
        name?: string;
        type?: string;
        url?: string;
        interval?: string;
      }) => {
        const config = getConfig();
        if (!config) requireAuth();

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
            ...(!opts.url
              ? [
                  {
                    type: "input",
                    name: "url",
                    message: "URL or hostname:",
                  },
                ]
              : []),
          ]);

          const name = opts.name ?? answers.name;
          const type = opts.type ?? answers.type;
          const url = opts.url ?? answers.url;
          const interval = parseInt(opts.interval ?? "60", 10);

          const client = await createAuthenticatedClient(
            config!.url,
            config!.token
          );
          const result = await client.addMonitor({ name, type, url, interval });
          client.disconnect();

          success(`Monitor "${name}" created (ID: ${result.id})`);
        } catch (err) {
          handleError(err);
        }
      }
    );

  // UPDATE
  monitors
    .command("update <id>")
    .description("Update an existing monitor's settings")
    .option("--name <name>", "New monitor name")
    .option("--url <url>", "New URL or hostname")
    .option("--interval <seconds>", "New check interval in seconds")
    .option("--active", "Activate (resume) the monitor")
    .option("--no-active", "Deactivate (pause) the monitor")
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          url?: string;
          interval?: string;
          active?: boolean;
        }
      ) => {
        const config = getConfig();
        if (!config) requireAuth();

        const monitorId = parseInt(id, 10);
        if (isNaN(monitorId)) {
          error(`Invalid monitor ID: ${id}`);
          process.exit(1);
        }

        // Determine which fields were explicitly provided
        const hasPatch =
          opts.name !== undefined ||
          opts.url !== undefined ||
          opts.interval !== undefined ||
          opts.active !== undefined;

        if (!hasPatch) {
          error(
            "No fields to update. Use --name, --url, --interval, --active, or --no-active."
          );
          process.exit(1);
        }

        try {
          const client = await createAuthenticatedClient(
            config!.url,
            config!.token
          );

          // Fetch full monitor list so we can send the complete object back
          // (Kuma's editMonitor requires all fields, not just the diff)
          const monitorMap = await client.getMonitorList();
          const existing = monitorMap[String(monitorId)];

          if (!existing) {
            client.disconnect();
            const ids = Object.keys(monitorMap).join(", ");
            error(
              `Monitor ${monitorId} not found. Available IDs: ${ids || "none"}`
            );
            process.exit(1);
          }

          // Build a human-readable summary of what changed
          const changes: string[] = [];

          // Apply field changes via editMonitor (name, url, interval)
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

          // Apply active/inactive via pauseMonitor / resumeMonitor
          // (editMonitor ignores the active field — Kuma uses separate events)
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
          success(`Monitor ${monitorId} updated (${changes.join(", ")})`);
        } catch (err) {
          handleError(err);
        }
      }
    );

  // DELETE
  monitors
    .command("delete <id>")
    .description("Delete a monitor")
    .option("--force", "Skip confirmation")
    .action(async (id: string, opts: { force?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth();

      try {
        if (!opts.force) {
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

        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        await client.deleteMonitor(parseInt(id, 10));
        client.disconnect();

        success(`Monitor ${id} deleted`);
      } catch (err) {
        handleError(err);
      }
    });

  // PAUSE
  monitors
    .command("pause <id>")
    .description("Pause a monitor")
    .action(async (id: string) => {
      const config = getConfig();
      if (!config) requireAuth();

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        await client.pauseMonitor(parseInt(id, 10));
        client.disconnect();
        success(`Monitor ${id} paused`);
      } catch (err) {
        handleError(err);
      }
    });

  // RESUME
  monitors
    .command("resume <id>")
    .description("Resume a monitor")
    .action(async (id: string) => {
      const config = getConfig();
      if (!config) requireAuth();

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        await client.resumeMonitor(parseInt(id, 10));
        client.disconnect();
        success(`Monitor ${id} resumed`);
      } catch (err) {
        handleError(err);
      }
    });
}
