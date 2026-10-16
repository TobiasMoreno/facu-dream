import { describe, expect, it } from 'vitest'
import { cloneInitialData } from '../data/defaultScenario'
import { calculateEffectiveDistribution } from './effectiveDistribution'

describe('calculateEffectiveDistribution', () => {
  it('hereda los costos marítimos y rodoviarios del escenario', () => {
    const data = cloneInitialData()
    const result = calculateEffectiveDistribution(data, [
      { id: 'sea', plantId: 'porto-real', mode: 'Marítimo', carrierName: 'NYK', terminal: 'Rio', quantity: 1000 },
      { id: 'road', plantId: 'fiasa', mode: 'Rodoviario', quantity: 1000 },
    ])

    expect(result.errors).toHaveLength(0)
    expect(result.rows[0].unitCost).toBe(535)
    expect(result.rows[1].unitCost).toBe(680)
    expect(result.totalCost).toBe(1_215_000)
    expect(result.averageCost).toBe(607.5)
  })

  it('informa tarifas faltantes y volúmenes efectivos incompletos', () => {
    const data = cloneInitialData()
    const result = calculateEffectiveDistribution(data, [
      { id: 'missing', plantId: 'porto-real', mode: 'Marítimo', carrierName: 'NYK', terminal: 'Santos', quantity: 200 },
    ])

    expect(result.rows[0].unitCost).toBeNull()
    expect(result.errors.join(' ')).toContain('no tiene una tarifa')
    expect(result.errors.join(' ')).toContain('Porto Real')
    expect(result.errors.join(' ')).toContain('FIASA')
  })
})
