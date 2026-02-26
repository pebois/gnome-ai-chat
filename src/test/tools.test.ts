import { handle_calculate, handle_roll_die } from '@/lib/tools/math.js'

describe('tools', () => {
  describe('math tool handlers', () => {
    it('roll_die with default parameters', () => {
      const result = handle_roll_die({})
      const value = parseInt(result)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(6)
    })

    it('roll_die handles invalid negative sides gracefully', () => {
      const result = handle_roll_die({ sides: -5 })
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('roll_die handles invalid string arguments gracefully', () => {
      const result = handle_roll_die({ sides: 'twenty' as unknown as number })
      expect(result).toBe('NaN')
    })

    it('roll_die with custom sides', () => {
      const result = handle_roll_die({ sides: 20 })
      const value = parseInt(result)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(20)
    })

    it('roll_die with multiple dice', () => {
      const result = handle_roll_die({ sides: 6, count: 3 })
      const values = result.split(', ').map((v) => {
        return parseInt(v)
      })
      expect(values.length).toBe(3)
      values.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(6)
      })
    })

    it('calculate', () => {
      const result = handle_calculate({ left: 2, operator: '+', right: 3 })
      expect(result).toBe('5')
    })

    it('calculate handles division by zero', () => {
      const result = handle_calculate({ left: 10, operator: '/', right: 0 })
      expect(result).toBe('Error: Division by zero')
    })
  })
})
