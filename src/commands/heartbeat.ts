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

export function heartbeatCommand(program: Command): void {
  program
    .command("heartbeat <monitor-id>")
    .description("View recent heartbeats for a monitor")
    .option("--limit <n>", "Number of heartbeats to show", "20")
    .option("--json", "Output as JSON ({ ok, data })")
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
