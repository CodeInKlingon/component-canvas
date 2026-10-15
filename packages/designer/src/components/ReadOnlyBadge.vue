<script setup lang="ts">
import { Eye } from '@lucide/vue'
import UiBadge from './ui/UiBadge.vue'
</script>

<template>
  <UiBadge tone="warning" size="md" title="This build is read-only. Run the dev server to edit designs."><Eye :size="14" />Read-only</UiBadge>
</template>
