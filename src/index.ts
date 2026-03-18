import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { monitorsCommand } from "./commands/monitors.js";
import { heartbeatCommand } from "./commands/heartbeat.js";
import { statusPagesCommand } from "./commands/status-pages.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { getConfig, getConfigPath } from "./config.js";
import chalk from "chalk";
import { isJsonMode, jsonOut } from "./utils/output.js";

const program = new Command();

program
  .name("kuma")
  .description("CLI for managing Uptime Kuma via Socket.IO API")
  .version("0.1.0")
  .addHelpText(
    "after",
    `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma login https://kuma.example.com")}
  ${chalk.cyan("kuma monitors list")}
  ${chalk.cyan("kuma monitors add --name \"My API\" --type http --url https://api.example.com")}
  ${chalk.cyan("kuma heartbeat 1")}
  ${chalk.cyan("kuma logout")}

${chalk.dim("JSON mode (any command):")}
  ${chalk.cyan("kuma monitors list --json")}
  ${chalk.cyan("KUMA_JSON=1 kuma monitors list")}

${chalk.dim("Exit codes:")}
  ${chalk.yellow("0")}  Success
  ${chalk.yellow("1")}  General error
  ${chalk.yellow("2")}  Connection error
  ${chalk.yellow("3")}  Not found
  ${chalk.yellow("4")}  Auth error

${chalk.dim("Config stored at:")} ${chalk.yellow(getConfigPath())}
`
  );

// Status command (quick check)
program
  .command("status")
  .description("Show current connection config")
  .option("--json", "Output as JSON ({ ok, data })")
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
    console.log(`   URL:   ${chalk.cyan(config.url)}`);
    console.log(
      `   Token: ${chalk.dim(config.token.slice(0, 8) + "..." + config.token.slice(-4))}`
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

program.parse(process.argv);
