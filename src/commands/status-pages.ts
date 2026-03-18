import { Command } from "commander";
import chalk from "chalk";
import { createAuthenticatedClient } from "../client.js";
import { getConfig } from "../config.js";
import { createTable } from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";

export function statusPagesCommand(program: Command): void {
  const sp = program
    .command("status-pages")
    .description("Manage status pages");

  sp.command("list")
    .description("List all status pages")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      const config = getConfig();
      if (!config) requireAuth();

      try {
        const client = await createAuthenticatedClient(
          config!.url,
          config!.token
        );
        const pages = await client.getStatusPageList();
        client.disconnect();

        const list = Object.values(pages);

        if (opts.json) {
          console.log(JSON.stringify(list, null, 2));
          return;
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
        handleError(err);
      }
    });
}
