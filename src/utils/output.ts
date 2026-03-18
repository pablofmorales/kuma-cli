import chalk from "chalk";
import Table from "cli-table3";

export const STATUS_LABELS: Record<number, string> = {
  0: chalk.red("● DOWN"),
  1: chalk.green("● UP"),
  2: chalk.yellow("● PENDING"),
  3: chalk.gray("● MAINTENANCE"),
};

export function statusLabel(status: number): string {
  return STATUS_LABELS[status] ?? chalk.gray("● UNKNOWN");
}

export function createTable(head: string[]): Table.Table {
  return new Table({
    head: head.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
    chars: {
      top: "─",
      "top-mid": "┬",
      "top-left": "╭",
      "top-right": "╮",
      bottom: "─",
      "bottom-mid": "┴",
      "bottom-left": "╰",
      "bottom-right": "╯",
      left: "│",
      "left-mid": "├",
      mid: "─",
      "mid-mid": "┼",
      right: "│",
      "right-mid": "┤",
      middle: "│",
    },
  });
}

export function success(msg: string): void {
  console.log(chalk.green("✅ " + msg));
}

export function error(msg: string): void {
  console.error(chalk.red("❌ " + msg));
}

export function warn(msg: string): void {
  console.warn(chalk.yellow("⚠️  " + msg));
}

export function info(msg: string): void {
  console.log(chalk.blue("ℹ️  " + msg));
}

export function formatUptime(uptime?: number): string {
  if (uptime === undefined || uptime === null) return chalk.gray("—");
  const pct = (uptime * 100).toFixed(1);
  const n = parseFloat(pct);
  if (n >= 99) return chalk.green(`${pct}%`);
  if (n >= 95) return chalk.yellow(`${pct}%`);
  return chalk.red(`${pct}%`);
}

export function formatPing(ping?: number): string {
  if (!ping) return chalk.gray("—");
  if (ping < 200) return chalk.green(`${ping}ms`);
  if (ping < 500) return chalk.yellow(`${ping}ms`);
  return chalk.red(`${ping}ms`);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

// ---------------------------------------------------------------------------
// JSON mode helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when JSON output is requested — either via the `--json` flag
 * passed to a command, or the `KUMA_JSON` environment variable being set to
 * any truthy value ("1", "true", "yes").
 */
export function isJsonMode(opts?: { json?: boolean }): boolean {
  if (opts?.json) return true;
  const env = process.env["KUMA_JSON"];
  return env === "1" || env === "true" || env === "yes";
}

/**
 * Emit a successful JSON response to stdout and exit 0.
 * Shape: `{ "ok": true, "data": <payload> }`
 */
export function jsonOut(data: unknown): never {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
  process.exit(0);
}

/**
 * Emit an error JSON response to stdout (not stderr — so pipes work) and exit
 * with the given code.
 * Shape: `{ "ok": false, "error": "<message>", "code": <exitCode> }`
 */
export function jsonError(message: string, code = 1): never {
  console.log(JSON.stringify({ ok: false, error: message, code }, null, 2));
  process.exit(code);
}
