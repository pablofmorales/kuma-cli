import { Command } from "commander";
import {
  getInstanceConfig,
  getClusterConfig,
  setActiveContext,
  getAllInstances,
  getAllClusters,
} from "../config.js";
import { success, error, isJsonMode, jsonOut, jsonError } from "../utils/output.js";

export function useCommand(program: Command): void {
  program
    .command("use [name]")
    .description("Set the active instance or cluster context")
    .option("--cluster <name>", "Set active cluster instead of instance")
    .option("--json", "Output as JSON")
    .action((name: string | undefined, opts: { cluster?: string; json?: boolean }) => {
      if (opts.cluster) {
        const cluster = getClusterConfig(opts.cluster);
        if (!cluster) {
          const all = Object.keys(getAllClusters());
          const msg = all.length
            ? `Cluster '${opts.cluster}' not found. Available: ${all.join(", ")}`
            : `Cluster '${opts.cluster}' not found. No clusters configured.`;
          if (isJsonMode(opts)) return jsonError(msg);
          error(msg);
          process.exit(1);
        }
        setActiveContext({ type: "cluster", name: opts.cluster });
        if (isJsonMode(opts)) return jsonOut({ active: { type: "cluster", name: opts.cluster, primary: cluster.primary } });
        success(`Active context: cluster '${opts.cluster}' (primary: ${cluster.primary})`);
        return;
      }

      if (!name) {
        const msg = "Specify an instance name. Run: kuma instances list";
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      const inst = getInstanceConfig(name);
      if (!inst) {
        const all = Object.keys(getAllInstances());
        const msg = all.length
          ? `Instance '${name}' not found. Available: ${all.join(", ")}`
          : `Instance '${name}' not found. No instances configured.`;
        if (isJsonMode(opts)) return jsonError(msg);
        error(msg);
        process.exit(1);
      }

      setActiveContext({ type: "instance", name });
      if (isJsonMode(opts)) return jsonOut({ active: { type: "instance", name } });
      success(`Active instance: '${name}' (${inst.url})`);
    });
}
