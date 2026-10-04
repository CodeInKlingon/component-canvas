# MicroVM management libraries for the vue-designer dev-preview backend

> Research note — not an implementation plan. Evaluates self-hostable microVM
> runtimes against the needs of hosting each user's Vite project in an isolated,
> suspend-on-idle, resume-on-request microVM whose dev preview the editor iframes.

## Requirements derived from the designer

1. **Stateful suspend/resume** — Vite holds HMR state and `node_modules/.vite`
   pre-bundle caches in memory + process state; ideal suspend freezes the *running*
   process, ideal resume is sub-second. Stop/restart is an acceptable fallback if
   the disk (deps, cache) persists.
2. **TypeScript API** for initialize / configure / suspend / resume.
3. **Self-host on a VPS** with `/dev/kvm` (Hetzner-class KVM VPS works; OpenVZ
   doesn't; bare metal is the safe target for Firecracker).
4. **HTTP path into the VM** — editor iframes need a stable per-user origin with
   TLS and WebSocket support (Vite HMR over WS).
5. **File sync** — user project files in as a volume/copy; `npm install` runs
   inside the VM.

## Candidates

| | Runtime | Suspend/resume | TS API | Self-host | Verdict |
|---|---|---|---|---|---|
| **boxd** | Own Rust hypervisor ("Ignition") | Auto-suspend (sub-ms resume) + auto-hibernate (~85ms, disk-only); idle-based | TS/Python SDK | Single Rust binary; self-host is the commercial "annual license" tier | The reference product for this UX |
| **kindling** (`juan52878911/kindling`) | Firecracker | `freeze`: 0 RAM/CPU, ~30 ms thaw; golden snapshots share memory (`kling run -from`); `-ttl` auto-freeze; COW disks | No official SDK; documented daemon HTTP API (`docs/api.md`), thin TS client is easy | Apache-2.0, Go binary + systemd, Linux only | Best open analog; young (v0.17, 1 maintainer) |
| **microsandbox** (`superradcompany/microsandbox`) | libkrun | `stop()`/`start()` with persisted state solid; `pause()/resume()` "coming soon" as of v0.3 docs; snapshots supported | First-class npm `microsandbox` | Apache-2.0, /dev/kvm required | Pragmatic choice if stop/restart warm-up is acceptable |
| **BoxLite** (`boxlite-ai/boxlite`) | KVM | Stop/restart with persisted QCOW2; server-side idle AutoStop; no memory suspend | npm `@boxlite-ai/boxlite` | Apache-2.0; `boxlite serve` REST; AWS/GCP fleet guides | Daemonless embed; strong Node SDK, but stop/restart model |
| **Ignition** (`lttle-cloud/ignition`) | KVM, own orchestrator | Snapshot-based *cold* model (see below), not warm suspend/resume | `@lttle/client` (auto-generated, complete) | Process (`ignitiond`) + `lttle` CLI; docs thin ("you're on your own"); project says not production | Promising but mis-shaped for warm dev previews + maturity risk |
| **nether** (`justinGrosvenor/nether`) | Own Zig VMM (KVM/HVF) | Warm fork ~10 ms; park/wake mid-request (HVF-proven) | Unix control protocol; TS client is DIY | KVM backend second-class: fixed 256 MiB RAM, no park-file lifecycle, live KVM unverified | Watch; great control-protocol spec material |

## Ignition deep-dive (why it isn't ranked top-3)

Checked directly (sourced from `sdk/typescript-client/src/client.ts` on `master`):

- **Restore is cold-restore, not warm resume.** The deployment model is
  *snapshot at deploy time → machines stay suspended → restore from that
  snapshot on traffic*. `MachineMode = "regular" | { flash: { strategy }}` and
  `InitAppSnapshotStrategy = SuspendBeforeStart | SuspendAfterListenOnAnyPort |
  SuspendManually | suspendafterlistenonport`.
- **No session-delta suspend.** Nothing in the API takes a *running* machine and
  suspends it after user edits. `MachinePhase` includes `suspending`/`suspended`
  but there is no `suspend`/`resume` endpoint on `MachineClient`
  (`apply`, `delete`, `get`, `list`, `logs`, `exec` only). So between user edits
  the VM can only thaw-into the deploy-time snapshot (pre-start) or stay warm.
- **Volumes exist** (`MachineVolumeBinding` in the SDK; `src/agent/volume.rs`
  and `src/controller/volume.rs` on disk) but the cloud links
  (`eu.lttle.cloud`) resolve via API; docs on how volume parenting works
  across snapshot/restore for a *stateful* dev server aren't written yet.
- **Open questions**: Volumes exist (` volumes: MachineVolumeBinding[]` in
  `AppV1`, plus `src/agent/volume.rs` / `src/controller/volume.rs` on disk) but
  there's no written doc on cross-snapshot volume semantics for a *stateful*
  dev server, so snapshot-restore + node_modules persistence needs a PoC.
- **`lttle exec` exists** (`/core/exec` WS stream), enough to run
  `npm install` or `vite` inside the box once booted.
- **Maturity**: three doc files (`kvm.md`, `net.md`, `certs.md`), no docs for
  self-hosting `ignitiond`, active dev ("we don't recommend production"), AGPL-3.0.
- **License**: AGPL-3.0 — fine for an internal tool; if your preview farm is a
  hosted product and you modify Ignition itself, network-copyleft obligations
  kick in.

## Recommended stack

- **PoC / fastest to boxd-UX**: try **boxd** (hosted, or self-hosted if the
  license is acceptable). Delivers init/config/auto-suspend/auto-hibernate /
  hypervisor hardening, ~30-50 ms boot, per-VM HTTPS.
- **Best open self-host bet**: **kindling** — golden snapshot with Vite already
  serving → 30 ms thaw on request → TTL auto-freeze to disk → 0 RAM parked;
  multi-tenant `kling-sandbox` extension. Cost: thin TS client over the daemon
  HTTP API, single-maintainer risk.
- **Pragmatic middle**: **microsandbox** npm SDK; accept stop/restart warm-up
  (deps + `node_modules/.vite` persist on disk; Vite re-boot ~2–5 s).
- **Ignition**: revisit in ~6 months (watch for a warm-suspend API and
  self-host docs). Its architecture is right; its current feature set and docs
  fit "deploy a built app" better than "host a long-lived user session".

## Architecture notes for vue-designer preview boxes

- One microVM per user (session-mapped), idle → freeze/park, request → resume.
- Preview origin: `<user>.preview.example.com` with wildcard TLS; reverse-proxy
  on the host to the VM's exposed port (Vite `server.port`, `strictPort`,
  `host 0.0.0.0`).
- HMR over WebSocket must survive the proxy — connect Vite's client to its own
  origin (`server.hmr` config), or proxy WS explicitly.
- Project files per session: bind/volume in the project dir; run `npm install`
  inside the VM (provenance accountability), not on the host.
- Idle policy: freeze after ~2–5 min, hibernate-to-disk after ~1 h, hard-stop
  after grace period to reclaim disk.
- Open: how much of the designer's existing guarded-FS/preview-protocol model
  (sandboxed iframe, protocol messages, revision checks) can be reused against
  the VM's Vite server vs needing to proxy through the vite-plugin.

## Open questions

- Does boxd self-hosting license permit a multi-tenant SaaS distribution?
- kindling: is there an idle→auto-freeze on *external* traffic detection, or
  only TTL? (Docs show `-ttl` + gateway idle config.)
- microsandbox: confirm `pause()/resume()` GA in current release.
- No candidate ships Node.js arm64 kernels and Vite-required host configs
  (fake-indexeddb, WebSocket polyfills) — portrait a custom guest image either way.
