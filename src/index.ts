import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { monitorsCommand } from "./commands/monitors.js";
import { heartbeatCommand } from "./commands/heartbeat.js";
import { statusPagesCommand } from "./commands/status-pages.js";
import { getConfig, getConfigPath } from "./config.js";
import chalk from "chalk";

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

${chalk.dim("Config stored at:")} ${chalk.yellow(getConfigPath())}
`
  );

// Status command (quick check)
program
  .command("status")
  .description("Show current connection config")
  .action(() => {
    const config = getConfig();
    if (!config) {
      console.log(chalk.yellow("Not logged in. Run: kuma login <url>"));
    } else {
      console.log(chalk.green("✅ Logged in"));
      console.log(`   URL:   ${chalk.cyan(config.url)}`);
      console.log(
        `   Token: ${chalk.dim(config.token.slice(0, 8) + "..." + config.token.slice(-4))}`
      );
      console.log(`   Config: ${chalk.dim(getConfigPath())}`);
    }
  });

// Register all commands
loginCommand(program);
monitorsCommand(program);
heartbeatCommand(program);
statusPagesCommand(program);

program.parse(process.argv);
