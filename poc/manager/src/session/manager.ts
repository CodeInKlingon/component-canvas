import { connect } from "node:net";
import { KlingClient } from "../kling/client.js";
import { KlingError, type KlingExecEvent, type KlingMachine } from "../kling/types.js";
import type { ManagerConfig } from "../config.js";
import type { EventHub } from "../events.js";
import type { ProjectStore } from "../store.js";
import { SAMPLE_FILES, sampleGuestPath } from "../sample/files.js";

const RENEW_INTERVAL_MS = 30_000;

/** The preview proxy, injected to avoid a circular dependency. */
export interface PreviewProvider {
  ensure(projectId: string): Promise<{ port: number; url: string }>;
}

/**
 * Owns the lifecycle of one microVM per project: provisioning (seed, install,
 * run dev), wake-on-request, idle pausing and teardown. It is the only module
 * allowed to mutate project status.
 */
export class SessionManager {
  private readonly activity = new Map<string, number>();
  private readonly lastRenew = new Map<string, number>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly leases = new Map<string, NodeJS.Timeout>();
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly config: ManagerConfig,
    private readonly kling: KlingClient,
    private readonly store: ProjectStore,
    private readonly hub: EventHub,
    private readonly preview: PreviewProvider,
  ) {}

  machineName(projectId: string): string {
    return `preview-${projectId}`;
  }

  private srcVolume(projectId: string): string {
    return `src-${projectId}`;
  }

  private depsVolume(projectId: string): string {
    return `deps-${projectId}`;
  }

  /** Serialise lifecycle operations per project. */
  private withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(projectId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    this.locks.set(
      projectId,
      next.catch(() => undefined),
    );
    return next;
  }

  private log(
    projectId: string,
    stream: "stdout" | "stderr" | "system",
    text: string,
  ): void {
    for (const line of text.replace(/\r/g, "").split("\n")) {
      if (line === "") continue;
      this.hub.log(projectId, { ts: new Date().toISOString(), stream, text: line });
    }
  }

  private setStatus(
    projectId: string,
    status: Parameters<ProjectStore["update"]>[1]["status"],
    patch: Record<string, unknown> = {},
  ): void {
    const project = this.store.touch(projectId, { status, ...patch });
    this.hub.status(project);
  }

  private fail(projectId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.log(projectId, "stderr", `✗ ${message}`);
    const project = this.store.touch(projectId, { status: "error", error: message });
    this.hub.status(project);
    this.hub.error(projectId, message);
    this.hub.done(project);
  }

  // ── provisioning ──────────────────────────────────────────────────────────

  async provision(projectId: string): Promise<void> {
    await this.withLock(projectId, async () => {
      // Long steps (npm install) can exceed the microVM TTL; keep renewing so
      // the daemon doesn't freeze the machine out from under the exec stream.
      this.startLease(projectId);
      try {
        this.setStatus(projectId, "provisioning", { error: null });
        this.log(projectId, "system", `Provisioning project ${projectId}`);

        const machine = await this.ensureMachine(projectId);
        await this.wake(projectId);
        this.log(projectId, "system", `Machine ${machine.id} is running (${machine.ip})`);

        await this.runStep(projectId, ["sh", "-c", "mkdir -p /src && ln -sfn /node_modules /src/node_modules"], {
          label: "Linking dependency volume",
        });

        await this.seedFiles(projectId);
        await this.installDependencies(projectId);
        await this.startDevServer(projectId);

        await this.waitForGuestPort(projectId, 90_000);

        const preview = await this.preview.ensure(projectId);
        this.setStatus(projectId, "ready", {
          machine: machine.id,
          previewPort: preview.port,
          previewUrl: preview.url,
          error: null,
        });
        this.activity.set(projectId, Date.now());
        this.log(projectId, "system", "✓ Preview is ready");
        this.hub.done(this.store.get(projectId)!);
      } catch (error) {
        this.fail(projectId, error);
      } finally {
        this.stopLease(projectId);
      }
    });
  }

  /** Renew the machine's TTL on a timer while an operation is in flight. */
  private startLease(projectId: string): void {
    if (this.leases.has(projectId)) return;
    const ref = this.machineName(projectId);
    const tick = () => {
      void this.kling.renew(ref, this.config.ttlSeconds).catch(() => undefined);
    };
    tick();
    this.leases.set(projectId, setInterval(tick, 60_000));
  }

  private stopLease(projectId: string): void {
    const timer = this.leases.get(projectId);
    if (timer) clearInterval(timer);
    this.leases.delete(projectId);
  }

  private async runStep(
    projectId: string,
    cmd: string[],
    options: { label: string; dir?: string; timeoutSeconds?: number },
  ): Promise<void> {
    const ref = this.machineName(projectId);
    this.log(projectId, "system", `$ ${cmd.join(" ")}`);
    let exitCode = 0;
    const stream = this.kling.execStream(ref, {
      cmd,
      ...(options.dir ? { dir: options.dir } : {}),
      timeout_seconds: options.timeoutSeconds ?? 600,
    });
    for await (const event of stream) {
      const code = this.handleExecEvent(projectId, event);
      if (code !== undefined) exitCode = code;
    }
    if (exitCode !== 0) {
      throw new Error(`${options.label} failed with exit code ${exitCode}`);
    }
  }

  private handleExecEvent(projectId: string, event: KlingExecEvent): number | undefined {
    if ("stream" in event) {
      const text = Buffer.from(event.data, "base64").toString("utf8");
      this.log(projectId, event.stream, text);
      return undefined;
    }
    if ("exit" in event) {
      if (event.timed_out) this.log(projectId, "stderr", "Command timed out");
      return event.exit;
    }
    if ("error" in event) throw new Error(event.error);
    return undefined;
  }

  private async ensureMachine(projectId: string): Promise<KlingMachine> {
    const ref = this.machineName(projectId);
    const existing = await this.kling.machineOrNull(ref);
    if (existing) return existing;

    this.log(projectId, "system", "Creating per-user volumes");
    await this.kling.ensureVolume(this.srcVolume(projectId), 512);
    await this.kling.ensureVolume(this.depsVolume(projectId), 2048);

    this.log(projectId, "system", `Creating microVM from image "${this.config.klingImage}"`);
    const machine = await this.kling.create({
      image: this.config.klingImage,
      name: ref,
      vcpus: this.config.vcpus,
      mem_mib: this.config.memMib,
      mem_max_mib: this.config.memMaxMib,
      cpu_pct: 100,
      egress: this.config.egress,
      ...(this.config.egress === "allowlist"
        ? { allow_domains: this.config.allowDomains }
        : {}),
      volumes: [
        { name: this.srcVolume(projectId), mount: "/src" },
        { name: this.depsVolume(projectId), mount: "/node_modules" },
      ],
      labels: {
        "app.kling/preview": projectId,
        "kling.ports": String(this.config.guestPort),      },
      allow_exec: true,
      on_ttl: "freeze",
      ttl_seconds: this.config.ttlSeconds,
    });
    this.log(projectId, "system", `MicroVM ${machine.id} booted`);
    return machine;
  }

  private async seedFiles(projectId: string): Promise<void> {
    const ref = this.machineName(projectId);
    this.log(projectId, "system", `Seeding ${Object.keys(SAMPLE_FILES).length} project files into /src`);
    for (const [path, content] of Object.entries(SAMPLE_FILES)) {
      await this.kling.writeFile(ref, sampleGuestPath(path), content, {
        mode: "0644",
        mkdir: true,
      });
    }
  }

  private async installDependencies(projectId: string): Promise<void> {
    const ref = this.machineName(projectId);
    // A successful stat means the file exists; a 404 rejects.
    const installed = await this.kling
      .statFile(ref, "/src/node_modules/.bin/vite")
      .then((stat) => !stat.is_dir)
      .catch(() => false);
    if (installed) {
      this.log(projectId, "system", "Dependencies already installed; skipping npm install");
      return;
    }
    this.setStatus(projectId, "installing");
    this.log(projectId, "system", "Installing dependencies (npm install)");
    await this.runStep(
      projectId,
      ["npm", "install", "--no-audit", "--no-fund"],
      { label: "npm install", dir: "/src", timeoutSeconds: 900 },
    );
  }

  private async startDevServer(projectId: string): Promise<void> {
    const ref = this.machineName(projectId);
    if (await this.isGuestPortOpen(projectId)) {
      this.log(projectId, "system", "Dev server already answering");
      return;
    }
    this.setStatus(projectId, "starting");
    this.log(projectId, "system", `Starting Vite dev server on :${this.config.guestPort}`);
    // `setsid` detaches the dev server from the exec process group so closing
    // the exec connection does not tear it down. A non-8080 port is required:
    // kindling's guest agent itself listens on :8080.
    await this.runStep(
      projectId,
      [
        "sh",
        "-c",
        `cd /src && setsid ./node_modules/.bin/vite --host 0.0.0.0 --port ${this.config.guestPort} --strictPort ` +
          ">/var/log/vite.log 2>&1 </dev/null & echo started",
      ],
      { label: "start vite", timeoutSeconds: 60 },
    );
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /** Ensure the machine is running (thaw if needed) and renew its lease. */
  async ensureAwake(projectId: string): Promise<KlingMachine> {
    return this.withLock(projectId, async () => {
      const machine = await this.wake(projectId);
      const project = this.store.get(projectId);
      if (project?.status === "stopped") {
        const updated = this.store.touch(projectId, { status: "ready", error: null });
        this.hub.status(updated);
      }
      return machine;
    });
  }

  /** Unlocked wake; callers that already hold the project lock use this. */
  private async wake(projectId: string): Promise<KlingMachine> {
    const ref = this.machineName(projectId);
    let machine = await this.kling.machineOrNull(ref);
    if (!machine) throw new Error(`machine ${ref} does not exist`);

    if (machine.state !== "running") {
      this.log(projectId, "system", `Waking machine (${machine.state} → running)`);
      try {
        machine = await this.kling.thaw(ref);
      } catch (error) {
        if (error instanceof KlingError) {
          throw new Error(`could not wake machine: ${error.message}`);
        }
        throw error;
      }
    }
    await this.renew(projectId);
    this.activity.set(projectId, Date.now());
    return machine;
  }

  private async renew(projectId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastRenew.get(projectId) ?? 0;
    if (now - last < RENEW_INTERVAL_MS) return;
    try {
      await this.kling.renew(this.machineName(projectId), this.config.ttlSeconds);
      this.lastRenew.set(projectId, now);
    } catch {
      /* machine has no TTL or vanished; ignore */
    }
  }

  async stop(projectId: string): Promise<void> {
    await this.withLock(projectId, async () => {
      this.stopLease(projectId);
      const ref = this.machineName(projectId);
      const machine = await this.kling.machineOrNull(ref);
      if (!machine) {
        this.setStatus(projectId, "stopped");
        return;
      }
      if (machine.state === "running") {
        try {
          await this.kling.pause(ref);
          this.log(projectId, "system", "Machine paused");
        } catch {
          await this.kling.freeze(ref);
          this.log(projectId, "system", "Machine frozen");
        }
      }
      this.setStatus(projectId, "stopped");
      this.hub.done(this.store.get(projectId)!);
    });
  }

  async remove(projectId: string): Promise<void> {
    await this.withLock(projectId, async () => {
      this.stopLease(projectId);
      const ref = this.machineName(projectId);
      // Best effort: the machine may already be gone, which should not block
      // removing the project record and its volumes.
      try {
        await this.kling.remove(ref);
      } catch {
        /* already gone */
      }
      for (const volume of [this.srcVolume(projectId), this.depsVolume(projectId)]) {
        try {
          await this.kling.deleteVolume(volume);
        } catch {
          /* volume may still be attached, or already gone */
        }
      }
      this.activity.delete(projectId);
      this.lastRenew.delete(projectId);
      this.hub.clear(projectId);
    });
  }

  touch(projectId: string): void {
    this.activity.set(projectId, Date.now());
    void this.renew(projectId);
  }

  /** Start the idle sweeper that pauses running machines after inactivity. */
  startSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      void this.sweep();
    }, 10_000);
  }

  stopSweeper(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = undefined;
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const project of this.store.list()) {
      if (project.status !== "ready") continue;
      const last = this.activity.get(project.id) ?? 0;
      if (now - last < this.config.pauseAfterMs) continue;
      const ref = this.machineName(project.id);
      try {
        const machine = await this.kling.machineOrNull(ref);
        if (machine?.state === "running") {
          await this.kling.pause(ref);
          this.log(project.id, "system", "Idle: paused machine");
        }
      } catch {
        /* best effort */
      }
    }
  }

  // ── preview target / readiness ────────────────────────────────────────────

  async target(projectId: string): Promise<{ host: string; port: number }> {
    const machine = await this.kling.machine(this.machineName(projectId));
    return KlingClient.address(machine, this.config.guestPort);
  }

  private isGuestPortOpen(projectId: string): Promise<boolean> {
    return this.target(projectId)
      .then(({ host, port }) => probePort(host, port, 800))
      .catch(() => false);
  }

  private async waitForGuestPort(projectId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isGuestPortOpen(projectId)) return;
      await delay(500);
    }
    throw new Error(`dev server did not answer on :${this.config.guestPort} within ${timeoutMs}ms`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}
