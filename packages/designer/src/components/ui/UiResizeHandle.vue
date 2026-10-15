<script setup lang="ts">
import { ref } from 'vue'
import type { ResizeStepEvent } from '../../lib/panel-layout'

/**
 * A focusable separator that reports resize gestures. It owns pointer capture,
 * keyboard mapping, and the accessibility surface, but holds no layout state:
 * the parent (see `composables/useWorkspaceLayout.ts`) translates gestures into panel sizes.
 *
 * `orientation` is the separator's own orientation for `aria-orientation`:
 * `vertical` between columns (left/right panels), `horizontal` between rows
 * (the source panel). A `corner` variant allows both arrow axes.
 */
const props = withDefaults(defineProps<{
  orientation: 'vertical' | 'horizontal'
  label: string
  now: number
  min: number
  max: number
  variant?: 'edge' | 'corner'
  disabled?: boolean
}>(), { variant: 'edge' })

const emit = defineEmits<{
  pointerStart: [PointerEvent]
  pointerMove: [PointerEvent]
  pointerEnd: []
  step: [ResizeStepEvent]
  reset: []
}>()

const dragging = ref(false)
let pointerId: number | undefined

function onPointerDown(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return
  event.preventDefault()
  dragging.value = true
  pointerId = event.pointerId
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('pointerStart', event)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== pointerId) return
  emit('pointerMove', event)
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return
  dragging.value = false
  pointerId = undefined
  emit('pointerEnd')
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  const horizontal = props.orientation === 'vertical'
  let axis: ResizeStepEvent['axis'] = horizontal ? 'x' : 'y'
  let direction: -1 | 1
  switch (event.key) {
    case 'ArrowRight': direction = 1; axis = 'x'; break
    case 'ArrowLeft': direction = -1; axis = 'x'; break
    case 'ArrowDown': direction = 1; axis = 'y'; break
    case 'ArrowUp': direction = -1; axis = 'y'; break
    case 'Enter': event.preventDefault(); onReset(); return
    default: return
  }
  if (props.variant === 'edge' && axis !== (horizontal ? 'x' : 'y')) return
  event.preventDefault()
  emit('step', { axis, direction, large: event.shiftKey })
}

function onReset(): void {
  if (!props.disabled) emit('reset')
}
</script>

<template>
  <div
    class="ui-resize-handle"
    :class="[`ui-resize-handle--${orientation}`, { 'ui-resize-handle--corner': variant === 'corner', 'ui-resize-handle--active': dragging }]"
    role="separator"
    :aria-orientation="variant === 'edge' ? orientation : undefined"
    :aria-label="label"
    :aria-valuenow="Math.round(now)"
    :aria-valuemin="Math.round(min)"
    :aria-valuemax="Math.round(max)"
    :tabindex="disabled ? undefined : 0"
    :aria-disabled="disabled || undefined"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKeydown"
    @dblclick="onReset"
  />
</template>

<style scoped>
@layer ui {
  .ui-resize-handle {
    position: absolute;
    z-index: 6;
    touch-action: none;
  }
  .ui-resize-handle::before {
    content: '';
    position: absolute;
    background: transparent;
    transition: background .12s ease;
  }
  .ui-resize-handle:hover::before,
  .ui-resize-handle:focus-visible::before,
  .ui-resize-handle--active::before { background: var(--selection); }
  .ui-resize-handle:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -1px; }

  .ui-resize-handle--vertical { top: 0; bottom: 0; width: 7px; cursor: col-resize; }
  .ui-resize-handle--horizontal { left: 0; right: 0; height: 7px; cursor: row-resize; }
  .ui-resize-handle--vertical::before { top: 0; bottom: 0; left: 3px; width: 1px; }
  .ui-resize-handle--horizontal::before { left: 0; right: 0; top: 3px; height: 1px; }

  .ui-resize-handle--corner { top: auto; width: 11px; height: 11px; }
  .ui-resize-handle--corner::before { inset: 3px; width: auto; height: auto; }
}
</style>
