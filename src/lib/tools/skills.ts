import type { Tool } from '@/lib/providers/index.js'

export const RUN_SKILL_TOOL = 'run_skill'

export const run_skill: Tool = {
  type: 'function',
  function: {
    name: RUN_SKILL_TOOL,
    parameters: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'Name of the skill to run.'
        },
        task: {
          type: 'string',
          description: 'Complete, self-contained instructions for the skill. It does not see this conversation, so include every detail it needs.'
        }
      },
      required: ['skill', 'task']
    },
    description: 'Delegates a self-contained task to a specialised skill that runs as a sub-agent with its own instructions and tools, and returns only its final answer.'
  }
}

export function handle_run_skill(): string {
  return 'Error: Skills can only be run from a chat.'
}
