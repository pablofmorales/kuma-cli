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
    .action(
      async (
        id: string,
        opts: { name?: string; url?: string; interval?: string }
      ) => {
        const config = getConfig();
        if (!config) requireAuth();

        const patch: Record<string, string | number> = {};
        if (opts.name) patch.name = opts.name;
        if (opts.url) patch.url = opts.url;
        if (opts.interval) patch.interval = parseInt(opts.interval, 10);

        if (Object.keys(patch).length === 0) {
          error("No fields to update. Use --name, --url, or --interval.");
          process.exit(1);
        }

        try {
          const client = await createAuthenticatedClient(
            config!.url,
            config!.token
          );
          await client.editMonitor(parseInt(id, 10), patch);
          client.disconnect();
          success(`Monitor ${id} updated`);
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

  // DOWN — shortcut for monitors with status 0 (DOWN)
  monitors
    .command("down")
    .description("Show only monitors that are currently DOWN")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth();

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        const monitorMap = await client.getMonitorList();
        client.disconnect();

        const list = Object.values(monitorMap).filter(
          (m: Monitor) => m.heartbeat?.status === 0
        );

        if (opts.json) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        if (list.length === 0) {
          console.log("✅ All monitors are UP");
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
          table.push([
            String(m.id),
            m.name,
            m.type,
            target,
            statusLabel(0),
            formatUptime(m.uptime),
            formatPing(m.heartbeat?.ping),
          ]);
        });

        console.log(table.toString());
        console.log(`\n${list.length} monitor(s) DOWN`);
      } catch (err) {
        handleError(err);
      }
    });
}

/**
 * Register `kuma down` as a top-level alias for `kuma monitors down`.
 * Called from src/index.ts after monitorsCommand().
 */
export function downAliasCommand(program: Command): void {
  program
    .command("down")
    .description("Show only monitors that are currently DOWN (alias for: monitors down)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth();

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        const monitorMap = await client.getMonitorList();
        client.disconnect();

        const list = Object.values(monitorMap).filter(
          (m: Monitor) => m.heartbeat?.status === 0
        );

        if (opts.json) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        if (list.length === 0) {
          console.log("✅ All monitors are UP");
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
          table.push([
            String(m.id),
            m.name,
            m.type,
            target,
            statusLabel(0),
            formatUptime(m.uptime),
            formatPing(m.heartbeat?.ping),
          ]);
        });

        console.log(table.toString());
        console.log(`\n${list.length} monitor(s) DOWN`);
      } catch (err) {
        handleError(err);
      }
    });
}
