import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { monitorsCommand } from "./commands/monitors.js";
import { heartbeatCommand } from "./commands/heartbeat.js";
import { statusPagesCommand } from "./commands/status-pages.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { notificationsCommand } from "./commands/notifications.js";
import { getConfig, getConfigPath } from "./config.js";
import chalk from "chalk";
import { isJsonMode, jsonOut } from "./utils/output.js";

const program = new Command();

program
  .name("kuma")
  .description("Manage Uptime Kuma monitors, heartbeats, and status pages from your terminal.")
  .version("0.1.0")
  .addHelpText(
    "beforeAll",
    `
${chalk.bold.cyan("Uptime Kuma CLI")} — terminal control for your monitoring stack

`
  )
  .addHelpText(
    "after",
    `
${chalk.bold("Quick Start:")}
  ${chalk.cyan("kuma login https://kuma.example.com")}   Authenticate (saves session)
  ${chalk.cyan("kuma monitors list")}                    List all monitors + status
  ${chalk.cyan("kuma monitors add --name \"My API\" --type http --url https://api.example.com")}
  ${chalk.cyan("kuma heartbeat view 42")}                View recent heartbeats for monitor 42
  ${chalk.cyan("kuma logout")}                           Clear saved session

${chalk.bold("JSON / scripting mode:")}
  ${chalk.cyan("kuma monitors list --json")}             Output as ${chalk.dim("{ ok, data }")} for piping
  ${chalk.cyan("KUMA_JSON=1 kuma monitors list")}        Activate JSON mode globally via env var
  ${chalk.cyan("kuma monitors list --json | jq '.data[].name'")}

${chalk.bold("Exit codes:")}
  ${chalk.yellow("0")}  Success
  ${chalk.yellow("1")}  General error
  ${chalk.yellow("2")}  Connection / network error
  ${chalk.yellow("3")}  Not found
  ${chalk.yellow("4")}  Auth error (session expired — run ${chalk.cyan("kuma login")} again)

${chalk.dim("Config stored at:")} ${chalk.yellow(getConfigPath())}
`
  );

// ── Status ────────────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show the current connection config and login state")
  .option("--json", "Output as JSON ({ ok, data })")
  .addHelpText(
    "after",
    `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma status")}              Check if you are logged in
  ${chalk.cyan("kuma status --json")}       Machine-readable login state
`
  )
  .action((opts: { json?: boolean }) => {
    const json = isJsonMode(opts);
    const config = getConfig();

    if (!config) {
      if (json) {
        jsonOut({ loggedIn: false });
      }
      console.log(chalk.yellow("Not logged in. Run: kuma login <url>"));
      return;
    }

    if (json) {
      jsonOut({
        loggedIn: true,
        url: config.url,
        configPath: getConfigPath(),
      });
    }

    console.log(chalk.green("✅ Logged in"));
    console.log(`   URL:    ${chalk.cyan(config.url)}`);
    console.log(
      `   Token:  ${chalk.dim(config.token.slice(0, 8) + "..." + config.token.slice(-4))}`
    );
    console.log(`   Config: ${chalk.dim(getConfigPath())}`);
  });

// Register all commands
loginCommand(program);
logoutCommand(program);
monitorsCommand(program);
heartbeatCommand(program);
statusPagesCommand(program);
upgradeCommand(program);
notificationsCommand(program);

program.parse(process.argv);
