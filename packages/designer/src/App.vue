<script setup lang="ts">
import { provide, ref } from 'vue'
import EditorScreen from './pages/EditorScreen.vue'
import LandingScreen from './pages/LandingScreen.vue'
import { createServerHost, createStaticHost, hostKey, readDesignerMode, readOnlyKey } from './services/host'
import { useHashRoute } from './services/router'

const host = readDesignerMode(document) === 'readonly' ? createStaticHost() : createServerHost()
const readOnly = host.mode === 'readonly'
provide(hostKey, host)
provide(readOnlyKey, readOnly)

const editor = ref<InstanceType<typeof EditorScreen> | null>(null)
const { route, navigate } = useHashRoute((from) =>
  from.name !== 'editor' || !editor.value?.hasUnsavedChanges() || window.confirm('Discard unsaved changes?'))
</script>

<template>
  <EditorScreen v-if="route.name === 'editor'" ref="editor" :path="route.path" @navigate="navigate" />
  <LandingScreen v-else @navigate="navigate" />
</template>
