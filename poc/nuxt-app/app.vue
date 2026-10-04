<script setup lang="ts">
import { useManager } from '~/composables/useManager'

const { baseUrl, health } = useManager()

type ConnState = 'checking' | 'ok' | 'degraded' | 'down'

const state = ref<ConnState>('checking')
const managerVersion = ref('')
const kindlingVersion = ref('')
const detail = ref('')

const stateLabel = computed(() => {
  switch (state.value) {
    case 'checking':
      return 'Checking…'
    case 'ok':
      return 'Connected'
    case 'degraded':
      return 'Kindling unavailable'
    case 'down':
      return 'Manager unreachable'
  }
})

async function checkHealth() {
  state.value = 'checking'
  detail.value = ''
  try {
    const res = await health()
    managerVersion.value = res.manager?.version || ''
    kindlingVersion.value = res.kindling?.version || ''
    if (res.ok && res.kindling?.ok) {
      state.value = 'ok'
    } else if (res.ok) {
      state.value = 'degraded'
      detail.value = res.kindling?.error || 'Kindling is not available'
    } else {
      state.value = 'down'
      detail.value = 'Manager reported an unhealthy status'
    }
  } catch (err) {
    state.value = 'down'
    detail.value = (err as Error).message
  }
}

onMounted(checkHealth)

const connTitle = computed(() => {
  const parts = [`Manager ${baseUrl}`]
  if (managerVersion.value) parts.push(`manager v${managerVersion.value}`)
  if (kindlingVersion.value) parts.push(`kindling v${kindlingVersion.value}`)
  if (detail.value) parts.push(detail.value)
  return parts.join(' · ')
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="container app-header__inner">
        <NuxtLink to="/" class="brand">
          <span class="brand__mark" aria-hidden="true">🔥</span>
          <span class="brand__text">Kindling Preview PoC</span>
        </NuxtLink>

        <button
          type="button"
          class="conn"
          :class="`conn--${state}`"
          :title="connTitle"
          @click="checkHealth"
        >
          <span class="conn__dot" aria-hidden="true" />
          <span class="conn__text">{{ stateLabel }}</span>
        </button>
      </div>
    </header>

    <main class="app-main">
      <div class="container">
        <NuxtPage />
      </div>
    </main>

    <footer class="app-footer">
      <div class="container app-footer__inner">
        <span>Standalone Nuxt 3 proof of concept.</span>
        <span class="mono">{{ baseUrl }}</span>
      </div>
    </footer>
  </div>
</template>
