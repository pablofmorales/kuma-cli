import { Command } from "commander";
import {
  getAllInstances,
  getActiveContext,
  removeInstanceConfig,
  getInstanceCluster,
} from "../config.js";
import { createTable, success, error, warn, isJsonMode, jsonOut, jsonError } from "../utils/output.js";

export function instancesCommand(program: Command): void {
  const instances = program
    .command("instances")
    .description("Manage Uptime Kuma instances");

  instances
    .command("list")
    .description("List all configured instances")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const all = getAllInstances();
      const active = getActiveContext();
      const names = Object.keys(all);

      if (names.length === 0) {
        if (isJsonMode(opts)) return jsonOut({ instances: [] });
        warn("No instances configured. Run: kuma login <url>");
        return;
      }

      if (isJsonMode(opts)) {
        const data = names.map((name) => ({
          name,
          url: all[name].url,
          active: active?.type === "instance" && active.name === name,
          token: all[name].token.slice(0, 4) + "..." + all[name].token.slice(-4),
        }));
        return jsonOut({ instances: data });
      }

      const table = createTable(["", "Name", "URL", "Token"]);
      for (const name of names) {
        const isActive = active?.type === "instance" && active.name === name;
        table.push([
          isActive ? "\u2192" : "",
          name,
          all[name].url,
          all[name].token.slice(0, 4) + "..." + all[name].token.slice(-4),
        ]);
      }
      console.log(table.toString());
    });

  instances
    .command("remove <name>")
    .description("Remove a configured instance")
    .option("--force", "Skip confirmation")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { force?: boolean; json?: boolean }) => {
      const clusterName = getInstanceCluster(name);
      if (clusterName) {
        const msg = `Instance '${name}' belongs to cluster '${clusterName}'. Remove it from the cluster first.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      if (!opts.force && !isJsonMode(opts)) {
        const enquirer = await import("enquirer");
        const { prompt } = enquirer.default as any;
        const { confirm } = (await prompt({
          type: "confirm",
          name: "confirm",
          message: `Remove instance '${name}'?`,
          initial: false,
        })) as { confirm: boolean };
        if (!confirm) return;
      }

      const removed = removeInstanceConfig(name);
      if (!removed) {
        const msg = `Instance '${name}' not found.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      if (isJsonMode(opts)) return jsonOut({ removed: name });
      success(`Removed instance '${name}'`);
    });
}
