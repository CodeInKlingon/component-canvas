<script setup lang="ts">
import {
  useManager,
  statusLabel,
  isTransientStatus,
  ManagerError,
  type LogLine,
  type Project,
} from '~/composables/useManager'

const route = useRoute()
const {
  getProject,
  getLogs,
  startProject,
  stopProject,
  deleteProject,
  getPreview,
  subscribeProject,
} = useManager()

const id = String(route.params.id)

const MAX_LOG_LINES = 2000

const project = ref<Project | null>(null)
const logs = ref<LogLine[]>([])
const loading = ref(true)
const notFound = ref(false)
const fatalError = ref('')
const actionError = ref('')
const busy = ref<'' | 'start' | 'stop' | 'delete'>('')
const previewUrl = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const iframeKey = ref(0)
const logsOpen = ref(true)
const live = ref(false)

const terminalEl = ref<HTMLElement | null>(null)

let cleanup: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const status = computed(() => project.value?.status)
const isReady = computed(() => status.value === 'ready')
const canStart = computed(
  () => !!project.value && busy.value === '' && !isTransientStatus(status.value) && status.value !== 'ready',
)
const canStop = computed(() => !!project.value && busy.value === '' && status.value === 'ready')
const showReconnect = computed(() => !live.value && !!project.value && !isReady.value)

useHead(() => ({
  title: `${project.value?.name || 'Project'} · Kindling Preview PoC`,
}))

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString()
}

function pushLog(line: LogLine) {
  logs.value.push(line)
  if (logs.value.length > MAX_LOG_LINES) logs.value.splice(0, logs.value.length - MAX_LOG_LINES)
}

async function fetchPreview() {
  if (!project.value || project.value.status !== 'ready') return
  previewLoading.value = true
  previewError.value = ''
  try {
    previewUrl.value = await getPreview(id)
  } catch (err) {
    previewError.value = (err as Error).message
  } finally {
    previewLoading.value = false
  }
}

function reloadPreview() {
  iframeKey.value += 1
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void refreshProject()
  }, 3000)
}

function applyProject(next: Project) {
  project.value = next
  live.value = true
  if (next.error) actionError.value = next.error
  if (next.status === 'ready') {
    stopPolling()
    if (!previewUrl.value) void fetchPreview()
  } else if (isTransientStatus(next.status)) {
    startPolling()
  } else {
    stopPolling()
  }
}

async function refreshProject() {
  try {
    const next = await getProject(id)
    if (notFound.value) notFound.value = false
    if (fatalError.value) fatalError.value = ''
    applyProject(next)
  } catch (err) {
    const e = err as ManagerError
    if (e instanceof ManagerError && e.status === 404) {
      notFound.value = true
      stopPolling()
      if (cleanup) {
        cleanup()
        cleanup = null
      }
      return
    }
    // Keep the last known project on transient polling errors.
    if (!project.value) fatalError.value = (err as Error).message
  }
}

function subscribe() {
  cleanup = subscribeProject(id, {
    onStatus: applyProject,
    onDone: applyProject,
    onLog: pushLog,
    onError: (message) => {
      actionError.value = message
    },
    onConnectionError: () => {
      live.value = false
    },
  })
}

async function runAction(kind: 'start' | 'stop') {
  if (!project.value || busy.value !== '') return
  busy.value = kind
  actionError.value = ''
  try {
    const next = kind === 'start' ? await startProject(id) : await stopProject(id)
    if (kind === 'stop') {
      previewUrl.value = ''
    }
    applyProject(next)
    if (kind === 'start') startPolling()
  } catch (err) {
    actionError.value = (err as Error).message
  } finally {
    busy.value = ''
  }
}

async function removeProject() {
  if (!project.value || busy.value !== '') return
  const ok = window.confirm(`Delete "${project.value.name}"? This stops and removes the microVM.`)
  if (!ok) return
  busy.value = 'delete'
  actionError.value = ''
  try {
    await deleteProject(id)
    stopPolling()
    if (cleanup) {
      cleanup()
      cleanup = null
    }
    await navigateTo('/')
  } catch (err) {
    actionError.value = (err as Error).message
    busy.value = ''
  }
}

onMounted(async () => {
  await refreshProject()
  if (project.value) {
    try {
      logs.value = await getLogs(id)
    } catch {
      // Logs are best-effort; live events may still arrive.
    }
    if (isTransientStatus(project.value.status)) startPolling()
    if (project.value.status === 'ready') void fetchPreview()
    subscribe()
  }
  loading.value = false
})

onBeforeUnmount(() => {
  stopPolling()
  if (cleanup) {
    cleanup()
    cleanup = null
  }
})

watch(
  () => logs.value.length,
  async () => {
    await nextTick()
    if (terminalEl.value) terminalEl.value.scrollTop = terminalEl.value.scrollHeight
  },
)
</script>

<template>
  <section class="page">
    <div v-if="loading" class="state" aria-busy="true">
      <span class="spinner" aria-hidden="true" />
      <p>Loading project…</p>
    </div>

    <div v-else-if="notFound" class="state state--empty">
      <h2 class="state__title">Project not found</h2>
      <p class="state__text mono">{{ id }}</p>
      <NuxtLink to="/" class="btn btn--primary">Back to projects</NuxtLink>
    </div>

    <div v-else-if="fatalError" class="state state--error">
      <h2 class="state__title">Can’t load project</h2>
      <p class="state__text">{{ fatalError }}</p>
      <button type="button" class="btn btn--primary" @click="refreshProject">Retry</button>
    </div>

    <template v-else-if="project">
      <header class="page-head page-head--workspace">
        <div class="workspace-title">
          <h1 class="page-title">{{ project.name }}</h1>
          <div class="workspace-meta">
            <span class="badge" :class="`badge--${project.status}`">
              <span v-if="isTransientStatus(project.status)" class="spinner spinner--xs" aria-hidden="true" />
              {{ statusLabel(project.status) }}
            </span>
            <span class="muted mono">{{ project.machine || 'no machine' }}</span>
            <span v-if="showReconnect" class="reconnect">reconnecting…</span>
          </div>
        </div>
        <div class="workspace-actions">
          <button type="button" class="btn" :disabled="!canStart" @click="runAction('start')">
            <span v-if="busy === 'start'" class="spinner spinner--xs" aria-hidden="true" />
            Start
          </button>
          <button type="button" class="btn" :disabled="!canStop" @click="runAction('stop')">
            <span v-if="busy === 'stop'" class="spinner spinner--xs" aria-hidden="true" />
            Stop
          </button>
          <button type="button" class="btn btn--danger" :disabled="busy === 'delete'" @click="removeProject">
            <span v-if="busy === 'delete'" class="spinner spinner--xs" aria-hidden="true" />
            Delete
          </button>
        </div>
      </header>

      <div v-if="actionError" class="alert alert--error">{{ actionError }}</div>

      <section class="preview">
        <div class="preview__toolbar">
          <span class="preview__label">Preview</span>
          <span class="preview__url mono" :title="previewUrl">{{ previewUrl || 'not running' }}</span>
          <span class="spacer" />
          <button
            type="button"
            class="btn btn--sm"
            :disabled="!isReady || !previewUrl"
            @click="reloadPreview"
          >
            Reload preview
          </button>
          <a
            v-if="previewUrl"
            class="btn btn--sm"
            :href="previewUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in new tab
          </a>
        </div>

        <div class="preview__frame-wrap">
          <div v-if="isReady && previewUrl" class="preview__frame-inner">
            <iframe
              :key="iframeKey"
              class="preview__frame"
              :src="previewUrl"
              title="Kindling preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          </div>
          <div v-else-if="isReady && previewLoading" class="preview__placeholder">
            <span class="spinner" aria-hidden="true" />
            <p>Resolving preview URL…</p>
          </div>
          <div v-else class="preview__placeholder">
            <h2 class="preview__placeholder-title">Dev server is not running</h2>
            <p class="preview__placeholder-text">
              Current status:
              <span class="badge" :class="`badge--${project.status}`">{{ statusLabel(project.status) }}</span>
            </p>
            <p v-if="previewError" class="preview__placeholder-text error-text">{{ previewError }}</p>
            <p v-else-if="project.status === 'error'" class="preview__placeholder-text error-text">
              {{ project.error || 'The microVM reported an error.' }}
            </p>
            <p v-else-if="isTransientStatus(project.status)" class="preview__placeholder-text">
              Provisioning in progress — the preview will appear here once ready.
            </p>
            <p v-else class="preview__placeholder-text">
              Use <strong>Start</strong> to thaw the microVM and launch the dev server.
            </p>
          </div>
        </div>
      </section>

      <section class="logs">
        <button type="button" class="logs__head" @click="logsOpen = !logsOpen">
          <span class="logs__chevron" :class="{ 'logs__chevron--open': logsOpen }" aria-hidden="true">▸</span>
          <span class="logs__title">Logs</span>
          <span class="muted">{{ logs.length }} line{{ logs.length === 1 ? '' : 's' }}</span>
        </button>
        <div v-show="logsOpen" ref="terminalEl" class="terminal__body terminal__body--embedded">
          <p v-if="logs.length === 0" class="terminal__empty">No log output yet.</p>
          <p v-for="(line, index) in logs" :key="index" class="line" :class="`line--${line.stream}`">
            <span class="line__time">{{ formatTime(line.ts) }}</span>
            <span class="line__stream">{{ line.stream }}</span>
            <span class="line__text">{{ line.text }}</span>
          </p>
        </div>
      </section>
    </template>
  </section>
</template>
