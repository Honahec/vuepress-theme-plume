import type { ComputedRef } from 'vue'
import type { GitContributor } from '../../shared/index.js'
import { useContributors as _useContributors } from '@vuepress/plugin-git/client'
import { computed } from 'vue'
import { isPlainObject } from 'vuepress/shared'
import { useData } from '../composables/data.js'
import { useThemeData } from './theme-data.js'

interface useContributorsResult {
  mode: ComputedRef<'inline' | 'block'>
  contributors: ComputedRef<GitContributor[]>
  hasContributors: ComputedRef<boolean>
}

type ExtendedGitContributor = GitContributor & {
  username?: string
  email?: string
}

export function useContributors(): useContributorsResult {
  const { frontmatter } = useData()
  const list = _useContributors()

  const theme = useThemeData()

  const mode = computed(() => {
    const config = theme.value.contributors
    if (isPlainObject(config))
      return config.mode || 'inline'
    return 'inline'
  })

  const contributors = computed(() => {
    const config = frontmatter.value.contributors ?? !!theme.value.contributors

    if (config === false)
      return []

    return normalizeContributors(list.value)
  })

  const hasContributors = computed(() => contributors.value.length > 0)

  return { mode, contributors, hasContributors }
}

function normalizeContributors(list: GitContributor[]): GitContributor[] {
  const map = new Map<string, GitContributor>()

  list.forEach((contributor, index) => {
    const username = resolveGitHubUsername(contributor)
    const normalized = { ...contributor }

    if (username)
      normalized.name = username

    const extended = contributor as ExtendedGitContributor
    const key = resolveKey(username, extended.email, contributor.name, index)
    const existing = map.get(key)

    if (!existing) {
      map.set(key, normalized)
      return
    }

    const merged: GitContributor = { ...normalized, ...existing }

    if (username && merged.name !== username)
      merged.name = username

    if (!merged.url)
      merged.url = normalized.url || existing.url

    if (!merged.avatar)
      merged.avatar = normalized.avatar || existing.avatar

    const existingCommits = (existing as { commits?: unknown }).commits
    const normalizedCommits = (normalized as { commits?: unknown }).commits
    if (typeof existingCommits === 'number' || typeof normalizedCommits === 'number') {
      const current = typeof existingCommits === 'number' ? existingCommits : 0
      const additional = typeof normalizedCommits === 'number' ? normalizedCommits : 0
      merged.commits = current + additional
    }

    map.set(key, merged)
  })

  return Array.from(map.values())
}

function resolveKey(username: string | undefined, email: string | undefined, name: string | undefined, index: number): string {
  if (username)
    return username.toLowerCase()
  if (email)
    return email.toLowerCase()
  if (name)
    return name.toLowerCase()
  return `anonymous-${index}`
}

function resolveGitHubUsername(contributor: GitContributor): string | undefined {
  const { username, url, email } = contributor as ExtendedGitContributor

  if (username)
    return username

  if (url) {
    const extracted = extractGitHubUsernameFromUrl(url)
    if (extracted)
      return extracted
  }

  if (email) {
    const extracted = extractGitHubUsernameFromEmail(email)
    if (extracted)
      return extracted
  }

  return undefined
}

function extractGitHubUsernameFromUrl(url: string): string | undefined {
  try {
    const { hostname, pathname } = new URL(url)
    if (!hostname.endsWith('github.com'))
      return undefined

    const segments = pathname.split('/').filter(Boolean)
    const [first, second] = segments

    if (!first)
      return undefined

    // handle standard profile url e.g. /username
    if (segments.length === 1)
      return first

    // handle app urls like /apps/dependabot
    if (first === 'apps' && second)
      return `${second}[bot]`

    // fallback to last segment if path includes extra parts
    return segments[segments.length - 1]
  }
  catch {
    return undefined
  }
}

function extractGitHubUsernameFromEmail(email: string): string | undefined {
  const match = email.match(/^(.+?)@users\.noreply\.github\.com$/i)
  if (!match)
    return undefined

  const local = match[1]
  const plusIndex = local.indexOf('+')
  if (plusIndex !== -1)
    return local.slice(plusIndex + 1)

  return local
}
