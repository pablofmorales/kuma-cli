import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { monitorsCommand } from "./commands/monitors.js";
import { heartbeatCommand } from "./commands/heartbeat.js";
import { statusPagesCommand } from "./commands/status-pages.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { notificationsCommand } from "./commands/notifications.js";
import { configCommand } from "./commands/config.js";
import { instancesCommand } from "./commands/instances.js";
import { useCommand } from "./commands/use.js";
import { getConfig, getConfigPath, getAllInstances, getAllClusters, getActiveContext, getInstanceConfig, getInstanceCluster } from "./config.js";
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
    const active = getActiveContext();
    const instances = getAllInstances();
    const clusters = getAllClusters();
    const instanceCount = Object.keys(instances).length;
    const clusterCount = Object.keys(clusters).length;
    const configPath = getConfigPath();

    if (json) {
      const config = getConfig();
      return jsonOut({
        loggedIn: !!config,
        active: active ?? undefined,
        url: config?.url,
        instanceCount,
        clusterCount,
        configPath,
      });
    }

    if (!active && instanceCount === 0) {
      console.log(chalk.yellow("Not logged in. Run: kuma login <url>"));
      return;
    }

    if (active?.type === "instance") {
      const inst = getInstanceConfig(active.name);
      if (inst) {
        console.log(chalk.green(`Active: ${active.name}`) + ` (${chalk.cyan(inst.url)})`);
        const clusterName = getInstanceCluster(active.name);
        if (clusterName) {
          console.log(`         Member of cluster: ${chalk.magenta(clusterName)}`);
        }
      } else {
        console.log(chalk.yellow(`Active instance '${active.name}' not found in config.`));
      }
    } else if (active?.type === "cluster") {
      const cluster = clusters[active.name];
      if (cluster) {
        const primaryInst = getInstanceConfig(cluster.primary);
        const primaryUrl = primaryInst ? ` (${chalk.cyan(primaryInst.url)})` : "";
        console.log(chalk.green(`Active: cluster '${active.name}'`) + ` primary: ${cluster.primary}${primaryUrl}`);
      } else {
        console.log(chalk.yellow(`Active cluster '${active.name}' not found in config.`));
      }
    } else if (instanceCount === 1) {
      const name = Object.keys(instances)[0];
      const inst = instances[name];
      console.log(chalk.green(`Active: ${name}`) + ` (${chalk.cyan(inst.url)})`);
    } else {
      console.log(chalk.yellow("No active context set. Run: kuma use <instance>"));
    }

    console.log();
    console.log(`Instances: ${chalk.bold(String(instanceCount))}`);
    console.log(`Clusters:  ${chalk.bold(String(clusterCount))}`);
    console.log(`Config:    ${chalk.dim(configPath)}`);
  });

// Register all commands
loginCommand(program);
logoutCommand(program);
monitorsCommand(program);
heartbeatCommand(program);
statusPagesCommand(program);
upgradeCommand(program);
notificationsCommand(program);
configCommand(program);
instancesCommand(program);
useCommand(program);

program.parse(process.argv);
