import { onUnmounted, ref } from 'vue'

export type DesignerRoute =
  | { name: 'landing' }
  | { name: 'editor'; path: string }

export function parseRoute(hash: string): DesignerRoute {
  const route = hash.replace(/^#/, '')
  if (route.startsWith('/edit/')) {
    try {
      const path = route.slice('/edit/'.length).split('/').map(decodeURIComponent).join('/')
      if (path) return { name: 'editor', path }
    } catch {
      // Malformed escapes fall back to the landing screen.
    }
  }
  return { name: 'landing' }
}

export function routeHash(route: DesignerRoute): string {
  return route.name === 'editor'
    ? `#/edit/${route.path.split('/').map(encodeURIComponent).join('/')}`
    : '#/'
}

/**
 * Tracks the hash route. `beforeLeave` may veto a navigation, in which case the previous
 * hash is restored without adding a history entry.
 */
export function useHashRoute(beforeLeave: (from: DesignerRoute, to: DesignerRoute) => boolean) {
  const route = ref<DesignerRoute>(parseRoute(location.hash))
  let currentHash = routeHash(route.value)

  function handleHashChange(): void {
    const next = parseRoute(location.hash)
    const nextHash = routeHash(next)
    if (nextHash === currentHash) return
    if (!beforeLeave(route.value, next)) {
      history.replaceState(history.state, '', currentHash)
      return
    }
    currentHash = nextHash
    route.value = next
  }

  function navigate(next: DesignerRoute): void {
    location.hash = routeHash(next)
  }

  window.addEventListener('hashchange', handleHashChange)
  onUnmounted(() => window.removeEventListener('hashchange', handleHashChange))
  return { route, navigate }
}
