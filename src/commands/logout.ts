import { Command } from "commander";
import { clearConfig, getConfig } from "../config.js";
import { success, warn, isJsonMode, jsonOut } from "../utils/output.js";

export function logoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Clear saved session credentials")
    .option("--json", "Output as JSON ({ ok, data })")
    .action((opts: { json?: boolean }) => {
      const json = isJsonMode(opts);
      const config = getConfig();

      if (!config) {
        if (json) {
          jsonOut({ loggedOut: false, reason: "Not currently logged in" });
        }
        warn("Not currently logged in.");
        return;
      }

      clearConfig();

      if (json) {
        jsonOut({ loggedOut: true });
      }

      success("Logged out. Run `kuma login <url>` to authenticate again.");
    });
}
