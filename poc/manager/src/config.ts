import { resolve } from "node:path";

/**
 * Runtime configuration for the manager, loaded from the environment.
 *
 * Kindling's daemon is Unix-socket only by design, so `KLING_SOCK` is the
 * default transport. `KLING_URL` exists for the containerised setup where a
 * small bridge (or a sidecar in the same network namespace) exposes the socket
 * over TCP. When both are set, `KLING_URL` wins.
 */
export interface ManagerConfig {
  /** Control-plane HTTP host. Use 0.0.0.0 inside a container. */
  host: string;
  /** Control-plane HTTP port. */
  port: number;
  /** Unix socket path of the kindling daemon. */
  klingSock?: string;
  /** TCP base URL of the kindling daemon, e.g. http://127.0.0.1:7749. */
  klingUrl?: string;
  /** Image (or golden snapshot name) every preview machine boots from. */
  klingImage: string;
  /** Host used to build preview origins (what the browser resolves). */
  previewHost: string;
  /** Address the per-project preview servers bind to. */
  previewBindHost: string;
  /** First port of the per-project preview proxy range. */
  previewPortBase: number;
  /** Last port of the per-project preview proxy range (inclusive). */
  previewPortMax: number;
  /** Port the guest dev server listens on. */
  guestPort: number;
  /** Directory for the durable project registry. */
  dataDir: string;
  /** Guest egress mode for preview machines: none | internet | allowlist. */
  egress: "none" | "internet" | "allowlist";
  /** Domains allowed when `egress` is `allowlist`. */
  allowDomains: string[];
  /** Mem (MiB) requested / ceiling for a preview machine. */
  memMib: number;
  memMaxMib: number;
  vcpus: number;
  /** TTL (seconds) before the daemon auto-freezes an idle machine. */
  ttlSeconds: number;
  /** Idle (ms) after which the manager pauses a running machine. */
  pauseAfterMs: number;
  /** Version reported by /health. */
  version: string;
}

function intFrom(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listFrom(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined || value.trim() === "") return fallback;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ManagerConfig {
  const previewPortBase = intFrom(env.PREVIEW_PORT_BASE, 7200);
  return {
    host: env.HOST ?? "127.0.0.1",
    port: intFrom(env.PORT, 7100),
    klingSock: env.KLING_SOCK ?? (env.KLING_URL ? undefined : "/run/kling.sock"),
    klingUrl: env.KLING_URL,
    klingImage: env.KLING_IMAGE ?? "toolchain",
    previewHost: env.PREVIEW_HOST ?? "127.0.0.1",
    previewBindHost: env.PREVIEW_BIND_HOST ?? "0.0.0.0",
    previewPortBase,
    previewPortMax: intFrom(env.PREVIEW_PORT_MAX, previewPortBase + 99),
    guestPort: intFrom(env.GUEST_PORT, 3000),
    dataDir: resolve(env.DATA_DIR ?? "data"),
    egress: (env.EGRESS as ManagerConfig["egress"]) ?? "allowlist",
    allowDomains: listFrom(env.ALLOW_DOMAINS, ["registry.npmjs.org", "registry.npmmirror.com"]),
    memMib: intFrom(env.MEM_MIB, 1024),
    memMaxMib: intFrom(env.MEM_MAX_MIB, 2048),
    vcpus: intFrom(env.VCPUS, 2),
    ttlSeconds: intFrom(env.TTL_SECONDS, 300),
    pauseAfterMs: intFrom(env.PAUSE_AFTER_MS, 30_000),
    version: env.MANAGER_VERSION ?? "0.1.0-poc",
  };
}
