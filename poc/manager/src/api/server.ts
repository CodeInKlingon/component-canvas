import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ManagerConfig } from "../config.js";
import type { EventHub, ProjectEvent } from "../events.js";
import type { ProjectStore, Project } from "../store.js";
import type { SessionManager } from "../session/manager.js";
import type { PreviewProxy } from "../preview/proxy.js";
import { KlingClient } from "../kling/client.js";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...CORS_HEADERS });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface ApiDeps {
  config: ManagerConfig;
  store: ProjectStore;
  hub: EventHub;
  sessions: SessionManager;
  preview: PreviewProxy;
  kling: KlingClient;
}

/**
 * Control-plane HTTP API consumed by the Nuxt app. CORS is wide open because
 * this is a local PoC; a real deployment would authenticate and scope it.
 */
export function createApiServer(deps: ApiDeps): Server {
  const { config, store, hub, sessions, preview, kling } = deps;

  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) sendJson(res, 500, { error: message });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const segments = url.pathname.split("/").filter(Boolean);

    if (method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (method === "GET" && url.pathname === "/health") {
      let kindling: { ok: boolean; version?: string; error?: string } = { ok: false };
      try {
        const info = await kling.info();
        kindling = { ok: true, version: info.version };
      } catch (error) {
        kindling = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      sendJson(res, 200, { ok: true, manager: { version: config.version }, kindling });
      return;
    }

    if (segments[0] !== "api" || segments[1] !== "projects") {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    // /api/projects
    if (segments.length === 2) {
      if (method === "GET") {
        sendJson(res, 200, { projects: store.list() });
        return;
      }
      if (method === "POST") {
        const body = await readJson(req);
        const name = typeof body.name === "string" ? body.name : undefined;
        const project = await store.create(name);
        void sessions.provision(project.id);
        sendJson(res, 201, { project });
        return;
      }
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }

    const id = segments[2]!;
    const project = store.get(id);
    const action = segments[3];

    if (!project) {
      sendJson(res, 404, { error: `project ${id} not found` });
      return;
    }

    if (!action && method === "GET") {
      sendJson(res, 200, { project });
      return;
    }

    if (!action && method === "DELETE") {
      await sessions.remove(id);
      await preview.dispose(id);
      await store.remove(id);
      sendJson(res, 200, { ok: true });
      return;
    }

    switch (`${method} ${action ?? ""}`) {
      case "GET logs":
        sendJson(res, 200, { lines: hub.lines(id) });
        return;

      case "GET events":
        subscribe(id, res);
        return;

      case "GET preview": {
        try {
          const ensured = await preview.ensure(id);
          const updated = store.touch(id, { previewPort: ensured.port, previewUrl: ensured.url });
          sendJson(res, 200, { url: ensured.url, project: updated });
        } catch (error) {
          sendJson(res, 503, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      case "POST start": {
        if (project.status === "new" || project.status === "error") {
          void sessions.provision(id);
          sendJson(res, 202, { project: store.get(id) });
          return;
        }
        try {
          await sessions.ensureAwake(id);
          const ensured = await preview.ensure(id);
          const updated = store.touch(id, {
            status: "ready",
            previewPort: ensured.port,
            previewUrl: ensured.url,
            error: null,
          });
          hub.status(updated);
          hub.done(updated);
          sendJson(res, 200, { project: updated });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const updated = store.touch(id, { status: "error", error: message });
          hub.status(updated);
          sendJson(res, 500, { error: message, project: updated });
        }
        return;
      }

      case "POST stop":
        await sessions.stop(id);
        sendJson(res, 200, { project: store.get(id) });
        return;

      default:
        sendJson(res, 404, { error: "not found" });
    }
  }

  function subscribe(projectId: string, res: ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      ...CORS_HEADERS,
    });
    res.flushHeaders?.();

    const write = (event: ProjectEvent) => {
      switch (event.type) {
        case "status":
          res.write(`event: status\ndata: ${JSON.stringify({ project: event.project })}\n\n`);
          break;
        case "log":
          res.write(`event: log\ndata: ${JSON.stringify({ line: event.line })}\n\n`);
          break;
        case "error":
          res.write(`event: error\ndata: ${JSON.stringify({ message: event.message })}\n\n`);
          break;
        case "done":
          res.write(`event: done\ndata: ${JSON.stringify({ project: event.project })}\n\n`);
          break;
      }
    };

    // Replay current state so a late subscriber is not blind.
    const project: Project | undefined = store.get(projectId);
    if (project) write({ type: "status", project });
    for (const line of hub.lines(projectId)) write({ type: "log", line });

    const keepAlive = setInterval(() => {
      res.write(": ping\n\n");
    }, 15_000);

    const cleanup = () => {
      clearInterval(keepAlive);
      unsubscribe();
    };

    const unsubscribe = hub.subscribe(projectId, (event) => {
      write(event);
      if (event.type === "done") {
        cleanup();
        res.end();
      }
    });

    res.on("close", cleanup);
  }

  return server;
}
