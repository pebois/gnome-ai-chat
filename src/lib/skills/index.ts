import type { Skill } from '@/lib/db/types.js'
import { automation } from '@/lib/skills/automation.js'
import { canvas } from '@/lib/skills/canvas.js'
import { coder } from '@/lib/skills/coder.js'
import { files } from '@/lib/skills/files.js'
import { memory } from '@/lib/skills/memory.js'
import { reviewer } from '@/lib/skills/reviewer.js'
import { writer } from '@/lib/skills/writer.js'

export const DEFAULT_SKILLS: Skill[] = [
  automation,
  canvas,
  coder,
  files,
  memory,
  reviewer,
  writer
]
