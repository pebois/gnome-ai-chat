import type Gio from 'gi://Gio'

import { skillsStore } from '@/lib/db/skills.js'
import type { Skill } from '@/lib/db/types.js'
import type { ItemSource } from '@/lib/items.js'
import type { Provider } from '@/lib/providers/index.js'
import { isBuiltinSkill, mergeBuiltinSkills, resetSkill, skillDiffersFromDefault, sortSkills } from '@/lib/skills/index.js'

export class SkillsManager implements ItemSource<Skill> {
  public items: Skill[] = []
  public onChanged?: () => void

  private _provider: () => Provider

  constructor(provider: () => Provider) {
    this._provider = provider
  }

  public async load(): Promise<void> {
    const { added, skills } = mergeBuiltinSkills(await skillsStore.list())
    this.items = skills
    await skillsStore.saveMany(added)
  }

  public async save(skill: Skill): Promise<void> {
    if (!this.items.includes(skill)) {
      this.items.push(skill)
    }
    sortSkills(this.items)
    await skillsStore.save(skill)
    this.onChanged?.()
    await this.index()
  }

  public async remove(id: string): Promise<void> {
    const index = this.items.findIndex((s) => {
      return s.id === id
    })
    if (index === -1) {
      return
    }
    this.items.splice(index, 1)
    await skillsStore.remove(id)
    this.onChanged?.()
  }

  public async reset(id: string): Promise<void> {
    const skill = this.items.find((s) => {
      return s.id === id
    })
    if (skill && resetSkill(skill)) {
      await this.save(skill)
    }
  }

  public async resetAll(): Promise<void> {
    const modified = this.items.filter((skill) => {
      return skillDiffersFromDefault(skill)
    })
    for (const skill of modified) {
      resetSkill(skill)
    }
    sortSkills(this.items)
    await skillsStore.saveMany(modified)
    this.onChanged?.()
    await this.index()
  }

  public hasModifiedBuiltins(): boolean {
    return this.items.some((skill) => {
      return isBuiltinSkill(skill.id) && skillDiffersFromDefault(skill)
    })
  }

  public async index(force = false, cancellable?: Gio.Cancellable, onProgress?: (fraction: number) => void): Promise<void> {
    await skillsStore.indexSkills(this._provider(), this.items, force, cancellable, onProgress)
  }
}
