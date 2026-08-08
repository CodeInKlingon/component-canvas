<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'lime' | 'dark' }>(), { tone: 'lime' })
</script>

<template>
  <button class="button" :class="`button--${tone}`"><slot /></button>
</template>

<style scoped>
.button { border: 0; border-radius: 999px; padding: 12px 20px; font-weight: 700; cursor: pointer; }
.button--lime { background: #c8ff72; color: #182111; }
.button--dark { background: #1b211a; color: #f6f7f1; }
</style>
