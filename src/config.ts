/**
 * Configuration helpers for local Nyora helper discovery.
 *
 * Defines the environment-variable names the SDK honors and resolves the
 * platform-specific path of the helper port file, so a running Nyora app (or an
 * embedded {@link NyoraServer}) can be discovered without explicit
 * configuration.
 *
 * Environment variables:
 * - `NYORA_BASE_URL` — explicit helper base URL, overriding port-file discovery.
 * - `NYORA_HELPER_PORT_FILE` — override path for the helper port file.
 *
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import envPaths from "env-paths";

/** Env var holding an explicit helper base URL. */
export const BASE_URL_ENV = "NYORA_BASE_URL";
/** Env var overriding the helper port-file path. */
export const HELPER_PORT_FILE_ENV = "NYORA_HELPER_PORT_FILE";

/**
 * Return the path of the helper port file for this platform.
 *
 * Honors `NYORA_HELPER_PORT_FILE` when set; otherwise uses the
 * platform-conventional application-data location (macOS Application Support,
 * Windows `%APPDATA%`, or the XDG config dir on Linux).
 *
 * @returns The resolved port-file path (which may not yet exist).
 */
export function defaultPortFile(): string {
  const configured = process.env[HELPER_PORT_FILE_ENV];
  if (configured) {
    return configured.startsWith("~")
      ? path.join(os.homedir(), configured.slice(1))
      : configured;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Nyora", "helper.port");
  }
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata, "Nyora", "helper.port");
  }
  return path.join(envPaths("nyora", { suffix: "" }).config, "helper.port");
}

/**
 * Derive a helper base URL from a port file, if present.
 *
 * @param portFile - Path to read. Defaults to {@link defaultPortFile}.
 * @returns `http://127.0.0.1:<port>` when the file exists and holds a port,
 *   else `null`.
 */
export function readBaseUrlFromPortFile(portFile?: string): string | null {
  const file = portFile ?? defaultPortFile();
  if (!fs.existsSync(file)) return null;
  const port = fs.readFileSync(file, "utf-8").trim();
  if (!port) return null;
  return `http://127.0.0.1:${port}`;
}
