<script setup lang="ts">
defineProps<{ number: string; title: string }>()
</script>

<template>
  <article class="card">
    <span>{{ number }}</span>
    <h2>{{ title }}</h2>
    <p><slot /></p>
  </article>
</template>

<style scoped>
.card { padding: 25px; border: 1px solid #d3d4cb; border-radius: 18px; background: #faf9f4; }
.card span { color: #6b7567; font-size: 12px; font-weight: 700; }
.card h2 { margin: 38px 0 8px; font-size: 20px; }
.card p { margin: 0; color: #697066; line-height: 1.6; font-size: 14px; }
</style>
