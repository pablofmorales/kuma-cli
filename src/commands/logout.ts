import { Command } from "commander";
import { clearConfig, getActiveContext, getInstanceConfig, getAllInstances, removeInstanceConfig } from "../config.js";
import { success, error, isJsonMode, jsonOut } from "../utils/output.js";
import chalk from "chalk";

export function logoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Clear the saved session token (you will need to run login again)")
    .option("--json", "Output as JSON ({ ok, data })")
    .option("--all", "Logout from all instances and clear all config")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma logout")}
  ${chalk.cyan("kuma logout --json")}
`
    )
    .action((opts: { json?: boolean; all?: boolean }) => {
      const json = isJsonMode(opts);

      if (opts.all) {
        clearConfig();
        if (json) {
          jsonOut({ loggedOut: true, all: true });
        }
        success("Logged out from all instances.");
        return;
      }

      // Resolve active instance name
      const active = getActiveContext();
      let instanceName: string | null = null;

      if (active?.type === "instance") {
        const inst = getInstanceConfig(active.name);
        if (inst) instanceName = active.name;
      } else if (active?.type === "cluster") {
        // For cluster context, we don't remove the cluster — just explain
      }

      // Fallback: if only one instance exists, use it
      if (!instanceName) {
        const all = getAllInstances();
        const names = Object.keys(all);
        if (names.length === 1) {
          instanceName = names[0];
        }
      }

      if (!instanceName) {
        if (json) {
          jsonOut({ loggedOut: false, reason: "No active instance" });
        }
        error("No active instance. Use --all to logout from all, or: kuma use <name>");
        return;
      }

      removeInstanceConfig(instanceName);

      if (json) {
        jsonOut({ loggedOut: true, instanceName });
      }

      success(`Logged out from "${instanceName}". Run \`kuma login <url>\` to authenticate again.`);
    });
}
