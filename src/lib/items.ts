import type { NamedItem } from '@/lib/naming.js'

export interface ItemStore<T extends NamedItem> {
  list(): Promise<T[]>
  save(item: T): Promise<void>
  remove(id: string): Promise<void>
}

export interface ItemSource<T extends NamedItem> {
  readonly items: T[]
  save(item: T): Promise<void>
  remove(id: string): Promise<void>
}
