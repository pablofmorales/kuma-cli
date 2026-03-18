import { Command } from "commander";
import chalk from "chalk";
import { createAuthenticatedClient } from "../client.js";
import { getConfig } from "../config.js";
import { createTable, isJsonMode, jsonOut } from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";

export function statusPagesCommand(program: Command): void {
  const sp = program
    .command("status-pages")
    .description("Manage status pages");

  sp.command("list")
    .description("List all status pages")
    .option("--json", "Output as JSON ({ ok, data })")
    .action(async (opts: { json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth(opts);

      const json = isJsonMode(opts);

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        const pages = await client.getStatusPageList();
        client.disconnect();

        const list = Object.values(pages);

        if (json) {
          jsonOut(list);
        }

        if (list.length === 0) {
          console.log("No status pages found.");
          return;
        }

        const table = createTable(["ID", "Title", "Slug", "Published", "URL"]);

        list.forEach((page) => {
          const url = `${config!.url}/status/${page.slug}`;
          table.push([
            String(page.id),
            page.title,
            page.slug,
            page.published ? chalk.green("Yes") : chalk.gray("No"),
            url,
          ]);
        });

        console.log(table.toString());
      } catch (err) {
        handleError(err, opts);
      }
    });
}
