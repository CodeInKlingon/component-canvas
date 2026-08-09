<script setup lang="ts">
withDefaults(defineProps<{
  count?: number
  subtle?: boolean
  accent?: string
}>(), {
  count: 0,
  subtle: false,
  accent: '#35502d',
})
</script>

<template>
  <span class="badge" :class="{ subtle }" :style="{ color: accent }"><slot /> <b v-if="count">{{ count }}</b></span>
</template>

<style scoped>
.badge { display: inline-flex; border-radius: 999px; background: #dcebcf; color: #35502d; padding: 6px 10px; font-size: 12px; font-weight: 700; }
.badge.subtle { opacity: .65; }
.badge b { margin-left: 5px; }
</style>
