import { OLLAMA_REGISTRY_URL } from '@/lib/constants.js'
import { isModelOutdated, normalizeDigest, parseModelReference, registryManifestUrl } from '@/lib/registry.js'

describe('registry', () => {
  describe('parseModelReference', () => {
    it('defaults the tag to latest', () => {
      expect(parseModelReference('gpt-oss')).toEqual({ name: 'gpt-oss', tag: 'latest' })
    })

    it('splits name and tag', () => {
      expect(parseModelReference('qwen3:8b')).toEqual({ name: 'qwen3', tag: '8b' })
    })

    it('splits on the last colon for namespaced models', () => {
      expect(parseModelReference('hf.co/user/repo:Q4_K_M')).toEqual({ name: 'hf.co/user/repo', tag: 'Q4_K_M' })
    })

    it('treats an empty tag as latest', () => {
      expect(parseModelReference('gemma4:')).toEqual({ name: 'gemma4', tag: 'latest' })
    })
  })

  describe('registryManifestUrl', () => {
    it('uses the library namespace for bare names', () => {
      expect(registryManifestUrl('gpt-oss:latest')).toBe(`${OLLAMA_REGISTRY_URL}/v2/library/gpt-oss/manifests/latest`)
    })

    it('keeps explicit namespaces', () => {
      expect(registryManifestUrl('hf.co/user/repo:Q4_K_M')).toBe(`${OLLAMA_REGISTRY_URL}/v2/hf.co/user/repo/manifests/Q4_K_M`)
    })
  })

  describe('normalizeDigest', () => {
    it('strips the sha256 prefix and lowercases', () => {
      expect(normalizeDigest('sha256:ABC123')).toBe('abc123')
    })

    it('trims whitespace', () => {
      expect(normalizeDigest('  abc123  ')).toBe('abc123')
    })

    it('returns null for empty input', () => {
      expect(normalizeDigest('')).toBeNull()
      expect(normalizeDigest(null)).toBeNull()
      expect(normalizeDigest(undefined)).toBeNull()
      expect(normalizeDigest('sha256:')).toBeNull()
    })
  })

  describe('isModelOutdated', () => {
    it('is false when either digest is missing', () => {
      expect(isModelOutdated(null, 'abc')).toBe(false)
      expect(isModelOutdated('abc', undefined)).toBe(false)
      expect(isModelOutdated('', '')).toBe(false)
    })

    it('is false when digests match modulo prefix and case', () => {
      expect(isModelOutdated('abc123', 'sha256:ABC123')).toBe(false)
    })

    it('is true when digests differ', () => {
      expect(isModelOutdated('c6eb396dbd59', 'dc35e8d9c606')).toBe(true)
    })
  })
})
