<script setup lang="ts">
defineProps<{ label: string; tone?: 'primary' | 'quiet' }>()
defineEmits<{ press: [] }>()
</script>

<template>
  <button><slot>{{ label }}</slot></button>
</template>
