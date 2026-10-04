<script setup lang="ts">
import { useManager, statusLabel, isTransientStatus, type Project } from '~/composables/useManager'

const { baseUrl, listProjects } = useManager()

const projects = ref<Project[]>([])
const loading = ref(true)
const errorMessage = ref('')

useHead({ title: 'Projects · Kindling Preview PoC' })

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    projects.value = await listProjects()
  } catch (err) {
    errorMessage.value = (err as Error).message
    projects.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">Projects</h1>
        <p class="page-subtitle">
          Onboard an application to provision an isolated microVM running a sample Vue + Vite dev server.
        </p>
      </div>
      <NuxtLink to="/projects/new" class="btn btn--primary">+ New project</NuxtLink>
    </header>

    <div v-if="loading" class="state" aria-busy="true">
      <span class="spinner" aria-hidden="true" />
      <p>Loading projects…</p>
    </div>

    <div v-else-if="errorMessage" class="state state--error">
      <h2 class="state__title">Can’t reach the manager</h2>
      <p class="state__text">{{ errorMessage }}</p>
      <p class="state__hint mono">Manager: {{ baseUrl }}</p>
      <button type="button" class="btn btn--primary" @click="load">Retry</button>
    </div>

    <div v-else-if="projects.length === 0" class="state state--empty">
      <h2 class="state__title">No projects yet</h2>
      <p class="state__text">
        Create your first project to spin up a kindling preview environment.
      </p>
      <NuxtLink to="/projects/new" class="btn btn--primary">+ New project</NuxtLink>
    </div>

    <ul v-else class="project-grid">
      <li v-for="project in projects" :key="project.id">
        <NuxtLink :to="`/projects/${project.id}`" class="project-card">
          <div class="project-card__top">
            <h2 class="project-card__title">{{ project.name }}</h2>
            <span class="badge" :class="`badge--${project.status}`">
              <span v-if="isTransientStatus(project.status)" class="spinner spinner--xs" aria-hidden="true" />
              {{ statusLabel(project.status) }}
            </span>
          </div>
          <p v-if="project.error" class="project-card__error">{{ project.error }}</p>
          <dl class="project-card__meta">
            <div>
              <dt>Created</dt>
              <dd>{{ formatTime(project.createdAt) }}</dd>
            </div>
            <div>
              <dt>Machine</dt>
              <dd class="mono">{{ project.machine || '—' }}</dd>
            </div>
          </dl>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
