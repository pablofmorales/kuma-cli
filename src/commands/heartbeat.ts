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
  jsonError,
  success,
} from "../utils/output.js";
import { handleError, requireAuth, EXIT_CODES } from "../utils/errors.js";
import chalk from "chalk";

export function heartbeatCommand(program: Command): void {
  const hb = program
    .command("heartbeat")
    .description("View heartbeat history or send push heartbeats to monitors")
    .addHelpText(
      "after",
      `
${chalk.dim("Subcommands:")}
  ${chalk.cyan("heartbeat view <monitor-id>")}      View recent heartbeats for a monitor
  ${chalk.cyan("heartbeat send <push-token>")}      Send a push heartbeat (for scripts / GitHub Actions)

${chalk.dim("Run")} ${chalk.cyan("kuma heartbeat <subcommand> --help")} ${chalk.dim("for examples.")}
`
    );

  // ── VIEW ────────────────────────────────────────────────────────────────────
  hb
    .command("view <monitor-id>")
    .description("View recent heartbeats (check results) for a monitor")
    .option("--limit <n>", "Maximum number of heartbeats to display (default: 20)", "20")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma heartbeat view 42")}
  ${chalk.cyan("kuma heartbeat view 42 --limit 50")}
  ${chalk.cyan("kuma heartbeat view 42 --json")}
  ${chalk.cyan("kuma heartbeat view 42 --json | jq '.data[] | select(.status == 0)'")}
`
    )
    .action(async (monitorId: string, opts: { limit?: string; json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

      const json = isJsonMode(opts);

      try {
        const client = await createAuthenticatedClient(config!.url, config!.token);
        const heartbeats = await client.getHeartbeatList(parseInt(monitorId, 10));
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

  // ── SEND ─────────────────────────────────────────────────────────────────────
  hb
    .command("send <push-token>")
    .description("Send a push heartbeat to a Kuma push monitor (for scripts and GitHub Actions)")
    .option("--status <status>", "Heartbeat status: up, down, maintenance (default: up)")
    .option("--msg <message>", "Optional status message")
    .option("--ping <ms>", "Optional response time in milliseconds")
    .option("--url <url>", "Kuma base URL (defaults to saved login URL)")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma heartbeat send abc123")}
  ${chalk.cyan("kuma heartbeat send abc123 --status down --msg \"Job failed\"")}
  ${chalk.cyan("kuma heartbeat send abc123 --msg \"Deploy complete\" --ping 42")}
  ${chalk.cyan("kuma heartbeat send abc123 --json")}

${chalk.dim("GitHub Actions usage:")}
  ${chalk.cyan("- name: Heartbeat")}
  ${chalk.cyan("  if: always()")}
  ${chalk.cyan("  run: kuma heartbeat send \${{ secrets.RUNNER_PUSH_TOKEN }} --status \${{ job.status == 'success' && 'up' || 'down' }}")}

${chalk.dim("Finding your push token:")}
  Create a "Push" monitor in Kuma UI. The push URL is:
  https://kuma.example.com/api/push/<token>
  Use only the <token> part.

  Or get it from CLI: kuma monitors create --type push --name "my-runner" --json | jq '.data.pushToken'
`
    )
    .action(async (pushToken: string, opts: {
      status?: string;
      msg?: string;
      ping?: string;
      url?: string;
      json?: boolean;
    }) => {
      const json = isJsonMode(opts);

      // Validate status before doing any network call
      const VALID_STATUSES = ["up", "down", "maintenance"];
      const statusKey = (opts.status ?? "up").toLowerCase();
      if (!VALID_STATUSES.includes(statusKey)) {
        const msg = `Invalid status "${opts.status}". Valid: up, down, maintenance`;
        if (json) jsonError(msg, EXIT_CODES.GENERAL);
        console.error(chalk.red(`❌ ${msg}`));
        process.exit(EXIT_CODES.GENERAL);
      }

      // Determine base URL
      let baseUrl = opts.url;
      if (!baseUrl) {
        const config = getConfig();
        if (!config) {
          const msg = "No --url specified and not logged in. Run: kuma login <url> or pass --url";
          if (json) jsonError(msg, EXIT_CODES.AUTH);
          console.error(chalk.red(`❌ ${msg}`));
          process.exit(EXIT_CODES.AUTH);
        }
        baseUrl = config.url;
      }

      // Build the push URL
      const pushUrl = new URL(`${baseUrl.replace(/\/$/, "")}/api/push/${pushToken}`);
      pushUrl.searchParams.set("status", statusKey);
      if (opts.msg) pushUrl.searchParams.set("msg", opts.msg);
      if (opts.ping) pushUrl.searchParams.set("ping", opts.ping);

      try {
        const res = await fetch(pushUrl.toString(), {
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const msg = `Push failed (HTTP ${res.status}): ${body || res.statusText}`;
          if (json) jsonError(msg, EXIT_CODES.GENERAL);
          console.error(chalk.red(`❌ ${msg}`));
          process.exit(EXIT_CODES.GENERAL);
        }

        // Kuma push endpoint returns { ok: boolean, msg?: string }
        const data = await res.json().catch(() => ({ ok: true })) as { ok?: boolean; msg?: string };

        if (data.ok === false) {
          // Server returned ok:false inside a 200 response (e.g. invalid token)
          const msg = data.msg ?? "Kuma rejected the push heartbeat";
          if (json) jsonError(msg, EXIT_CODES.GENERAL);
          console.error(chalk.red(`❌ ${msg}`));
          process.exit(EXIT_CODES.GENERAL);
        }

        if (json) {
          jsonOut({ pushToken, status: statusKey, msg: opts.msg ?? null });
        }

        success(`Push heartbeat sent (${statusKey}${opts.msg ? ` — ${opts.msg}` : ""})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (json) jsonError(msg, EXIT_CODES.CONNECTION);
        console.error(chalk.red(`❌ ${msg}`));
        process.exit(EXIT_CODES.CONNECTION);
      }
    });
}
