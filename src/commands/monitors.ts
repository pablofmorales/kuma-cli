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
  isJsonMode,
  jsonOut,
} from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";
import chalk from "chalk";

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
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors list")}                        List all monitors
  ${chalk.cyan("kuma monitors list --status down")}          Show only DOWN monitors
  ${chalk.cyan("kuma monitors list --tag production")}       Filter by tag
  ${chalk.cyan("kuma monitors list --json | jq '.data[].name'")}
`
    )
    .action(
      async (opts: { json?: boolean; status?: string; tag?: string }) => {
        const config = getConfig();
        if (!config) requireAuth(opts);

        const json = isJsonMode(opts);

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

          if (json) {
            jsonOut(list);
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
      }) => {
        const config = getConfig();
        if (!config) requireAuth(opts);

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

          if (json) {
            jsonOut({ id: result.id, name, type, url, interval });
          }

          success(`Monitor "${name}" created (ID: ${result.id})`);
        } catch (err) {
          handleError(err, opts);
        }
      }
    );

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
        }
      ) => {
        const config = getConfig();
        if (!config) requireAuth(opts);

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
          const client = await createAuthenticatedClient(
            config!.url,
            config!.token
          );

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
    .action(async (id: string, opts: { force?: boolean; json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

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

        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
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
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors pause 42")}
  ${chalk.cyan("kuma monitors pause 42 --json")}
`
    )
    .action(async (id: string, opts: { json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

      const json = isJsonMode(opts);

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
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
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma monitors resume 42")}
  ${chalk.cyan("kuma monitors resume 42 --json")}
`
    )
    .action(async (id: string, opts: { json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

      const json = isJsonMode(opts);

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
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
}
