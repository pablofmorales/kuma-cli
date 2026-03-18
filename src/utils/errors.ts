import { error } from "./output.js";

export function handleError(err: unknown, exitCode = 1): never {
  if (err instanceof Error) {
    error(err.message);
  } else {
    error(String(err));
  }
  process.exit(exitCode);
}

export function requireAuth(): never {
  error("Not authenticated. Run: kuma login <url>");
  process.exit(1);
}
