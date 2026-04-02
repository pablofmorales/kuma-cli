import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { Dashboard } from "../tui/Dashboard.js";
import { getActiveContext, getInstanceConfig, getAllClusters } from "../config.js";
import chalk from "chalk";

export function dashboardCommand(program: Command) {
  program
    .command("dashboard")
    .description("Launch the real-time TUI dashboard")
    .action(async () => {
      const active = getActiveContext();
      if (!active) {
        console.error(chalk.red("Error: No active instance. Run 'kuma login' or 'kuma use' first."));
        process.exit(1);
      }

      let instanceName = "";
      if (active.type === "instance") {
        instanceName = active.name;
      } else {
        const clusters = getAllClusters();
        const cluster = clusters[active.name];
        if (!cluster) {
          console.error(chalk.red(`Error: Cluster '${active.name}' not found.`));
          process.exit(1);
        }
        instanceName = cluster.primary;
      }

      const instance = getInstanceConfig(instanceName);
      if (!instance) {
        console.error(chalk.red(`Error: Instance '${instanceName}' not found.`));
        process.exit(1);
      }

      const { waitUntilExit } = render(
        React.createElement(Dashboard, {
          instanceName,
          url: instance.url,
        })
      );

      await waitUntilExit();
    });
}
