import { Command } from "commander";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { isJsonMode, jsonOut, jsonError } from "../utils/output.js";
import chalk from "chalk";

/**
 * Read the version from package.json at build time.
 * Works in both ESM (via import) and CJS bundles (via fs.readFileSync).
 * We walk up from __dirname until we find a package.json with a "version".
 */
function readCurrentVersion(): string {
  // tsup bundles to dist/index.js; package.json is one level up
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // fallback: try same dir
  }
  try {
    const pkgPath = join(__dirname, "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // ignore
  }
  return "unknown";
}


interface GithubRelease {
  tag_name: string;
  name: string;
  html_url: string;
}

/**
 * Fetch the latest published release from GitHub.
 * Returns null on network error (so the caller can handle gracefully).
 */
async function fetchLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/BlackAsteroid/kuma-cli/releases/latest",
      {
        headers: {
          "User-Agent": "kuma-cli-upgrade",
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as GithubRelease;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings (without leading 'v').
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff < 0) return -1;
    if (diff > 0) return 1;
  }
  return 0;
}

export function upgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description(
      "Update kuma-cli to the latest version from GitHub"
    )
    .option("--json", "Output as JSON ({ ok, data })")
    .addHelpText(
      "after",
      `
${chalk.dim("Examples:")}
  ${chalk.cyan("kuma upgrade")}              Check for updates and upgrade if available
  ${chalk.cyan("kuma upgrade --json")}       Machine-readable upgrade result
`
    )
    .action(async (opts: { json?: boolean }) => {
      const json = isJsonMode(opts);

      // --- Current version ---
      const current = readCurrentVersion();

      if (!json) {
        console.log(`Current version: ${chalk.cyan(`v${current}`)}`);
        process.stdout.write("Checking for latest release… ");
      }

      // --- Latest version ---
      const release = await fetchLatestRelease();

      if (!release) {
        if (!json) console.log(chalk.red("failed"));
        const msg =
          "Could not reach GitHub. Check your internet connection and try again.";
        if (json) jsonError(msg, 2);
        console.error(chalk.red(`\n❌ ${msg}`));
        process.exit(2);
      }

      const latest = release.tag_name.replace(/^v/, "");

      if (!json) console.log(chalk.green("done"));

      if (compareSemver(current, latest) >= 0) {
        // Already up to date
        if (json) {
          jsonOut({ current, latest, upgraded: false, reason: "Already up to date" });
        }
        console.log(
          `Latest version: ${chalk.cyan(`v${latest}`)}\n` +
            chalk.green("✅ Already up to date — nothing to do.")
        );
        return;
      }

      // --- Upgrade ---
      if (!json) {
        console.log(`Latest version:  ${chalk.cyan(`v${latest}`)}`);
        console.log(
          `\n${chalk.bold(`Upgrading kuma-cli`)} ${chalk.dim(`v${current}`)} → ${chalk.green(`v${latest}`)}…`
        );
      }

      try {
        execSync("npm install -g @blackasteroid/kuma-cli@latest", {
          stdio: json ? "pipe" : "inherit",
        });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);

        // Surface permission errors with a helpful hint
        const isPermission =
          raw.toLowerCase().includes("permission") ||
          raw.toLowerCase().includes("eacces") ||
          raw.toLowerCase().includes("eperm");

        if (json) {
          jsonError(
            isPermission
              ? "Permission denied. Try running with elevated permissions (sudo)."
              : `Upgrade failed: ${raw}`,
            isPermission ? 4 : 1
          );
        }

        if (isPermission) {
          console.error(
            chalk.red("\n❌ Permission denied.") +
              " Try running with elevated permissions:\n" +
              chalk.cyan("   sudo kuma upgrade")
          );
        } else {
          console.error(chalk.red(`\n❌ Upgrade failed: ${raw}`));
        }
        process.exit(isPermission ? 4 : 1);
      }

      if (json) {
        jsonOut({ current, latest, upgraded: true });
      }

      console.log(
        chalk.green(`\n✅ kuma-cli upgraded to v${latest} successfully!`)
      );
    });
}
