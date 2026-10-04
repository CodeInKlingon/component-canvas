/**
 * Frozen types for the kindling manager HTTP + SSE API.
 * The manager enables CORS (`Access-Control-Allow-Origin: *`), so the browser
 * talks to it directly, including for `EventSource`.
 *
 * `$fetch` and `useRuntimeConfig` are Nuxt auto-imports.
 */
export type ProjectStatus =
  | 'new'
  | 'provisioning'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'stopped'
  | 'error'

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  machine?: string
  previewUrl?: string
  previewPort?: number
  error?: string | null
  createdAt: string
  updatedAt: string
}

export interface LogLine {
  ts: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export interface HealthResponse {
  ok: boolean
  manager: { version: string }
  kindling: { ok: boolean; version?: string; error?: string }
}

export interface ProjectListResponse {
  projects: Project[]
}

export interface ProjectResponse {
  project: Project
}

export interface LogsResponse {
  lines: LogLine[]
}

export interface PreviewResponse {
  url: string
}

export interface ProjectEventHandlers {
  /** Named `status` SSE event. */
  onStatus?: (project: Project) => void
  /** Named `log` SSE event. */
  onLog?: (line: LogLine) => void
  /** Named `error` SSE event (server-reported error payload). */
  onError?: (message: string) => void
  /** Named `done` SSE event; the stream is closed after this fires. */
  onDone?: (project: Project) => void
  /**
   * Native `EventSource` connection failure. The browser normally reconnects on
   * its own, so callers should treat this as a soft "reconnecting" signal rather
   * than a fatal error.
   */
  onConnectionError?: (readyState: number) => void
}

/** Statuses during which provisioning is still in flight. */
export const TRANSIENT_STATUSES: ProjectStatus[] = ['provisioning', 'installing', 'starting']

export function isTransientStatus(status: ProjectStatus | null | undefined): boolean {
  return !!status && TRANSIENT_STATUSES.includes(status)
}

export function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'new':
      return 'New'
    case 'provisioning':
      return 'Provisioning'
    case 'installing':
      return 'Installing'
    case 'starting':
      return 'Starting'
    case 'ready':
      return 'Ready'
    case 'stopped':
      return 'Stopped'
    case 'error':
      return 'Error'
  }
}

/** Error thrown for any non-2xx manager response, carrying the HTTP status. */
export class ManagerError extends Error {
  status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ManagerError'
    this.status = status
  }
}

function readStatus(err: unknown): number {
  const e = err as {
    status?: number
    statusCode?: number
    response?: { status?: number }
  }
  return e?.response?.status ?? e?.status ?? e?.statusCode ?? 0
}

function readMessage(err: unknown, fallback: string): string {
  const e = err as {
    data?: { error?: string; message?: string }
    message?: string
  }
  return e?.data?.error || e?.data?.message || e?.message || fallback
}

export function useManager() {
  const config = useRuntimeConfig()
  const baseUrl = String(config.public.managerUrl || '')

  async function request<T>(path: string, options: Record<string, unknown> = {}): Promise<T> {
    try {
      return await $fetch<T>(`${baseUrl}${path}`, options as never)
    } catch (err) {
      throw new ManagerError(readMessage(err, `Request to ${path} failed`), readStatus(err))
    }
  }

  const health = () => request<HealthResponse>('/health')

  const listProjects = async (): Promise<Project[]> =>
    (await request<ProjectListResponse>('/api/projects')).projects

  const createProject = async (name?: string): Promise<Project> =>
    (
      await request<ProjectResponse>('/api/projects', {
        method: 'POST',
        body: name === undefined ? {} : { name },
      })
    ).project

  const getProject = async (id: string): Promise<Project> =>
    (await request<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}`)).project

  const getLogs = async (id: string): Promise<LogLine[]> =>
    (await request<LogsResponse>(`/api/projects/${encodeURIComponent(id)}/logs`)).lines

  const startProject = async (id: string): Promise<Project> =>
    (await request<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}/start`, { method: 'POST' })).project

  const stopProject = async (id: string): Promise<Project> =>
    (await request<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}/stop`, { method: 'POST' })).project

  const deleteProject = (id: string): Promise<{ ok: true }> =>
    request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })

  const getPreview = async (id: string): Promise<string> =>
    (await request<PreviewResponse>(`/api/projects/${encodeURIComponent(id)}/preview`)).url

  /**
   * Subscribe to a project's SSE stream. Returns a cleanup function that closes
   * the underlying `EventSource`.
   */
  function subscribeProject(id: string, handlers: ProjectEventHandlers): () => void {
    const url = `${baseUrl}/api/projects/${encodeURIComponent(id)}/events`
    const source = new EventSource(url)

    const parse = <T>(event: Event): T | null => {
      if (!(event instanceof MessageEvent)) return null
      try {
        return JSON.parse(event.data) as T
      } catch {
        return null
      }
    }

    source.addEventListener('status', (event) => {
      const data = parse<{ project: Project }>(event)
      if (data) handlers.onStatus?.(data.project)
    })

    source.addEventListener('log', (event) => {
      const data = parse<{ line: LogLine }>(event)
      if (data) handlers.onLog?.(data.line)
    })

    // A named `error` SSE event arrives as a MessageEvent. A native connection
    // failure arrives as a plain Event, which we forward as a soft reconnect
    // signal. Handled in one listener so we never double-report.
    source.addEventListener('error', (event) => {
      if (event instanceof MessageEvent && event.data) {
        const data = parse<{ message: string }>(event)
        handlers.onError?.(data?.message ?? 'Unknown error from manager')
        return
      }
      handlers.onConnectionError?.(source.readyState)
    })

    source.addEventListener('done', (event) => {
      const data = parse<{ project: Project }>(event)
      if (data) handlers.onDone?.(data.project)
      source.close()
    })

    return () => source.close()
  }

  return {
    baseUrl,
    health,
    listProjects,
    createProject,
    getProject,
    getLogs,
    startProject,
    stopProject,
    deleteProject,
    getPreview,
    subscribeProject,
  }
}
