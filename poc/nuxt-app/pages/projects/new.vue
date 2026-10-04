<script setup lang="ts">
import {
  useManager,
  statusLabel,
  isTransientStatus,
  type LogLine,
  type Project,
  type ProjectStatus,
} from '~/composables/useManager'

const { createProject, getProject, subscribeProject } = useManager()

useHead({ title: 'New project · Kindling Preview PoC' })

const MAX_LOG_LINES = 1000

const step = ref<1 | 2 | 3>(1)
const name = ref('my-app')
const creating = ref(false)
const errorMessage = ref('')
const project = ref<Project | null>(null)
const logs = ref<LogLine[]>([])

const terminalEl = ref<HTMLElement | null>(null)
const reachedIndex = ref(-1)

let cleanup: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const STEPS: { status: ProjectStatus; label: string; description: string }[] = [
  { status: 'provisioning', label: 'Provision microVM', description: 'Allocate an isolated kindling microVM.' },
  { status: 'installing', label: 'Install dependencies', description: 'Install the bundled sample project.' },
  { status: 'starting', label: 'Start dev server', description: 'Boot the Vue + Vite preview server.' },
  { status: 'ready', label: 'Ready', description: 'Preview is live.' },
]

const trimmedName = computed(() => name.value.trim())
const canSubmit = computed(() => trimmedName.value.length > 0 && !creating.value)

const activeIndex = computed(() => {
  if (!project.value) return -1
  return STEPS.findIndex((s) => s.status === project.value!.status)
})

watch(
  project,
  (p: Project | null) => {
    if (!p) return
    const idx = STEPS.findIndex((s) => s.status === p.status)
    if (idx > reachedIndex.value) reachedIndex.value = idx
  },
  { immediate: true },
)

watch(
  () => logs.value.length,
  async () => {
    await nextTick()
    if (terminalEl.value) terminalEl.value.scrollTop = terminalEl.value.scrollHeight
  },
)

function stepState(index: number): 'done' | 'active' | 'pending' {
  if (reachedIndex.value > index) return 'done'
  if (reachedIndex.value === index) return 'active'
  return 'pending'
}

function pushLog(line: LogLine) {
  logs.value.push(line)
  if (logs.value.length > MAX_LOG_LINES) logs.value.splice(0, logs.value.length - MAX_LOG_LINES)
}

function stopTracking() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (cleanup) {
    cleanup()
    cleanup = null
  }
}

function handleStatus(p: Project) {
  if (p.error) errorMessage.value = p.error
  if (p.status === 'ready') {
    stopTracking()
    step.value = 3
  }
}

function startTracking() {
  if (!project.value) return
  const id = project.value.id

  cleanup = subscribeProject(id, {
    onStatus: (p) => {
      project.value = p
      handleStatus(p)
    },
    onDone: (p) => {
      project.value = p
      handleStatus(p)
    },
    onLog: pushLog,
    onError: (message) => {
      errorMessage.value = message
    },
    // Reconnection is handled by the browser; the 2s poll below is the fallback.
    onConnectionError: () => {},
  })

  pollTimer = setInterval(async () => {
    try {
      const p = await getProject(id)
      project.value = p
      handleStatus(p)
    } catch {
      // Ignore transient polling failures; the next tick retries.
    }
  }, 2000)
}

async function submit() {
  if (!canSubmit.value) return
  creating.value = true
  errorMessage.value = ''
  logs.value = []
  reachedIndex.value = -1
  try {
    const created = await createProject(trimmedName.value)
    project.value = created
    step.value = 2
    startTracking()
  } catch (err) {
    errorMessage.value = (err as Error).message
  } finally {
    creating.value = false
  }
}

function startAnother() {
  stopTracking()
  step.value = 1
  name.value = 'my-app'
  creating.value = false
  errorMessage.value = ''
  project.value = null
  logs.value = []
  reachedIndex.value = -1
}

onBeforeUnmount(stopTracking)
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <p class="crumbs"><NuxtLink to="/">Projects</NuxtLink> <span>/</span> New project</p>
        <h1 class="page-title">Onboard an application</h1>
        <p class="page-subtitle">
          We load a bundled Vue + Vite sample into an isolated microVM, install its dependencies, and start a dev server.
        </p>
      </div>
    </header>

    <ol class="wizard__steps">
      <li :class="`wizard__step wizard__step--${step === 1 ? 'active' : 'done'}`">1. Name</li>
      <li :class="`wizard__step wizard__step--${step === 2 ? 'active' : step > 2 ? 'done' : 'pending'}`">2. Provision</li>
      <li :class="`wizard__step wizard__step--${step === 3 ? 'active' : 'pending'}`">3. Ready</li>
    </ol>

    <!-- Step 1: name -->
    <div v-if="step === 1" class="panel">
      <h2 class="panel__title">Name your project</h2>
      <p class="panel__text">
        Choose a friendly name. A bundled Vue + Vite sample will be loaded into a fresh, isolated microVM.
      </p>

      <div class="field">
        <label class="label" for="project-name">Project name</label>
        <input
          id="project-name"
          v-model="name"
          class="input"
          type="text"
          placeholder="my-app"
          autocomplete="off"
          spellcheck="false"
          @keyup.enter="submit"
        >
        <p class="hint">Lowercase names such as <code>my-app</code> work best.</p>
      </div>

      <p class="note">
        Onboarding provisions a microVM, installs dependencies, and starts a Vite dev server. This can take a moment.
      </p>

      <div v-if="errorMessage" class="alert alert--error">{{ errorMessage }}</div>

      <div class="actions">
        <NuxtLink to="/" class="btn btn--ghost">Cancel</NuxtLink>
        <button type="button" class="btn btn--primary" :disabled="!canSubmit" @click="submit">
          <span v-if="creating" class="spinner spinner--xs" aria-hidden="true" />
          {{ creating ? 'Creating…' : 'Create & provision' }}
        </button>
      </div>
    </div>

    <!-- Step 2: provisioning -->
    <div v-else-if="step === 2" class="panel">
      <h2 class="panel__title">Provisioning {{ project?.name || trimmedName }}</h2>
      <p class="panel__text">
        Status: <span class="badge" :class="`badge--${project?.status || 'provisioning'}`">
          {{ project ? statusLabel(project.status) : 'Provisioning' }}
        </span>
      </p>

      <ol class="stepper">
        <li v-for="(entry, index) in STEPS" :key="entry.status" :class="`step step--${stepState(index)}`">
          <span class="step__marker" aria-hidden="true">
            <span v-if="stepState(index) === 'done'">✓</span>
            <span v-else-if="stepState(index) === 'active' && !isTransientStatus(entry.status)">✓</span>
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="step__body">
            <span class="step__label">{{ entry.label }}</span>
            <span class="step__desc">{{ entry.description }}</span>
          </span>
        </li>
      </ol>

      <div v-if="errorMessage" class="alert alert--error">
        <strong>Provisioning error.</strong> {{ errorMessage }}
      </div>

      <div class="terminal">
        <div class="terminal__head">
          <span>Live logs</span>
          <span class="mono">{{ logs.length }} line{{ logs.length === 1 ? '' : 's' }}</span>
        </div>
        <div ref="terminalEl" class="terminal__body">
          <p v-if="logs.length === 0" class="terminal__empty">Waiting for log output…</p>
          <p v-for="(line, index) in logs" :key="index" class="line" :class="`line--${line.stream}`">
            <span class="line__time">{{ line.ts }}</span>
            <span class="line__stream">{{ line.stream }}</span>
            <span class="line__text">{{ line.text }}</span>
          </p>
        </div>
      </div>

      <div class="actions">
        <NuxtLink to="/" class="btn btn--ghost">Back to projects</NuxtLink>
      </div>
    </div>

    <!-- Step 3: ready -->
    <div v-else class="panel panel--success">
      <h2 class="panel__title">🎉 {{ project?.name || trimmedName }} is ready</h2>
      <p class="panel__text">
        The microVM is running the Vue + Vite dev server. Open the project to view the live preview.
      </p>

      <dl v-if="project" class="summary">
        <div>
          <dt>Status</dt>
          <dd><span class="badge badge--ready">{{ statusLabel(project.status) }}</span></dd>
        </div>
        <div>
          <dt>Machine</dt>
          <dd class="mono">{{ project.machine || '—' }}</dd>
        </div>
        <div>
          <dt>Preview port</dt>
          <dd class="mono">{{ project.previewPort ?? '—' }}</dd>
        </div>
      </dl>

      <div class="actions">
        <button type="button" class="btn btn--ghost" @click="startAnother">Start another</button>
        <NuxtLink v-if="project" :to="`/projects/${project.id}`" class="btn btn--primary">
          Open project →
        </NuxtLink>
      </div>
    </div>
  </section>
</template>
