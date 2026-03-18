import { Command } from "commander";
import chalk from "chalk";
import { createAuthenticatedClient } from "../client.js";
import { getConfig } from "../config.js";
import { createTable, isJsonMode, jsonOut } from "../utils/output.js";
import { handleError, requireAuth } from "../utils/errors.js";

export function statusPagesCommand(program: Command): void {
  const sp = program
    .command("status-pages")
    .description("View and manage public-facing status pages")
    .addHelpText(
      "after",
      `
${chalk.dim("Subcommands:")}
  ${chalk.cyan("status-pages list")}   List all status pages with their slugs and publish state

${chalk.dim("Run")} ${chalk.cyan("kuma status-pages <subcommand> --help")} ${chalk.dim("for examples.")}
`
    );

  sp.command("list")
    .description("List all status pages with title, slug, and published state")
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma status-pages list")}
  ${chalk.cyan("kuma status-pages list --json")}
  ${chalk.cyan("kuma status-pages list --json | jq '.data[] | select(.published) | .slug'")}
`
    )
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
