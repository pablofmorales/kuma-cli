import { Command } from "commander";
import enquirer from "enquirer";
import { KumaClient } from "../client.js";
import { saveConfig } from "../config.js";
import { success, error } from "../utils/output.js";
import { handleError } from "../utils/errors.js";

const { prompt } = enquirer as any;

export function loginCommand(program: Command): void {
  program
    .command("login <url>")
    .description("Authenticate with Uptime Kuma and save session")
    .action(async (url: string) => {
      try {
        // Normalize URL
        const normalizedUrl = url.replace(/\/$/, "");

        const answers = await prompt([
          {
            type: "input",
            name: "username",
            message: "Username:",
          },
          {
            type: "password",
            name: "password",
            message: "Password:",
          },
        ]);

        const { username, password } = answers as {
          username: string;
          password: string;
        };

        const client = new KumaClient(normalizedUrl);
        await client.connect();

        const result = await client.login(username, password);
        client.disconnect();

        if (!result.ok || !result.token) {
          error(result.msg ?? "Login failed");
          process.exit(1);
        }

        saveConfig({ url: normalizedUrl, token: result.token });
        success(`Logged in as ${username} → ${normalizedUrl}`);
      } catch (err) {
        handleError(err);
      }
    });
}
