import { error, isJsonMode, jsonError } from "./output.js";

/**
 * Exit codes:
 *   0  Success
 *   1  General error
 *   2  Connection error
 *   3  Not found
 *   4  Auth error
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL: 1,
  CONNECTION: 2,
  NOT_FOUND: 3,
  AUTH: 4,
} as const;

/**
 * Determine a meaningful exit code from an error object.
 * Looks at the message for known patterns; defaults to GENERAL (1).
 */
function exitCodeFor(err: unknown): number {
  if (!(err instanceof Error)) return EXIT_CODES.GENERAL;
  const msg = err.message.toLowerCase();
  if (msg.includes("connection") || msg.includes("timeout") || msg.includes("refused")) {
    return EXIT_CODES.CONNECTION;
  }
  if (msg.includes("not found") || msg.includes("not exist")) {
    return EXIT_CODES.NOT_FOUND;
  }
  if (msg.includes("auth") || msg.includes("session expired") || msg.includes("login")) {
    return EXIT_CODES.AUTH;
  }
  return EXIT_CODES.GENERAL;
}

/**
 * Central error handler. When JSON mode is active, outputs structured JSON to
 * stdout (so pipes work). Otherwise prints a human-readable message to stderr.
 */
export function handleError(err: unknown, opts?: { json?: boolean }): never {
  const message = err instanceof Error ? err.message : String(err);
  const code = exitCodeFor(err);

  if (isJsonMode(opts)) {
    jsonError(message, code);
  }

  error(message);
  process.exit(code);
}

export function requireAuth(opts?: { json?: boolean }): never {
  const message = "Not authenticated. Run: kuma login <url>";
  if (isJsonMode(opts)) {
    jsonError(message, EXIT_CODES.AUTH);
  }
  error(message);
  process.exit(EXIT_CODES.AUTH);
}
