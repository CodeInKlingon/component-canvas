import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties, type Ref } from 'vue'
import {
  clampPanelSize,
  collapsedBottomSize,
  collapsedPanelSize,
  keyboardResizeAmount,
  minCanvasHeight,
  panelBounds,
  panelMinSizes,
  panelResizeBehavior,
  resolveBreakpoint,
  resolvePanelSize,
  bottomDefaultFraction,
  bottomMax,
  type PanelId,
  type ResizeStepEvent,
} from '../lib/panel-layout'
import {
  activateTool,
  defaultDock,
  dockZones,
  hideTool as hideDockTool,
  moveToolBefore as moveDockToolBefore,
  setZoneCollapsed,
  visibleActiveTool,
  visibleTools,
  zoneAddOptions,
  zoneContaining,
  type DockLayout,
  type DockZone,
  type ToolId,
} from '../lib/dock-layout'
import {
  defaultPanelLayout,
  readPanelLayoutPreference,
  writePanelLayoutPreference,
} from '../services/layout-preference'

export type { ResizeStepEvent } from '../lib/panel-layout'

/** Props the parent spreads onto a `UiResizeHandle` with `v-bind`. */
export interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal'
  variant: 'edge' | 'corner'
  label: string
  now: number
  min: number
  max: number
  onPointerStart: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerEnd: () => void
  onStep: (event: ResizeStepEvent) => void
  onReset: () => void
}

export interface PanelToggleState {
  id: DockZone
  label: string
  collapsed: boolean
  disabled: boolean
}

export interface WorkspaceLayoutOptions {
  /** All registered tool ids, in display order (used by add/hidden menus). */
  allTools: readonly ToolId[]
  /** Tools currently available given framework capabilities and read-only state. */
  availableTools: () => ReadonlySet<ToolId>
}

type DragState =
  | { kind: 'edge'; id: PanelId; invert: boolean; startX: number; startY: number; startSize: number }
  | { kind: 'corner'; sideId: 'left' | 'right'; sideInvert: boolean; startX: number; startY: number; startSide: number; startBottom: number }

const panelLabels: Record<DockZone, string> = { left: 'left', right: 'right', bottom: 'bottom' }

/**
 * Owns the whole editor workspace layout: persisted panel sizes, dock zones, tool
 * placement, and collapse state. Preferred sizes are persisted while effective
 * sizes are clamped to the current container and viewport tier; docking is
 * data-driven so registered tools can be moved, hidden, and added freely.
 *
 * The composable never touches the preview: it only produces CSS variables and
 * tool placement, so the iframe, document, selection, and history are untouched.
 */
export function useWorkspaceLayout(options: WorkspaceLayoutOptions) {
  const stored = readPanelLayoutPreference()

  const preferred: Record<DockZone, Ref<number>> = {
    left: ref(stored?.leftWidth ?? defaultPanelLayout.leftWidth),
    right: ref(stored?.rightWidth ?? defaultPanelLayout.rightWidth),
    bottom: ref(stored?.bottomHeight ?? defaultPanelLayout.bottomHeight),
  }
  const dock = ref<DockLayout>(stored?.dock ?? defaultPanelLayout.dock)

  const workspaceRef = ref<HTMLElement | null>(null)
  const workspaceWidth = ref(0)
  const workspaceHeight = ref(0)
  const viewportWidth = ref(typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth)
  const resizing = ref(false)

  const breakpoint = computed(() => resolveBreakpoint(viewportWidth.value))
  const rightHidden = computed(() => breakpoint.value.rightHidden)
  const available = computed(() => options.availableTools())

  const layout = computed(() => {
    const bp = breakpoint.value
    const width = workspaceWidth.value
    const height = workspaceHeight.value

    const rightReserved = bp.rightHidden
      ? 0
      : clampPanelSize(preferred.right.value, { min: panelMinSizes.right, max: bp.rightMax })
    const leftBounds = panelBounds({
      containerSize: width,
      reservedSize: rightReserved,
      minSize: panelMinSizes.left,
      absoluteMaxSize: bp.leftMax,
      minContentSize: bp.minCanvasWidth,
    })
    const leftCollapsed = isCollapsed('left')
    const left = leftCollapsed ? collapsedPanelSize : clampPanelSize(preferred.left.value, leftBounds)

    const rightBounds = panelBounds({
      containerSize: width,
      reservedSize: leftCollapsed ? collapsedPanelSize : left,
      minSize: panelMinSizes.right,
      absoluteMaxSize: bp.rightMax,
      minContentSize: bp.minCanvasWidth,
    })
    const right = bp.rightHidden
      ? 0
      : isCollapsed('right')
        ? collapsedPanelSize
        : clampPanelSize(preferred.right.value, rightBounds)

    const bottomBounds = panelBounds({
      containerSize: height,
      reservedSize: 0,
      minSize: panelMinSizes.bottom,
      absoluteMaxSize: bottomMax,
      minContentSize: minCanvasHeight,
    })
    const derivedBottom = height > 0 ? Math.round(height * bottomDefaultFraction) : panelMinSizes.bottom
    const bottomPreferred = preferred.bottom.value > 0 ? preferred.bottom.value : derivedBottom
    const bottom = isCollapsed('bottom')
      ? collapsedBottomSize
      : clampPanelSize(bottomPreferred, bottomBounds)

    return { left, right, bottom, leftBounds, rightBounds, bottomBounds }
  })

  const style = computed<CSSProperties>(() => ({
    '--left-width': `${layout.value.left}px`,
    '--right-width': `${layout.value.right}px`,
    '--bottom-height': `${layout.value.bottom}px`,
  }))

  let persistTimer: number | undefined
  let observer: ResizeObserver | undefined

  function persist(): void {
    window.clearTimeout(persistTimer)
    persistTimer = undefined
    writePanelLayoutPreference({
      leftWidth: preferred.left.value,
      rightWidth: preferred.right.value,
      bottomHeight: preferred.bottom.value,
      dock: dock.value,
    })
  }

  function schedulePersist(): void {
    window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(persist, 250)
  }

  watch([preferred.left, preferred.right, preferred.bottom, dock], schedulePersist, { deep: true })

  function boundsFor(id: PanelId) {
    return id === 'left' ? layout.value.leftBounds : id === 'right' ? layout.value.rightBounds : layout.value.bottomBounds
  }

  function setPreferred(id: PanelId, value: number): void {
    preferred[id].value = Math.round(value)
  }

  let drag: DragState | null = null

  function startDrag(id: PanelId, event: PointerEvent): void {
    drag = {
      kind: 'edge',
      id,
      invert: panelResizeBehavior(id).invert,
      startX: event.clientX,
      startY: event.clientY,
      startSize: layout.value[id],
    }
    resizing.value = true
  }

  function startCorner(sideId: 'left' | 'right', event: PointerEvent): void {
    drag = {
      kind: 'corner',
      sideId,
      sideInvert: panelResizeBehavior(sideId).invert,
      startX: event.clientX,
      startY: event.clientY,
      startSide: layout.value[sideId],
      startBottom: layout.value.bottom,
    }
    resizing.value = true
  }

  function moveDrag(event: PointerEvent): void {
    const state = drag
    if (!state) return
    if (state.kind === 'edge') {
      const behavior = panelResizeBehavior(state.id)
      const delta = behavior.axis === 'y' ? event.clientY - state.startY : event.clientX - state.startX
      setPreferred(state.id, clampPanelSize(resolvePanelSize(state.startSize, delta, state.invert), boundsFor(state.id)))
      return
    }
    setPreferred(
      state.sideId,
      clampPanelSize(resolvePanelSize(state.startSide, event.clientX - state.startX, state.sideInvert), boundsFor(state.sideId)),
    )
    setPreferred(
      'bottom',
      clampPanelSize(resolvePanelSize(state.startBottom, event.clientY - state.startY, true), boundsFor('bottom')),
    )
  }

  function endDrag(): void {
    if (!drag) return
    drag = null
    resizing.value = false
    persist()
  }

  function stepPanel(id: PanelId, event: ResizeStepEvent): void {
    const amount = keyboardResizeAmount(event.direction, event.large)
    setPreferred(id, clampPanelSize(resolvePanelSize(layout.value[id], amount, panelResizeBehavior(id).invert), boundsFor(id)))
    persist()
  }

  function stepCorner(sideId: 'left' | 'right', event: ResizeStepEvent): void {
    if (event.axis === 'x') stepPanel(sideId, event)
    else stepPanel('bottom', event)
  }

  function resetPanel(id: PanelId): void {
    if (id === 'left') preferred.left.value = defaultPanelLayout.leftWidth
    else if (id === 'right') preferred.right.value = defaultPanelLayout.rightWidth
    else preferred.bottom.value = defaultPanelLayout.bottomHeight
    persist()
  }

  function handleProps(id: PanelId): ResizeHandleProps {
    const behavior = panelResizeBehavior(id)
    const bounds = boundsFor(id)
    return {
      orientation: behavior.axis === 'x' ? 'vertical' : 'horizontal',
      variant: 'edge',
      label: `Resize ${panelLabels[id]} panel`,
      now: layout.value[id],
      min: bounds.min,
      max: bounds.max,
      onPointerStart: (event) => startDrag(id, event),
      onPointerMove: moveDrag,
      onPointerEnd: endDrag,
      onStep: (event) => stepPanel(id, event),
      onReset: () => resetPanel(id),
    }
  }

  function cornerProps(sideId: 'left' | 'right'): ResizeHandleProps {
    const bounds = boundsFor(sideId)
    return {
      orientation: 'vertical',
      variant: 'corner',
      label: `Resize ${panelLabels[sideId]} and bottom panels`,
      now: layout.value[sideId],
      min: bounds.min,
      max: bounds.max,
      onPointerStart: (event) => startCorner(sideId, event),
      onPointerMove: moveDrag,
      onPointerEnd: endDrag,
      onStep: (event) => stepCorner(sideId, event),
      onReset: () => resetPanel(sideId),
    }
  }

  // --- Dock state ---

  function isCollapsed(zone: DockZone): boolean {
    return dock.value.collapsed[zone] || zoneIsEmpty(zone)
  }

  function rawCollapsed(zone: DockZone): boolean {
    return dock.value.collapsed[zone]
  }

  function zoneIsEmpty(zone: DockZone): boolean {
    return visibleTools(dock.value, zone, available.value).length === 0
  }

  function setCollapsed(zone: DockZone, value: boolean): void {
    dock.value = setZoneCollapsed(dock.value, zone, value)
    if (!value && zoneIsEmpty(zone)) {
      // Restoring an empty zone is meaningless; fall back to collapsed rather than a blank panel.
      dock.value = setZoneCollapsed(dock.value, zone, true)
    }
  }

  function toggleCollapsed(zone: DockZone): void {
    setCollapsed(zone, !isCollapsed(zone))
  }

  function zoneTools(zone: DockZone): ToolId[] {
    return visibleTools(dock.value, zone, available.value)
  }

  function activeTool(zone: DockZone): ToolId | null {
    return visibleActiveTool(dock.value, zone, available.value)
  }

  function isToolRevealed(toolId: ToolId): boolean {
    const zone = zoneContaining(dock.value, toolId)
    if (!zone || isCollapsed(zone)) return false
    return activeTool(zone) === toolId
  }

  function activate(zone: DockZone, toolId: ToolId): void {
    dock.value = activateTool(dock.value, zone, toolId)
    persist()
  }

  function move(toolId: ToolId, zone: DockZone, before: ToolId | null = null): void {
    dock.value = moveDockToolBefore(dock.value, toolId, zone, before)
    persist()
  }

  function hide(toolId: ToolId): void {
    dock.value = hideDockTool(dock.value, toolId)
    persist()
  }

  function addOptions(zone: DockZone): ToolId[] {
    return zoneAddOptions(dock.value, zone, options.allTools, available.value)
  }

  function reset(): void {
    preferred.left.value = defaultPanelLayout.leftWidth
    preferred.right.value = defaultPanelLayout.rightWidth
    preferred.bottom.value = defaultPanelLayout.bottomHeight
    dock.value = defaultDock()
    persist()
  }

  const panelToggles = computed<PanelToggleState[]>(() => dockZones.map((zone) => ({
    id: zone,
    label: panelLabels[zone],
    collapsed: rawCollapsed(zone),
    disabled: zoneIsEmpty(zone),
  })))

  function measure(): void {
    const element = workspaceRef.value
    if (!element) return
    workspaceWidth.value = Math.floor(element.clientWidth)
    workspaceHeight.value = Math.floor(element.clientHeight)
  }

  function handleViewportResize(): void {
    viewportWidth.value = window.innerWidth
  }

  onMounted(() => {
    viewportWidth.value = window.innerWidth
    measure()
    observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      workspaceWidth.value = Math.floor(entry.contentRect.width)
      workspaceHeight.value = Math.floor(entry.contentRect.height)
    })
    if (workspaceRef.value) observer.observe(workspaceRef.value)
    window.addEventListener('resize', handleViewportResize)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', handleViewportResize)
    window.clearTimeout(persistTimer)
  })

  return {
    // resize
    workspaceRef,
    style,
    resizing,
    rightHidden,
    handleProps,
    cornerProps,
    // panels
    isCollapsed,
    setCollapsed,
    toggleCollapsed,
    panelToggles,
    // dock
    zoneTools,
    activeTool,
    isToolRevealed,
    activate,
    move,
    hide,
    addOptions,
    isZoneEmpty: zoneIsEmpty,
    reset,
  }
}
