<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@pierre/diffs/edit'
import type { File } from '@pierre/diffs'
import { offsetAt, positionAt } from './source-position'

const props = defineProps<{ source: string; disabled?: boolean }>()
const emit = defineEmits<{
  input: [source: string]
  blur: []
  cursor: [offset: number]
}>()

const mount = ref<HTMLElement | null>(null)
const cursorOffset = ref(0)
const loading = ref(true)
let editor: Editor<unknown> | undefined
let file: File<unknown> | undefined
let detach: (() => void) | undefined
let disposed = false

const cursorPosition = computed(() => {
  const before = props.source.slice(0, cursorOffset.value)
  const lines = before.split('\n')
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
})

function syncCursor(): void {
  const selection = editor?.getState().selections?.at(-1)
  if (!selection) return
  cursorOffset.value = offsetAt(editor?.getText() ?? props.source, selection.end)
  emit('cursor', cursorOffset.value)
}

onMounted(async () => {
  const host = mount.value
  if (!host) return
  const [{ File: DiffsFile }, { Editor: DiffsEditor }] = await Promise.all([
    import('@pierre/diffs'),
    import('@pierre/diffs/edit'),
  ])
  if (disposed) return

  editor = new DiffsEditor({
    onChange(next) {
      emit('input', next.contents)
      queueMicrotask(syncCursor)
    },
    onBlur() {
      emit('blur')
    },
  })
  file = new DiffsFile({
    disableFileHeader: true,
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    themeType: 'dark',
    useTokenTransformer: true,
    overflow: 'scroll',
  })
  file.render({ file: { name: 'document.vue', contents: props.source, lang: 'vue' }, containerWrapper: host })
  detach = editor.edit(file)
  host.addEventListener('keyup', syncCursor)
  host.addEventListener('pointerup', syncCursor)
  loading.value = false
})

watch(() => props.source, (source) => {
  const current = editor?.getText()
  if (current === undefined || current === source) return
  const end = positionAt(current, current.length)
  editor?.applyEdits([{ range: { start: { line: 0, character: 0 }, end }, newText: source }])
})

onBeforeUnmount(() => {
  disposed = true
  mount.value?.removeEventListener('keyup', syncCursor)
  mount.value?.removeEventListener('pointerup', syncCursor)
  detach?.()
  file?.cleanUp()
})

function focus(): void {
  editor?.focus()
}

function setSelectionRange(start: number, end: number): void {
  const current = editor?.getText() ?? props.source
  editor?.setSelections([{
    start: positionAt(current, start),
    end: positionAt(current, end),
    direction: start === end ? 'none' : 'forward',
  }])
  cursorOffset.value = end
}

defineExpose({ focus, setSelectionRange })
</script>

<template>
  <div class="source-editor-shell">
    <div ref="mount" class="source-editor-mount" :aria-busy="loading">
      <div v-if="loading" class="source-editor-loading">Loading source editor...</div>
    </div>
    <div class="source-editor-status">
      <span>Vue SFC</span>
      <span>Ln {{ cursorPosition.line }}, Col {{ cursorPosition.column }}</span>
    </div>
  </div>
</template>
