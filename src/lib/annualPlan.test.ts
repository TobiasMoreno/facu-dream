import { describe, expect, it } from 'vitest'
import { cloneInitialData } from '../data/defaultScenario'
import { createAnnualPlan, monthlyVolume, optimizeAnnualPlan, validateAnnualPlan } from './annualPlan'

describe('annual plan', () => {
  it('starts with the current volume of every plant in all twelve months', () => {
    const data = cloneInitialData()
    const plan = createAnnualPlan(data, 2027)

    expect(plan.year).toBe(2027)
    expect(validateAnnualPlan(plan, data)).toEqual([])
    data.plants.forEach((plant) => {
      expect(plan.monthlyVolumes[plant.id]).toEqual(Array(12).fill(plant.volume))
    })
  })

  it('optimizes each month independently using its loaded plant volumes', async () => {
    const data = cloneInitialData()
    const plan = createAnnualPlan(data, 2027)
    plan.monthlyVolumes['porto-real'][0] = 1200

    const results = await optimizeAnnualPlan(plan, data, async (monthlyData) => {
      const totalVehicles = monthlyData.plants.reduce((sum, plant) => sum + plant.volume, 0)
      return { status: 'optimal', totalVehicles, allocations: [], carrierSummaries: [], roadByPlant: [], messages: [] }
    })

    expect(results).toHaveLength(12)
    expect(results.every(({ result }) => result.status === 'optimal')).toBe(true)
    expect(results[0].result.totalVehicles).toBe(2200)
    expect(results[1].result.totalVehicles).toBe(2000)
    expect(monthlyVolume(plan, 'porto-real', 0)).toBe(1200)
  })
})
