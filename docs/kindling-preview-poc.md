# PoC plan: kindling-backed dev-preview microVMs for vue-designer

> Companion to `docs/microvm-runtime-research.md`. Goal: prove that each user's Vite dev
> server can run in a Firecracker µVM (kindling daemon, Apache-2.0) with
> freeze-on-idle / sub-second resume, driven from TypeScript, and show up live
> in the designer's preview iframe.

For a 2–3 day effort. All API paths below are verbatim from kindling's
`docs/api.md` / `docs/exec-sandbox.md` (v0.17).

---

## 0. Why this shape (constraints discovered in the docs)

Three kindling facts drive the architecture:

1. **Restore from a golden snapshot is the fast path** — `kling run -from S`
   lands in 0.13–0.32 s and forks share the golden's RAM (`mem_shared`, +68 MiB
   for 10 instances). This is how each user's box "boots with Vite already
   serving."
2. **But shares don't co-exist with `from`** — folders shared from the host
   (`shares`) are requested at cold boot only; `POST /machines` with `from`
   returns `400` for shares. So "boot user VM from warm template" and "mount
   live host directory" are mutually exclusive.
3. **Guests cannot create symlinks in live shares**, and `node_modules`
   (pnpm/npm symlink farms) must therefore live inside VM disk, not in a share.

Consequence — the file ring:

- **Host = canonical project store** (what vue-designer already owns: guarded
  FS writes, canonical SFC). A per-user project directory on the host.
- **Project source enters the VM as a one-time seed + incremental writes** via
  the daemon's file API (`PUT /machines/{ref}/files`), against a per-user
  *volume*. Files do **not** live in a share.
- **node_modules lives in a second per-user volume** mounted at
  `/node_modules`, with `/src/node_modules` → `/node_modules` symlink created
  *inside the VM* (fine — the symlink restriction applies to shares, not to the
  VM's own disks). Deps volume survives machine deletion; reinstall is avoided
  on session rebirth once deps match the lockfile.
- Vite runs at guest port 8080 (`kling.ports` inherited from the template).

Two-tier idle policy (all server-side, no agent needed):

| Inactivity | Action | Endpoint | RAM cost |
|---|---|---|---|
| ~30 s | `pause` (`POST /machines/{ref}/pause`) — VMM alive, vCPU parked, resume ≈ 0.3 ms | RAM stays | interactive blur |
| ~5 min | `freeze` (TTL `on_ttl: freeze` or explicit) — RAM dumped to disk, 0 RAM/CPU, ~30 ms thaw | 0 | user idle |
| 24 h + no dep volume divergence | delete machine (`DELETE /machines/{ref}`); volumes persist | 0 | disk reclaim |

(If host RAM is plentiful, pause-first can be skipped; freeze is the real saver.
PoC should measure both thaw latencies and decide.)

---

## 1. Phase A — host bring-up (~half day)

- [ ] A KVM-capable Linux host: bare metal preferred; Hetzner dedicated or a
      nested-virt-capable VPS confirmed with `[ -r /dev/kvm ] && [ -w /dev/kvm ]`.
      Firecracker-on-nested-KVM is supported but slow (docs measured cold boots
      ~16 s nested vs ~3 s native — only acceptable for dev, not for the demo).
- [ ] Install: `curl -fsSL .../install.sh | sh
      -s -- --with mcp,sandbox` (take sandbox for its gateway patterns; core is
      enough for the PoC).
- [ ] `kling up` → checks KVM, nftables, `kindling` user, artifacts; it *prints*
      privileged commands rather than running them (that trust model is deliberate).
      Add `daemon.share_roots` only if Phase C revisits shares.
- [ ] Smoke: `kling try -- uname -a` (auto-removing sandbox), `kling status -v`.
- [ ] Optional but recommended: run the daemon behind `ssh` from the dev box —
      `KLING_HOST=ssh://user@host`, no TCP listener ever opened (daemon is
      Unix-socket only by design).

## 2. Phase B — bake the Vite golden template (~half day)

One template, reused by every user session (template = docker-like image + warm
snapshot):

```sh
kling image toolchain                          # base: node, npm, python3 (or build own)
kling run -image toolchain -name bake -allow-exec -egress internet \
  -mem 1024 -vcpus 1 -cpu-pct 100
kling exec bake -- sh -c 'node --version && npm --version'
```

Inside the bake machine:

1. Pre-install the dependency common denominator of the example projects
   (vue 3.5, vite 6, `@vitejs/plugin-vue`) into the image — not into
   `/src/node_modules` but globally-visible, e.g. `/opt/npm-cache` pre-filled by
   `npm cache add`, so a per-user `npm install` hits cache.
2. Write a project skeleton to `/src` (index.html, vite.config.ts binding
   `0.0.0.0:8080`, `strictPort`, HMR same-origin implicit).
3. **Readiness contract** — this is what makes restores warm from the first
   request:
   - `/etc/kindling/ready`: exits 0 once the Vite listener answers
     (`curl -fsS localhost:8080 >/dev/null`).
   - `/etc/kindling/post-restore.d/10-vite` (idempotent): if Vite not running
     (should not happen — restore resumes processes — but belt-and-braces),
     `cd /src && (vite >/var/log/vite.log 2>&1 &)` and no-op else. Skew/entropy
     after restore are already handled by the daemon (`guest-resync`).
4. **Freeze as the template** (refuses unless ready; `-replace` to atomically
   swap an old one):

```sh
kling save bake vite-golden        # warm snapshot; forks inherit listening Vite
```

Measured target: `kling run -from vite-golden` in ≤ 400 ms to a machine whose
8080 answers (docs: 26–41 ms restore; expect ~150–250 ms to first served request
under Firecracker due to first-touch page faults + resync — the doc numbers are
from nested-virt lab; bare metal should be close to the 30 ms figure).

## 3. Phase C — thin TypeScript client + session manager (~1 day)

### Client

No official SDK; the daemon is plain JSON-over-Unix-socket HTTP (remote: SSH).
A 150-line client covers everything needed:

```ts
// kling.ts — proof-of-concept client
import { RequestListener, request } from "node:http";

const SOCK = process.env.KLING_SOCK ?? "/run/kling.sock";

function kling<T = unknown>(
  method: string, path: string,
  body?: unknown, res?: "json" | "text" | "buffer",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      socketPath: SOCK, path, method,
      headers: data ? { "content-type": "application/json",
                        "content-length": Buffer.byteLength(data) } : {},
    }, (resp) => {
      const status = resp.statusCode ?? 500;
      const chunks: Buffer[] = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => {
        const payload = Buffer.concat(chunks);
        if (status >= 300) {
          let msg = `${status} ${path}`;
          try { msg = JSON.parse(payload.toString()).message ?? msg; } catch {}
          return reject(new KlingError(status, msg));
        }
        resolve(
          res === "buffer" ? payload as unknown as T
            : res === "text" ? payload.toString() as unknown as T
            : payload.length ? JSON.parse(payload.toString()) as T
            : (undefined as unknown as T),
        );
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

export class KlingError extends Error { constructor(public status: number, message: string) { super(message); } }

// surface needed by the session manager
export const kling = {
  info:       () => kling<Info>("GET", "/info"),
  machine:    (ref: string) => kling<Machine>("GET", `/machines/${ref}`),
  create:     (spec: RunRequest) => kling<Machine>("POST", "/machines", spec),
  thaw:       (ref: string) => kling("POST", `/machines/${ref}/thaw`),
  pause:      (ref: string) => kling("POST", `/machines/${ref}/pause`),
  renew:      (ref: string, ttl: number) => kling("POST", `/machines/${ref}/renew`, { ttl_seconds: ttl }),
  remove:     (ref: string) => kling("DELETE", `/machines/${ref}`),
  exec:       (ref: string, spec: ExecRequest) => kling<ExecResult>("POST", `/machines/${ref}/exec?wait=1`, spec),
  writeFile:  (ref: string, path: string, content: Buffer, opts?: { mode?: string }) =>
                klingPutFile(ref, path, content, opts),   // multipart/PUT semantics per api.md
  readFile:   (ref: string, path: string) => klingGetFile(ref, path),
  events:     () => klingStream("GET", "/events"),          // NDJSON, heartbeat 30 s
};
```

(`writeFile` deviates slightly from the sketch: `PUT /machines/{ref}/files?path=…&mode=0600`
takes the raw body, up to 64 MiB, atomic write. Use `exec` NDJSON streaming for
`npm install` so the designer can show dependency-install progress.)

### Session manager (Node service on the daemon host)

Owns: session lifecycle, idle policy, file mirroring, preview routing.

```ts
// preview-session.ts
async function ensureSession(userId: string): Promise<Session> {
  const name = `preview-${hash(userId)}`;          // deterministic → daemon re-adopts after restart
  let m = await kling.machine(name).catch(() => null);

  if (!m) {
    // per-user disks are idempotent to create
    await kling("POST", "/volumes", { name: `src-${name}`, size_mib: 256 });     // project files
    await kling("POST", "/volumes", { name: `deps-${name}`, size_mib: 2048 });   // node_modules

    m = await kling.create({
      from: "vite-golden", name,                    // warm template: Vite already attached
      vcpus: 1, mem_mib: 1024, mem_max_mib: 2048,   // resize headroom
      cpu_pct: 100,
      egress: "allowlist", allow_domains: ["registry.npmjs.org", "registry.npmmirror.com"],
      volumes: [
        { name: `src-${name}`,  mount: "/src" },
        { name: `deps-${name}`, mount: "/node_modules" },
      ],
      on_ttl: "freeze", ttl_seconds: 300,           // freeze 5 min after last activity
      labels: { "app.kling/preview": userId, "kling.ports": "8080" },
      wait_ready: true,                             // blocks until guest probe is 0
    });

    await kling.exec(name, { cmd: ["sh", "-c", "ln -sfn /node_modules /src/node_modules"] });
    await mirrorProjectFiles(name);                 // PUT /files from canonical host store
    await kling.exec(name, { cmd: ["npm", "install", "--no-audit", "--no-fund"],
                             dir: "/src", timeout_seconds: 900 });
    await kling.exec(name, { cmd: ["sh", "-c", "nohup npx vite --host 0.0.0.0 --port 8080 >/var/log/vite.log 2>&1 &"] });
    await waitHttpReady(name);                      // probe `/machines/{ref}/guest` probe_only until 200
  }

  // activity path: thaw (auto-freeze-fast if paused) + renew lease
  if (m.state !== "running") await kling.thaw(name);
  await kling.renew(name, 300);
  return { user: userId, ref: name, ip: m.ip, expires: Date.now() + 300_000 };
}
```

### Request path (editor iframe → guest Vite)

- Wildcard DNS `*.preview.example.com` → host; wildcard TLS (Let's Encrypt
  DNS-01) on a Caddy front (or Node `http2` + ACME).
- Caddy routes `u-<slug>.preview.example.com` → `127.0.0.1:7749` (the session
  manager).
- The manager resolves `<slug>` → machine ref, calls `ensureSession`, then
  **streams** the request at `m.ip:8080`, including WS upgrade — use
  `node-http-proxy`/`undici` upgrade passthrough. Do **not** use
  `POST /machines/{ref}/guest` for live traffic: it is one-request-per-call,
  capped at 8–64 MiB, and has no WebSocket story; it exists for the MCP
  gateway pattern. Guest IPs are host- namespace IPs (172.30.0.0/16 veth), so
  our host process can dial them directly.
- Vite config in the baked template must set `server.allowedHosts` to the
  preview domain (Vite ≥6.1 DNS-rebinding guard) and bind 0.0.0.0:8080 fixed.

### Idle bookkeeping

- Editor emits activity (edit/message/heartbeat). Session manager touches
  `expiresAt`, and calls `renew` once per minute of activity (not per keystroke —
  renew is a cheap POST but bounded).
- The daemon's TTL with `on_ttl: freeze` is the enforcement of record: manager
  crash ≠ orphaned running VM (TTL still freezes; renew-on-activity pattern is
  the same lease the gateway planner uses).
- Suspend ladder stays as §0; delete machine after grace (deps volume keeps its
  node_modules, so a fresh boot + `npm ci` resume is fast).

## 4. Phase D — designer integration points (~1 day)

- iframe src = `https://u-<slug>.preview.example.com`. The designer's own
  origin stays separate (keep the existing editor-origin security; the preview
  iframe remains cross-origin sandboxed → your core isolation model holds).
- File writes: the designer already performs guarded, source-range edits through
  `packages/vite-plugin`. Keep that **as-is on the host** as canonical; each
  successful write triggers:
  1. `writeFile(ref, "/src" + path, bytes)` to the VM,
  2. (if frozen) `thaw` first — one round-trip, ~30–40 ms added to first-edit
     latency after idle; acceptable.
- Terminal affordance (optional): `kling shell` (`kling-shell/1` upgrade) or
  exec to show build errors surfaced from the VM's Vite stderr.
- History/undo: unrelated — stays host-side. The VM edits nothing canonical.

## 5. Phase E — verification (~half day)

1. Cold-create from template, 10 concurrent users × `run -from` → p50/p95.
2. Restore-then-first-request latency (manager probes before lifting the
   iframe spinner; compare to boxd behavior).
3. HMR round-trip over the proxy: edit SFC → browser paints. Include
   disconnect/reconnect while frozen-thawed mid-session.
4. RAM density: 10–20 suspended/frozen sessions (expect template-shared RAM ≪
   256 MiB/instance; run `POST /procstats` sampling), disk per frozen snapshot.
5. Failure drills: daemon restart with live VMs (re-adoption), host reboot
   (reconciler cleanup), guest OOM (mem ceiling → `resize` up), `npm install`
   killed mid-flight (npm's cache makes re-run safe).
6. Tear down: volumes persist by design; delete test users' volumes at end.

## 6. Deliverables & go/no-go

**Deliverable after the PoC**: a running session manager + Caddy route producing
a stable per-user HTTPS preview origin backed by a kindling µVM, measured
restore numbers for 10 concurrent sessions, and a written decision on
`pause`-vs-`freeze` two-tier idle.

**Go signals**: restore-first-request ≤ ~350 ms nested / ≤ ~150 ms bare metal;
10 concurrent sessions on a test box without host-memory alarm
(`KLING_MAX_MEM_PRESSURE` admission hits 507 before instability, which is fine
early-warning behavior); no WS drop after thaw.

**No-go pivots** (in order):
- kindling stability/maintenance concerns → microsandbox stop/start model (accept
  a few-seconds warm-up; disk persistence keeps installs).
- Multi-host later: `kling sandbox`'s prewarmed-pool pattern is the template for
  router placement; not needed at PoC scale.

## 7. Risks / open questions

- Single-maintainer project at v0.17; pin the daemon version, pin the daemon
  release in the session-manager healthcheck (`GET /info` version match).
- Guest cpu/mem ceilings: `cpu_pct` clamps runaway builds; `mem_max_mib` +
  `resize` give OOM headroom. Firecracker ballooning is still coarse — expect
  squeeze (`409` on `mem_shared` copies unless `force`) to be fiddly at scale.
- `POST /machines` max: 256 per daemon default (`KLING_MAX_MACHINES`); fine.
- Nested-virt latency: fine for PoC; production wants bare metal (also matters
  because every thaw pays first-touch page-in; nested makes that 150–250 ms).
- No TypeScript client ships upstream — the 150-line wrapper in this repo is the
  canonical one to maintain.
