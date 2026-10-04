# Kindling Preview PoC

A proof of concept for a **microVM manager** driven by a **Nuxt application**.

Onboarding prepares an isolated microVM: it loads a bundled Vue + Vite project,
installs dependencies, and runs the Vite dev server. The project page then shows
that dev server live in an iframe. Idle machines are paused/frozen and wake on
the next request.

This is a standalone `poc/` workspace and is **not** part of the vue-designer
pnpm workspace (`pnpm-workspace.yaml` at the repo root only matches
`packages/*` and `examples/*`).

```
poc/
├── compose.yaml            # kindling daemon + manager, sharing a netns
├── kindling/               # containerised kindling (Firecracker) daemon
│   ├── Dockerfile
│   ├── entrypoint.sh       # starts daemon, builds min + toolchain, fetches kernel
│   ├── fetch-kernel.sh     # Firecracker CI vmlinux -> $KLING_ROOT/images
│   └── install-kindling.sh # kling CLI + guest agent + builder scripts
├── manager/                # TypeScript session manager + preview proxy
│   └── src/
│       ├── kling/          # typed client for the kindling daemon HTTP API
│       ├── session/        # microVM lifecycle + onboarding
│       ├── preview/        # per-project HTTP/WS proxy to the guest
│       ├── sample/         # bundled Vue + Vite project
│       └── api/            # control-plane HTTP API + SSE
└── nuxt-app/               # Nuxt control-plane UI
    ├── pages/index.vue             # project list
    ├── pages/projects/new.vue      # onboarding wizard (SSE progress)
    └── pages/projects/[id].vue     # iframe preview + lifecycle + logs
```

## Architecture

```
   browser ──────────────► Nuxt (localhost:3000)
      │  fetch + EventSource   │
      │                        │  http://localhost:7100
      ▼                        ▼
 ┌─────────────────────────────────────────────┐   shared network namespace
 │ manager container          (control API)     │   + shared /run volume
 │   • project registry / SSE                   │
 │   • onboarding (seed, npm install, vite)     │
 │   • preview proxy :7200-7299 ──► guest:3000  │
 ├─────────────────────────────────────────────┤
 │ kindling container         (Unix socket)     │
 │   • daemon  /run/kling.sock                  │
 │   • Firecracker microVMs on 172.30.0.0/16    │
 └─────────────────────────────────────────────┘
        │ /dev/kvm  /dev/net/tun  (privileged)
        ▼
   host kernel + KVM
```

Two deliberate choices, both forced by kindling's design:

1. **The manager shares the daemon's network namespace.** Guest microVMs live on
   host-only IPs (`172.30.0.0/16`) that only exist inside that namespace, and the
   preview proxy must dial them directly to support HTTP *and* WebSocket (Vite
   HMR). It reaches the daemon over the Unix socket shared through a volume.
2. **A per-project preview origin** (`127.0.0.1:72xx`) rather than a path prefix.
   Vite's HMR client derives its endpoint from `location`, so serving each
   project at the origin root means HMR "just works" through the proxy without
   base-path juggling.

## Prerequisites

- Docker Desktop with the **WSL2 backend**.
- Nested virtualisation enabled so containers can see `/dev/kvm`. Verify:
  ```sh
  docker run --rm --device /dev/kvm alpine sh -c 'ls -l /dev/kvm'
  ```
- Node 18+ and pnpm for the Nuxt app.

The kindling container needs `/dev/kvm` and `/dev/net/tun`, and runs
`privileged` (it creates network namespaces, veth pairs and nftables rules).

## Running

### 1. Start the microVM daemon + manager

```sh
cd poc
docker compose up -d
docker compose logs -f kindling
```

On the **first run** the `kindling` container builds the base images and fetches
the Firecracker CI kernel, which takes a few minutes. Wait for:

```
[kindling] ready
```

The readiness marker gates the manager's healthcheck, so the manager starts only
once the daemon and images are usable. Check everything is up:

```sh
curl http://localhost:7100/health
# {"ok":true,"manager":{...},"kindling":{"ok":true,"version":"0.17.0"}}
```

### 2. Start the Nuxt app

```sh
cd poc
pnpm install                 # installs manager + nuxt-app once
pnpm --filter nuxt-preview-poc dev -- --port 3210
```

Open `http://localhost:3210/`. Nuxt defaults to port 3000, which is commonly
already in use; pass `--port` (as above) to choose a free one.

The app reads the manager URL from `NUXT_PUBLIC_MANAGER_URL` (default
`http://localhost:7100`), configurable in `nuxt.config.ts` or the environment.

### 3. Onboard a project

Click **New project**, give it a name, and watch the wizard stream provisioning
steps. When it reaches **ready**, open the project: the Vite dev server is shown
in the iframe, and edits inside the sample app hot-reload over the WebSocket
proxy. Use **Stop** / **Start** to exercise freeze/thaw and **Delete** to remove
the machine and its volumes.

## Manager configuration

Set on the `manager` service in `compose.yaml`:

| Variable            | Default                  | Meaning                                             |
| ------------------- | ------------------------ | --------------------------------------------------- |
| `HOST` / `PORT`     | `0.0.0.0` / `7100`       | Control API bind                                    |
| `KLING_SOCK`        | `/run/kling.sock`        | kindling daemon Unix socket                         |
| `KLING_URL`         | –                        | TCP base URL (wins over the socket, for a bridge)   |
| `KLING_IMAGE`       | `toolchain`              | Image every preview machine boots from              |
| `GUEST_PORT`        | `3000`                   | Port Vite listens on inside the guest (8080 is kindling's agent) |
| `PREVIEW_HOST`      | `127.0.0.1`              | Host used in preview URLs (what the browser resolves) |
| `PREVIEW_BIND_HOST` | `0.0.0.0`                | Address preview servers bind (Docker forwards to it) |
| `PREVIEW_PORT_BASE` | `7200`                   | First preview port                                  |
| `PREVIEW_PORT_MAX`  | `7299`                   | Last preview port                                   |
| `EGRESS`            | `allowlist`              | Guest egress: `none` \| `internet` \| `allowlist`   |
| `ALLOW_DOMAINS`     | `registry.npmjs.org,...` | Allowed domains when `allowlist`                    |
| `MEM_MIB` / `MEM_MAX_MIB` | `1024` / `2048`    | Guest memory request / ceiling                      |
| `TTL_SECONDS`       | `300`                    | Daemon auto-freeze TTL                              |
| `PAUSE_AFTER_MS`    | `30000`                  | Manager pauses a running machine after this idle    |

## Control API

Base `http://localhost:7100`; CORS is open (local PoC only).

| Method | Path                              | Purpose                                    |
| ------ | --------------------------------- | ------------------------------------------ |
| GET    | `/health`                         | Manager + kindling status                  |
| GET    | `/api/projects`                   | List projects                              |
| POST   | `/api/projects` `{name?}`         | Create + start provisioning (async)        |
| GET    | `/api/projects/:id`               | Project state                              |
| GET    | `/api/projects/:id/events`        | SSE: `status`, `log`, `error`, `done`      |
| GET    | `/api/projects/:id/logs`          | Buffered log lines                         |
| GET    | `/api/projects/:id/preview`       | `{ url }` for the iframe                   |
| POST   | `/api/projects/:id/start`         | Thaw / re-provision                        |
| POST   | `/api/projects/:id/stop`          | Pause (fallback: freeze)                   |
| DELETE | `/api/projects/:id`               | Delete machine + volumes                   |

## How onboarding works

For each project the manager:

1. Creates two persistent volumes: `src-<id>` → `/src` (project files) and
   `deps-<id>` → `/node_modules` (symlink farms survive machine deletion).
2. Creates a Firecracker microVM from the `toolchain` image with `allow_exec`,
   an egress allowlist, `on_ttl: freeze`, and `kling.ports: 3000`.
3. Symlinks `/src/node_modules → /node_modules` inside the guest.
4. Seeds the bundled Vue + Vite sample via `PUT /machines/{ref}/files`.
5. Runs `npm install` with streaming exec, surfacing output to the UI.
6. Starts Vite detached (`setsid`) on `0.0.0.0:3000` and waits for the port.
   (Not 8080: kindling's guest agent already listens there.)
7. Allocates a preview port and starts the per-project proxy.

## Lifecycle

| Idle            | Action                             | Cost                    |
| --------------- | ---------------------------------- | ----------------------- |
| ~30 s           | manager `pause` (vCPU parked)      | RAM retained, 0 CPU     |
| ~5 min (TTL)    | daemon `freeze` to disk            | 0 RAM/CPU, ~30 ms thaw  |
| next request    | proxy `thaw`s before forwarding    | first response slower   |

`GET /api/projects/:id/preview` and any preview request wake a frozen machine
transparently.

## Known limitations / next steps

- The sample app is fixed; real onboarding would clone a repo into `/src` and
  mirror host edits into the guest.
- No authentication or per-user isolation at the API layer.
- The kindling image/build plumbing in `poc/kindling/` compensates for the
  release installer not shipping the guest agent, builder scripts, base image or
  kernel; pin `KLING_VERSION` for reproducibility.
- `registry.npmjs.org` must be reachable from the guest for `npm install`.
- `no CPU limit per microVM` warning from the daemon: the container's cgroup
  hierarchy doesn't expose `cgroup.subtree_control`; harmless for the PoC.

## Useful commands

```sh
cd poc
pnpm --filter nuxt-preview-poc dev -- --port 3210   # Nuxt dev server
docker compose logs -f kindling          # daemon + image build
docker compose logs -f manager           # manager
docker compose exec kindling kling ps -a # machines
docker compose down                      # stop (volumes persist)
docker compose down -v                   # stop + wipe machines/images/registry
```
