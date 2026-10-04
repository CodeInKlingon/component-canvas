/**
 * Types for the kindling daemon HTTP API (v0.17), transcribed from
 * `docs/api.md`. Only the fields this PoC uses are modelled; unknown fields
 * from the daemon are ignored at runtime and kept loose here on purpose.
 */

export interface KlingInfo {
  version?: string;
  root?: string;
  kvm?: boolean;
  backend?: string;
  arch?: string;
  capabilities?: string[];
  machines?: number;
  [key: string]: unknown;
}

export type KlingState =
  | "running"
  | "paused"
  | "warm"
  | "frozen"
  | "stopped"
  | "failed"
  | "starting"
  | string;

export interface KlingMachine {
  id: string;
  name?: string;
  state: KlingState;
  image?: string;
  from?: string;
  ip?: string;
  vcpus?: number;
  mem_mib?: number;
  cpu_pct?: number;
  egress?: string;
  labels?: Record<string, string>;
  ready?: string;
  mem_shared?: boolean;
  /** macOS only: guest port -> "127.0.0.1:port" loopback forwards. */
  forwards?: Record<string, string>;
  [key: string]: unknown;
}

export interface KlingVolume {
  name: string;
  size_mib?: number;
  [key: string]: unknown;
}

export interface KlingVolumeMount {
  name: string;
  mount: string;
}

export interface KlingRunRequest {
  /** Boot from an image (cold) or a golden snapshot (warm, shared memory). */
  image?: string;
  from?: string;
  name?: string;
  vcpus?: number;
  mem_mib?: number;
  mem_max_mib?: number;
  cpu_pct?: number;
  egress?: "none" | "internet" | "allowlist";
  allow_domains?: string[];
  volumes?: KlingVolumeMount[];
  shares?: unknown[];
  labels?: Record<string, string>;
  allow_exec?: boolean;
  on_ttl?: "freeze" | "remove";
  ttl_seconds?: number;
  wait_ready?: boolean;
  [key: string]: unknown;
}

export interface KlingExecRequest {
  cmd: string[];
  dir?: string;
  env?: string[];
  stdin?: string;
  timeout_seconds?: number;
  max_output_bytes?: number;
}

/** Result of `POST /machines/{ref}/exec?wait=1`. stdout/stderr are base64. */
export interface KlingExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms?: number;
  truncated?: boolean;
  timed_out?: boolean;
}

/** One NDJSON event from a streaming exec. */
export type KlingExecEvent =
  | { stream: "stdout" | "stderr"; data: string }
  | { exit: number; duration_ms?: number; truncated?: boolean; timed_out?: boolean }
  | { error: string };

export interface KlingStatusErrorInit {
  status: number;
  message: string;
  body?: string;
}

export class KlingError extends Error {
  readonly status: number;
  readonly body?: string;

  constructor({ status, message, body }: KlingStatusErrorInit) {
    super(message);
    this.name = "KlingError";
    this.status = status;
    this.body = body;
  }
}
