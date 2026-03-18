import { Command } from "commander";
import { clearConfig, getConfig } from "../config.js";
import { success, warn } from "../utils/output.js";

export function logoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Clear saved session credentials")
    .action(() => {
      const config = getConfig();
      if (!config) {
        warn("Not currently logged in.");
        return;
      }
      clearConfig();
      success("Logged out. Run `kuma login <url>` to authenticate again.");
    });
}
