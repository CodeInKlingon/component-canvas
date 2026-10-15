import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type {
  DesignerAttribute,
  DesignerComponentMetadata,
  DesignerDocument,
  DesignerDocumentSummary,
  DesignerFrameworkClientMetadata,
  DesignerNode,
  DesignerPropMetadata,
  DesignerStyleRule,
} from '@vue-designer/shared'
import type { ComponentGroup } from '../lib/component-palette'
import type { NativeElementMetadata } from '../lib/native-elements'
import type SourceEditor from '../components/SourceEditor.vue'

/**
 * The editor state and actions that docked tools need. `EditorScreen` builds one
 * reactive context and `provide`s it; each tool `inject`s only the fields it uses.
 * New tools extend this interface instead of threading props through the dock, so
 * registering a tool stays a one-file change.
 */
export interface EditorContext {
  // Documents and navigation
  path: ComputedRef<string>
  documents: Ref<DesignerDocumentSummary[]>
  documentOptions: ComputedRef<{ value: string; label: string }[]>
  switchDocument(path: string): void
  showDesigns(): void
  loadDocuments(): void
  loading: Ref<boolean>
  documentMissing: Ref<boolean>
  activeDocument: Ref<DesignerDocument | null>
  framework: Ref<DesignerFrameworkClientMetadata | null>
  readOnly: boolean

  // Document tree
  selectNode(node: DesignerNode, revealInSource?: boolean): void
  collapsedIds: Ref<ReadonlySet<string>>
  selectedNodeId: Ref<string | null>
  selectedNode: ComputedRef<DesignerNode | null>
  dragKind: ComputedRef<'component' | 'node' | null>
  draggedNode: Ref<DesignerNode | null>
  toggleCollapse(node: DesignerNode): void
  startNodeDrag(node: DesignerNode): void
  endTreeDrag(): void
  handleTreeDrop(target: DesignerNode, position: 'before' | 'inside' | 'after'): void
  openContextMenu(event: MouseEvent, node: DesignerNode): void

  // Component palette
  components: Ref<DesignerComponentMetadata[]>
  componentQuery: Ref<string>
  componentGroups: ComputedRef<ComponentGroup[]>
  canContainChildren(node: DesignerNode | null): boolean
  startComponentDrag(event: DragEvent, component: DesignerComponentMetadata): void
  startNativeDrag(event: DragEvent, element: NativeElementMetadata): void
  insertComponent(component: DesignerComponentMetadata): void
  insertNative(element: NativeElementMetadata): void
  nativeElements: NativeElementMetadata[]

  // Props inspector
  inspectorLocked: ComputedRef<boolean>
  duplicateSelectedNode(): void
  removeSelectedNode(): void
  updateSelectedText(event: Event): void
  selectedMetadataProps: ComputedRef<DesignerPropMetadata[]>
  selectedComponent: ComputedRef<DesignerComponentMetadata | null>
  selectedAttribute(name: string): DesignerAttribute | undefined
  propValue(prop: DesignerPropMetadata): string
  propChecked(prop: DesignerPropMetadata): boolean
  propIsExpression(prop: DesignerPropMetadata): boolean
  updateComponentProp(prop: DesignerPropMetadata, event: Event): void
  clearComponentProp(prop: DesignerPropMetadata): void
  isMetadataProp(name: string): boolean
  updateSelectedAttribute(name: string, event: Event): void

  // Style inspector
  styleRules: Ref<DesignerStyleRule[]>
  activeStyleRule: ComputedRef<DesignerStyleRule | null>
  activeStyleSelector: Ref<string>
  styleValue(property: string): string
  styleSelector(): string
  updateStyle(property: string, event: Event): void
  styleControls: { group: string; properties: string[] }[]
  styleOptions: Record<string, string[]>
  computedStyles: Ref<Record<string, string>>

  // Source editor
  source: Ref<string>
  updateSource(value: Event | string): void
  commitSourceEdit(): void
  syncSelectionFromSource(offset: number): void
  sourceEditor: Ref<InstanceType<typeof SourceEditor> | null>
}

export const editorContextKey: InjectionKey<EditorContext> = Symbol('vue-designer:editor-context')
