import { OLLAMA_REGISTRY_URL } from '@/lib/constants.js'

export interface ModelReference {
  name: string
  tag: string
}

export function parseModelReference(model: string): ModelReference {
  const trimmed = model.trim()
  const separator = trimmed.lastIndexOf(':')
  if (separator === -1) {
    return { name: trimmed, tag: 'latest' }
  }
  const tag = trimmed.slice(separator + 1)
  return { name: trimmed.slice(0, separator), tag: tag || 'latest' }
}

export function registryManifestUrl(model: string): string {
  const { name, tag } = parseModelReference(model)
  const repository = name.includes('/') ? name : `library/${name}`
  return `${OLLAMA_REGISTRY_URL}/v2/${repository}/manifests/${tag}`
}

export function normalizeDigest(digest: string | null | undefined): string | null {
  if (!digest) {
    return null
  }
  const normalized = digest.trim().toLowerCase().replace(/^sha256:/, '')
  return normalized || null
}

export function isModelOutdated(localDigest: string | null | undefined, remoteDigest: string | null | undefined): boolean {
  const local = normalizeDigest(localDigest)
  const remote = normalizeDigest(remoteDigest)
  if (!local || !remote) {
    return false
  }
  return local !== remote
}
