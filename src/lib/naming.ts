export interface NamedItem {
  id: string
  name: string
}

export interface NameRules {
  noun: string
  invalidMessage: string
  isValid?: (name: string) => boolean
}

export const ITEM_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export function isValidItemName(name: string): boolean {
  return ITEM_NAME_PATTERN.test(name)
}

export function uniqueName(base: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => {
    return n.toLowerCase()
  }))
  if (!taken.has(base.toLowerCase())) {
    return base
  }
  let index = 2
  while (taken.has(`${base}-${index}`.toLowerCase())) {
    index++
  }
  return `${base}-${index}`
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function validateItemName(name: string, id: string, others: NamedItem[], rules: NameRules): string | null {
  const isValid = rules.isValid ?? isValidItemName
  if (!isValid(name)) {
    return rules.invalidMessage
  }
  const lower = name.toLowerCase()
  const duplicate = others.some((o) => {
    return o.id !== id && o.name.toLowerCase() === lower
  })
  if (duplicate) {
    return `A ${rules.noun} named "${name}" already exists`
  }
  return null
}
