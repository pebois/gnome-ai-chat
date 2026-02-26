import type { OllamaTool } from '@/lib/ollama.js'

export const roll_die: OllamaTool = {
  type: 'function',
  function: {
    name: 'roll_die',
    parameters: {
      type: 'object',
      properties: {
        sides: {
          type: 'number'
        },
        count: {
          type: 'number'
        }
      }
    },
    description: 'Simulates rolling one or more dice with a specified number of sides.'
  }
}

export const calculate: OllamaTool = {
  type: 'function',
  function: {
    name: 'calculate',
    parameters: {
      type: 'object',
      properties: {
        left: {
          type: 'number',
          description: 'The first number.'
        },
        operator: {
          type: 'string',
          enum: ['+', '-', '*', '/'],
          description: 'The operator to apply.'
        },
        right: {
          type: 'number',
          description: 'The second number.'
        }
      },
      required: ['left', 'operator', 'right']
    },
    description: 'Performs a basic arithmetic operation between two numbers.'
  }
}

export function handle_roll_die(args: Record<string, unknown>): string {
  const countRaw = args.count !== undefined ? args.count : 1
  const sidesRaw = args.sides !== undefined ? args.sides : 6

  if (typeof countRaw !== 'number' || typeof sidesRaw !== 'number' || Number.isNaN(countRaw) || Number.isNaN(sidesRaw)) {
    return 'NaN'
  }

  let count = Math.floor(countRaw)
  let sides = Math.floor(sidesRaw)

  count = Math.max(1, Math.min(100, count))
  sides = Math.max(2, Math.min(1000, sides))

  const results = []
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides) + 1)
  }
  return results.join(', ')
}

export function handle_calculate(args: Record<string, unknown>): string {
  const left = typeof args.left === 'number' ? args.left : NaN
  const right = typeof args.right === 'number' ? args.right : NaN
  const operator = typeof args.operator === 'string' ? args.operator : ''

  if (Number.isNaN(left) || Number.isNaN(right)) {
    return 'Error: Both left and right must be valid numbers'
  }

  switch (operator) {
    case '+': return String(left + right)
    case '-': return String(left - right)
    case '*': return String(left * right)
    case '/': return right === 0 ? 'Error: Division by zero' : String(left / right)
    default: return `Error: Unknown operator ${operator}`
  }
}
