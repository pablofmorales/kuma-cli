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

        const list = Object.values(monitorMap);

        if (opts.json) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        if (list.length === 0) {
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

        list.forEach((m: Monitor) => {
          const target = m.url ?? (m.hostname ? `${m.hostname}:${m.port}` : "—");
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
    });

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
