<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: string
  trend?: 'up' | 'down' | 'neutral'
}>(), {
  trend: 'neutral',
})
</script>

<template>
  <article class="metric-highlight" :data-trend="trend">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
    <small v-if="trend !== 'neutral'">{{ trend === 'up' ? 'Trending up' : 'Trending down' }}</small>
  </article>
</template>

<style scoped>
.metric-highlight {
  display: grid;
  gap: 6px;
  padding: 18px;
  border: 1px solid #d7ded2;
  border-radius: 14px;
  background: #f7f9f4;
}

.metric-highlight span,
.metric-highlight small {
  color: #64705f;
  font-size: 12px;
}

.metric-highlight strong {
  color: #24301f;
  font-size: 28px;
}

.metric-highlight[data-trend='up'] small { color: #287a42; }
.metric-highlight[data-trend='down'] small { color: #b4473a; }
</style>
