import { Command } from "commander";
import { createAuthenticatedClient } from "../client.js";
import { getConfig } from "../config.js";
import {
  createTable,
  statusLabel,
  formatPing,
  formatDate,
  isJsonMode,
  jsonOut,
} from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";
import chalk from "chalk";

export function heartbeatCommand(program: Command): void {
  program
    .command("heartbeat <monitor-id>")
    .description("View recent heartbeats (check results) for a monitor")
    .option("--limit <n>", "Maximum number of heartbeats to display (default: 20)", "20")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma heartbeat 42")}                  Last 20 heartbeats for monitor 42
  ${chalk.cyan("kuma heartbeat 42 --limit 50")}       Last 50 heartbeats
  ${chalk.cyan("kuma heartbeat 42 --json")}           Machine-readable output
  ${chalk.cyan("kuma heartbeat 42 --json | jq '.data[] | select(.status == 0)'")}   Show failures
`
    )
    .action(async (monitorId: string, opts: { limit?: string; json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

      const json = isJsonMode(opts);

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        const heartbeats = await client.getHeartbeatList(
          parseInt(monitorId, 10)
        );
        client.disconnect();

        const limit = parseInt(opts.limit ?? "20", 10);
        const recent = heartbeats.slice(-limit).reverse();

        if (json) {
          jsonOut(recent);
        }

        if (recent.length === 0) {
          console.log("No heartbeats found.");
          return;
        }

        const table = createTable(["Time", "Status", "Ping", "Message"]);

        recent.forEach((hb) => {
          table.push([
            formatDate(hb.time),
            statusLabel(hb.status),
            formatPing(hb.ping),
            hb.msg ?? "—",
          ]);
        });

        console.log(table.toString());
        console.log(`\nShowing last ${recent.length} heartbeat(s)`);
      } catch (err) {
        handleError(err, opts);
      }
    });
}
