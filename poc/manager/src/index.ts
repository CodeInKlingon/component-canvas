import { loadConfig } from "./config.js";
import { KlingClient } from "./kling/client.js";
import { ProjectStore } from "./store.js";
import { EventHub } from "./events.js";
import { SessionManager } from "./session/manager.js";
import { PreviewProxy } from "./preview/proxy.js";
import { createApiServer } from "./api/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const kling = new KlingClient({
    ...(config.klingUrl ? { baseUrl: config.klingUrl } : {}),
    ...(config.klingSock && !config.klingUrl ? { socketPath: config.klingSock } : {}),
  });

  const store = new ProjectStore(config.dataDir);
  await store.load();

  const hub = new EventHub();

  // Late-bound so the preview proxy and the session manager can reference each
  // other without a construction cycle.
  let sessions!: SessionManager;
  const preview = new PreviewProxy(config, {
    ensureAwake: (id) => sessions.ensureAwake(id).then(() => undefined),
    target: (id) => sessions.target(id),
    touch: (id) => sessions.touch(id),
  });
  sessions = new SessionManager(config, kling, store, hub, preview);

  const server = createApiServer({ config, store, hub, sessions, preview, kling });
  sessions.startSweeper();

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, () => {
      // eslint-disable-next-line no-console
      console.log(
        `kindling preview manager listening on http://${config.host}:${config.port} ` +
          `(kindling ${config.klingUrl ?? config.klingSock})`,
      );
      resolve();
    });
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down`);
    sessions.stopSweeper();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Probe the daemon once so misconfiguration is obvious at boot.
  try {
    const info = await kling.info();
    console.log(`kindling daemon ${info.version ?? "(unknown)"} · KVM ${info.kvm ? "yes" : "no"}`);
  } catch (error) {
    console.warn(
      `warning: kindling daemon not reachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
