#!/usr/bin/env node
// Bumps the version of every publishable @component-canvas/* package in lockstep.
//
// The four packages reference each other with the workspace:* protocol and are
// released together, so their versions must always match. The example package
// and the workspace root are private and are never touched.
//
// Usage:
//   node scripts/version-bump.mjs <version>
//   node scripts/version-bump.mjs <major|minor|patch|premajor|preminor|prepatch|prerelease>
//   node scripts/version-bump.mjs patch --dry-run
//
// Options:
//   --dry-run   Print the change without writing any file.
//   --help      Show this message.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIRS = [
  'packages/shared',
  'packages/vue',
  'packages/designer',
  'packages/vite-plugin',
]

const BUMP_TYPES = new Set([
  'major',
  'minor',
  'patch',
  'premajor',
  'preminor',
  'prepatch',
  'prerelease',
])

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

function parse(version) {
  const match = version.trim().match(SEMVER)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ?? '',
  }
}

function format(parts) {
  const base = `${parts.major}.${parts.minor}.${parts.patch}`
  const pre = parts.prerelease.length ? `-${parts.prerelease.join('.')}` : ''
  const build = parts.build ? `+${parts.build}` : ''
  return base + pre + build
}

function bumpPrerelease(prerelease) {
  if (prerelease.length === 0) return ['0']
  const next = [...prerelease]
  const last = next[next.length - 1]
  if (/^\d+$/.test(last)) next[next.length - 1] = String(Number(last) + 1)
  else next.push('0')
  return next
}

function computeTarget(current, spec) {
  const parsed = parse(spec)
  if (parsed) return format({ ...parsed, prerelease: parsed.prerelease })

  const { major, minor, patch, prerelease, build } = current
  switch (spec) {
    case 'major':
      return format({ major: major + 1, minor: 0, patch: 0, prerelease: [], build: '' })
    case 'minor':
      return format({ major, minor: minor + 1, patch: 0, prerelease: [], build: '' })
    case 'patch':
      return format({ major, minor, patch: patch + 1, prerelease: [], build: '' })
    case 'premajor':
      return format({ major: major + 1, minor: 0, patch: 0, prerelease: ['0'], build })
    case 'preminor':
      return format({ major, minor: minor + 1, patch: 0, prerelease: ['0'], build })
    case 'prepatch':
      return format({ major, minor, patch: patch + 1, prerelease: ['0'], build })
    case 'prerelease':
      return prerelease.length
        ? format({ major, minor, patch, prerelease: bumpPrerelease(prerelease), build })
        : format({ major, minor, patch: patch + 1, prerelease: ['0'], build })
    default:
      return null
  }
}

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const positional = args.filter((arg) => !arg.startsWith('--'))

if (args.includes('--help') || positional.length === 0) {
  console.log(
    [
      'Usage: node scripts/version-bump.mjs <version|bump> [--dry-run]',
      '',
      '  <version>  Explicit semver, e.g. 0.2.0 or 0.2.0-beta.1',
      '  <bump>     major | minor | patch | premajor | preminor | prepatch | prerelease',
      '',
      'Examples:',
      '  node scripts/version-bump.mjs 0.2.0',
      '  node scripts/version-bump.mjs minor',
      '  node scripts/version-bump.mjs prepatch --dry-run',
    ].join('\n'),
  )
  process.exit(positional.length === 0 ? 1 : 0)
}

const spec = positional[0]
if (positional.length > 1) fail(`expected a single version argument, got: ${positional.join(', ')}`)
if (!parse(spec) && !BUMP_TYPES.has(spec)) {
  fail(`"${spec}" is not a valid semver version or bump type`)
}

const manifests = PACKAGE_DIRS.map((dir) => {
  const file = path.join(root, dir, 'package.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  return { dir, file, json }
})

const current = manifests[0].json.version
if (!parse(current)) fail(`current version "${current}" is not valid semver`)

const mismatched = manifests.filter((m) => m.json.version !== current)
if (mismatched.length > 0) {
  const detail = mismatched.map((m) => `${m.json.name}@${m.json.version}`).join(', ')
  fail(`package versions are out of sync with ${current}: ${detail}`)
}

const target = computeTarget(parse(current), spec)
if (!parse(target)) fail(`computed an invalid target version: ${target}`)
if (target === current) fail(`already at ${current}; nothing to do`)

console.log(dryRun ? `[dry-run] ${current} -> ${target}` : `${current} -> ${target}`)
for (const manifest of manifests) {
  const { name } = manifest.json
  console.log(`  ${name}  ${manifest.json.version} -> ${target}`)
  if (!dryRun) {
    manifest.json.version = target
    writeFileSync(manifest.file, JSON.stringify(manifest.json, null, 2) + '\n')
  }
}

console.log(
  dryRun
    ? '\nNo files written. Re-run without --dry-run to apply.'
    : `\nUpdated ${manifests.length} packages. Remember to update the lockfile (pnpm install) and commit.`,
)
