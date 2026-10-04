import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import httpProxy from "http-proxy";
import type { ManagerConfig } from "../config.js";
import type { PreviewProvider } from "../session/manager.js";

// `http-proxy` is CommonJS; a default import is the interoperable form from ESM.
const { createProxyServer } = httpProxy;

export interface PreviewProxyDeps {
  /** Wake the project's machine (thaw if frozen) and renew its lease. */
  ensureAwake(projectId: string): Promise<void>;
  /** Resolve the current guest dev-server address. */
  target(projectId: string): Promise<{ host: string; port: number }>;
  /** Record preview activity for the idle policy. */
  touch(projectId: string): void;
}

interface PreviewEntry {
  port: number;
  server: ReturnType<typeof createHttpServer>;
  proxy: ReturnType<typeof createProxyServer>;
}

/**
 * One loopback HTTP server per project, forwarding HTTP and WebSocket (Vite
 * HMR) to the guest dev server. A dedicated origin root means Vite's HMR client
 * — which derives its endpoint from `location` — connects back through the same
 * proxy without base-path juggling.
 */
export class PreviewProxy implements PreviewProvider {
  private readonly entries = new Map<string, PreviewEntry>();

  constructor(
    private readonly config: ManagerConfig,
    private readonly deps: PreviewProxyDeps,
  ) {}

  async ensure(projectId: string): Promise<{ port: number; url: string }> {
    const existing = this.entries.get(projectId);
    if (existing) return { port: existing.port, url: this.url(existing.port) };

    const proxy = createProxyServer({ ws: true, xfwd: true, changeOrigin: true });
    proxy.on("error", (error, _req, res) => {
      const message = `Preview proxy error: ${error.message}`;
      if (res && "writeHead" in res && !("headersSent" in res && res.headersSent)) {
        (res as ServerResponse).writeHead(502, { "content-type": "text/plain" });
        (res as ServerResponse).end(message);
      }
    });

    const server = createHttpServer((req, res) => {
      void this.handleHttp(projectId, proxy, req, res);
    });
    server.on("upgrade", (req, socket, head) => {
      void this.handleUpgrade(projectId, proxy, req, socket as Duplex, head);
    });

    const port = await this.listen(server);
    this.entries.set(projectId, { port, server, proxy });
    return { port, url: this.url(port) };
  }

  private url(port: number): string {
    return `http://${this.config.previewHost}:${port}/`;
  }

  private async handleHttp(
    projectId: string,
    proxy: ReturnType<typeof createProxyServer>,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    req.pause();
    try {
      await this.deps.ensureAwake(projectId);
      const target = await this.deps.target(projectId);
      this.deps.touch(projectId);
      req.resume();
      proxy.web(req, res, { target: `http://${target.host}:${target.port}` });
    } catch (error) {
      this.reject(res, error);
    }
  }

  private async handleUpgrade(
    projectId: string,
    proxy: ReturnType<typeof createProxyServer>,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    try {
      await this.deps.ensureAwake(projectId);
      const target = await this.deps.target(projectId);
      this.deps.touch(projectId);
      proxy.ws(req, socket, head, { target: `http://${target.host}:${target.port}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      socket.end(`HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n${message}`);
    }
  }

  private reject(res: ServerResponse, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      res.writeHead(503, { "content-type": "text/plain" });
    }
    res.end(`Preview unavailable: ${message}`);
  }

  private listen(server: ReturnType<typeof createHttpServer>): Promise<number> {
    const { previewBindHost, previewPortBase, previewPortMax } = this.config;
    return new Promise<number>((resolve, reject) => {
      let candidate = previewPortBase;
      const attempt = () => {
        if (candidate > previewPortMax) {
          reject(new Error(`no free preview port in [${previewPortBase}, ${previewPortMax}]`));
          return;
        }
        const port = candidate++;
        const onError = (error: NodeJS.ErrnoException) => {
          server.removeListener("listening", onListening);
          if (error.code === "EADDRINUSE") {
            attempt();
            return;
          }
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve(port);
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, previewBindHost);
      };
      attempt();
    });
  }

  async dispose(projectId: string): Promise<void> {
    const entry = this.entries.get(projectId);
    if (!entry) return;
    this.entries.delete(projectId);
    entry.proxy.close?.();
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
  }
}
