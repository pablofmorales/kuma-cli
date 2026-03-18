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
