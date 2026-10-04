import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { URL } from "node:url";
import {
  KlingError,
  type KlingExecEvent,
  type KlingExecRequest,
  type KlingExecResult,
  type KlingInfo,
  type KlingMachine,
  type KlingRunRequest,
  type KlingVolume,
} from "./types.js";

type ResponseKind = "json" | "text" | "buffer" | "none";

interface KlingClientOptions {
  /** Unix socket path of the daemon (preferred). */
  socketPath?: string;
  /** TCP base URL, e.g. http://127.0.0.1:7749 (used when no socket). */
  baseUrl?: string;
}

function encodeQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * A small typed client for the kindling daemon. There is no official SDK; this
 * reproduces the surface documented in `docs/api.md`.
 */
export class KlingClient {
  private readonly socketPath?: string;
  private readonly host?: string;
  private readonly port?: number;

  constructor(options: KlingClientOptions) {
    if (options.baseUrl) {
      const url = new URL(options.baseUrl);
      this.host = url.hostname;
      this.port = Number.parseInt(url.port || "80", 10);
    }
    this.socketPath = options.socketPath;
    if (!this.socketPath && !this.host) {
      throw new Error("KlingClient needs either socketPath or baseUrl");
    }
  }

  private buildRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
  ): ClientRequest {
    const options: RequestOptions = this.socketPath
      ? { socketPath: this.socketPath, method, path, headers }
      : { host: this.host, port: this.port, method, path, headers };
    return httpRequest(options);
  }

  private encodeJson(body: unknown): { data: Buffer; headers: Record<string, string> } | undefined {
    if (body === undefined) return undefined;
    const data = Buffer.from(JSON.stringify(body));
    return {
      data,
      headers: { "content-type": "application/json", "content-length": String(data.byteLength) },
    };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    kind: ResponseKind = "json",
  ): Promise<T> {
    const encoded = this.encodeJson(body);
    const req = this.buildRequest(method, path, encoded?.headers ?? {});
    return new Promise<T>((resolve, reject) => {
      req.on("response", (resp: IncomingMessage) => {
        const chunks: Buffer[] = [];
        resp.on("data", (chunk: Buffer) => chunks.push(chunk));
        resp.on("end", () => {
          const payload = Buffer.concat(chunks);
          const status = resp.statusCode ?? 500;
          if (status >= 300) {
            let message = `${status} ${method} ${path}`;
            try {
              const parsed = JSON.parse(payload.toString("utf8")) as { message?: string };
              if (parsed.message) message = parsed.message;
            } catch {
              /* keep default message */
            }
            reject(new KlingError({ status, message, body: payload.toString("utf8") }));
            return;
          }
          if (kind === "none") return resolve(undefined as T);
          if (kind === "buffer") return resolve(payload as unknown as T);
          if (kind === "text") return resolve(payload.toString("utf8") as unknown as T);
          if (payload.length === 0) return resolve(undefined as T);
          resolve(JSON.parse(payload.toString("utf8")) as T);
        });
      });
      req.on("error", reject);
      if (encoded) req.write(encoded.data);
      req.end();
    });
  }

  // ── daemon ────────────────────────────────────────────────────────────────
  info(): Promise<KlingInfo> {
    return this.request<KlingInfo>("GET", "/info");
  }

  // ── machines ─────────────────────────────────────────────────────────────
  listMachines(): Promise<KlingMachine[]> {
    return this.request<KlingMachine[]>("GET", "/machines");
  }

  machine(ref: string): Promise<KlingMachine> {
    return this.request<KlingMachine>("GET", `/machines/${encodeURIComponent(ref)}`);
  }

  async machineOrNull(ref: string): Promise<KlingMachine | null> {
    try {
      return await this.machine(ref);
    } catch (error) {
      if (error instanceof KlingError && error.status === 404) return null;
      throw error;
    }
  }

  create(spec: KlingRunRequest): Promise<KlingMachine> {
    return this.request<KlingMachine>("POST", "/machines", spec);
  }

  thaw(ref: string): Promise<KlingMachine> {
    return this.request<KlingMachine>("POST", `/machines/${encodeURIComponent(ref)}/thaw`, {});
  }

  pause(ref: string): Promise<KlingMachine> {
    return this.request<KlingMachine>("POST", `/machines/${encodeURIComponent(ref)}/pause`, {});
  }

  freeze(ref: string): Promise<KlingMachine> {
    return this.request<KlingMachine>("POST", `/machines/${encodeURIComponent(ref)}/freeze`, {});
  }

  renew(ref: string, ttlSeconds: number): Promise<KlingMachine> {
    return this.request<KlingMachine>("POST", `/machines/${encodeURIComponent(ref)}/renew`, {
      ttl_seconds: ttlSeconds,
    });
  }

  remove(ref: string): Promise<void> {
    return this.request<void>("DELETE", `/machines/${encodeURIComponent(ref)}`, undefined, "none");
  }

  async exists(ref: string): Promise<boolean> {
    return (await this.machineOrNull(ref)) !== null;
  }

  // ── volumes ──────────────────────────────────────────────────────────────
  listVolumes(): Promise<KlingVolume[]> {
    return this.request<KlingVolume[]>("GET", "/volumes");
  }

  createVolume(name: string, sizeMib: number): Promise<KlingVolume> {
    return this.request<KlingVolume>("POST", "/volumes", { name, size_mib: sizeMib });
  }

  async ensureVolume(name: string, sizeMib: number): Promise<KlingVolume> {
    try {
      return await this.createVolume(name, sizeMib);
    } catch (error) {
      if (error instanceof KlingError && (error.status === 409 || error.status === 400)) {
        const volumes = await this.listVolumes();
        const existing = volumes.find((volume) => volume.name === name);
        if (existing) return existing;
      }
      throw error;
    }
  }

  deleteVolume(name: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/volumes/${encodeURIComponent(name)}`,
      undefined,
      "none",
    );
  }

  // ── exec / files ─────────────────────────────────────────────────────────
  exec(ref: string, spec: KlingExecRequest): Promise<KlingExecResult> {
    return this.request<KlingExecResult>(
      "POST",
      `/machines/${encodeURIComponent(ref)}/exec${encodeQuery({ wait: 1 })}`,
      spec,
    );
  }

  /** Streaming exec: yields NDJSON events as they are produced. */
  async *execStream(ref: string, spec: KlingExecRequest): AsyncGenerator<KlingExecEvent> {
    const encoded = this.encodeJson(spec)!;
    const req = this.buildRequest(
      "POST",
      `/machines/${encodeURIComponent(ref)}/exec`,
      encoded.headers,
    );

    const queue: KlingExecEvent[] = [];
    let finished = false;
    let failure: Error | undefined;
    let wake: (() => void) | null = null;
    const signal = () => {
      const current = wake;
      wake = null;
      current?.();
    };

    req.on("response", (resp: IncomingMessage) => {
      const status = resp.statusCode ?? 500;
      if (status >= 300) {
        const chunks: Buffer[] = [];
        resp.on("data", (chunk: Buffer) => chunks.push(chunk));
        resp.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          failure = new KlingError({ status, message: `exec failed: ${status}`, body: text });
          finished = true;
          signal();
        });
        return;
      }
      let buffer = "";
      resp.setEncoding("utf8");
      resp.on("data", (chunk: string) => {
        buffer += chunk;
        let index = buffer.indexOf("\n");
        while (index >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line) {
            try {
              queue.push(JSON.parse(line) as KlingExecEvent);
            } catch {
              /* ignore malformed line */
            }
          }
          index = buffer.indexOf("\n");
        }
        signal();
      });
      resp.on("end", () => {
        finished = true;
        signal();
      });
      resp.on("error", (error: Error) => {
        failure = error;
        finished = true;
        signal();
      });
    });
    req.on("error", (error: Error) => {
      failure = error;
      finished = true;
      signal();
    });
    req.write(encoded.data);
    req.end();

    try {
      while (!finished || queue.length > 0) {
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }
        if (finished) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      req.destroy();
    }
    if (failure) throw failure;
  }

  writeFile(
    ref: string,
    path: string,
    content: Buffer | string,
    options: { mode?: string; mkdir?: boolean } = {},
  ): Promise<void> {
    const data = typeof content === "string" ? Buffer.from(content) : content;
    const req = this.buildRequest(
      "PUT",
      `/machines/${encodeURIComponent(ref)}/files${encodeQuery({
        path,
        mode: options.mode,
        mkdir: options.mkdir ? 1 : undefined,
      })}`,
      { "content-length": String(data.byteLength) },
    );
    return new Promise<void>((resolve, reject) => {
      req.on("response", (resp: IncomingMessage) => {
        const chunks: Buffer[] = [];
        resp.on("data", (chunk: Buffer) => chunks.push(chunk));
        resp.on("end", () => {
          const status = resp.statusCode ?? 500;
          if (status >= 300) {
            reject(
              new KlingError({
                status,
                message: `writeFile ${path} failed: ${status}`,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
            return;
          }
          resolve();
        });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  readFile(ref: string, path: string): Promise<Buffer> {
    return this.request<Buffer>(
      "GET",
      `/machines/${encodeURIComponent(ref)}/files${encodeQuery({ path })}`,
      undefined,
      "buffer",
    );
  }

  statFile(
    ref: string,
    path: string,
  ): Promise<{ path: string; size: number; mode: number; is_dir: boolean; mod_time: string }> {
    return this.request(
      "GET",
      `/machines/${encodeURIComponent(ref)}/files${encodeQuery({ path, stat: 1 })}`,
    );
  }

  // ── readiness / snapshots ────────────────────────────────────────────────
  ready(ref: string, waitSeconds?: number): Promise<{ ready: string; guest?: string }> {
    return this.request(
      "GET",
      `/machines/${encodeURIComponent(ref)}/ready${encodeQuery({ wait: waitSeconds })}`,
    );
  }

  /**
   * Guest HTTP proxy. Only useful for one-shot requests/probes from outside the
   * daemon's network namespace — the manager dials guests directly for live
   * traffic. `probe_only` waits for the port to open.
   */
  guest(
    ref: string,
    spec: {
      port: number;
      path?: string;
      method?: string;
      body?: string;
      headers?: Record<string, string>;
      response_headers?: string[];
      wait_ms?: number;
      probe_only?: boolean;
    },
  ): Promise<{ status: number; body?: string; headers?: Record<string, string> }> {
    return this.request("POST", `/machines/${encodeURIComponent(ref)}/guest`, spec);
  }

  /** Resolve a guest address for direct dialling (honours macOS forwards). */
  static address(machine: KlingMachine, port: number): { host: string; port: number } {
    const forward = machine.forwards?.[String(port)];
    if (forward) {
      const [host = "127.0.0.1", forwardPort = String(port)] = forward.split(":");
      return { host, port: Number.parseInt(forwardPort, 10) };
    }
    if (!machine.ip) throw new Error(`machine ${machine.id} has no ip`);
    return { host: machine.ip, port };
  }
}
