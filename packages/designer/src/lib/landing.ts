import type { DesignerDocumentSummary } from '@component-canvas/shared'

export interface DocumentFolder {
  /** Root-relative folder path; empty for the project root. */
  path: string
  /** The document root containing this folder. */
  root: string
  /** Folder path relative to its root; empty for the root itself. */
  relative: string
  documents: DesignerDocumentSummary[]
}

export function documentFolder(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

function containingRoot(folder: string, roots: string[]): string {
  return roots
    .filter((root) => !root || folder === root || folder.startsWith(`${root}/`))
    .sort((a, b) => b.length - a.length)[0] ?? ''
}

export function groupDocuments(documents: DesignerDocumentSummary[], roots: string[], query = ''): DocumentFolder[] {
  const term = query.trim().toLowerCase()
  const folders = new Map<string, DocumentFolder>()
  for (const document of documents) {
    if (term && !document.name.toLowerCase().includes(term) && !document.path.toLowerCase().includes(term)) continue
    const path = documentFolder(document.path)
    let folder = folders.get(path)
    if (!folder) {
      const root = containingRoot(path, roots)
      folder = { path, root, relative: root ? path.slice(root.length + 1) : path, documents: [] }
      folders.set(path, folder)
    }
    folder.documents.push(document)
  }
  for (const folder of folders.values()) folder.documents.sort((a, b) => a.name.localeCompare(b.name))
  return [...folders.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/** Folders offered when creating a document: each document root plus existing document folders. */
export function creatableFolders(documents: DesignerDocumentSummary[], roots: string[]): string[] {
  return [...new Set([...roots, ...documents.map((document) => documentFolder(document.path))])].sort()
}

export const documentNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function formatModified(modified: number | undefined, now = Date.now()): string {
  if (modified === undefined) return ''
  const elapsed = modified - now
  for (const [unit, size] of units) {
    if (Math.abs(elapsed) >= size) return relativeTime.format(Math.round(elapsed / size), unit)
  }
  return 'just now'
}
