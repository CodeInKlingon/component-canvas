<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'info' | 'success' | 'warning'
}>(), {
  tone: 'info',
})
</script>

<template>
  <span class="notice-tag" :class="tone"><slot /></span>
</template>

<style scoped>
.notice-tag { display: inline-flex; border: 1px solid currentColor; border-radius: 4px; padding: 2px 6px; font-size: 12px; font-weight: 600; }
.info { color: #1d4ed8; }
.success { color: #15803d; }
.warning { color: #b45309; }
</style>
