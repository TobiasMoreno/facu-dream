import { beforeAll, describe, expect, it } from 'vitest'
import GLPK, { type GLPK as NodeGLPK } from 'glpk.js/node'
import { cloneInitialData } from '../data/defaultScenario'
import { optimizeTransport } from './optimizer'

describe('optimizeTransport', () => {
  let solver: NodeGLPK

  beforeAll(async () => {
    solver = await GLPK()
  })

  it('encuentra el costo óptimo del caso inicial', async () => {
    const result = await optimizeTransport(cloneInitialData(), solver)

    expect(result.status).toBe('optimal')
    expect(result.totalCost).toBeCloseTo(1_200_303, 2)
    expect(result.averageCost).toBeCloseTo(600.1515, 4)
    expect(result.totalVehicles).toBe(2000)
    expect(result.roadByPlant.reduce((sum, item) => sum + item.quantity, 0)).toBe(500)
  })

  it('produce cantidades enteras, no negativas y conserva cada volumen', async () => {
    const data = cloneInitialData()
    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('optimal')
    for (const allocation of result.allocations) {
      expect(Number.isInteger(allocation.quantity)).toBe(true)
      expect(allocation.quantity).toBeGreaterThanOrEqual(0)
    }
    for (const plant of data.plants) {
      const transported = result.allocations
        .filter((allocation) => allocation.plantId === plant.id)
        .reduce((sum, allocation) => sum + allocation.quantity, 0)
      expect(transported).toBe(plant.volume)
    }
  })

  it('respeta mínimos y capacidades por naviera', async () => {
    const data = cloneInitialData()
    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('optimal')
    result.carrierSummaries.forEach((summary) => {
      expect(summary.quantity).toBeGreaterThanOrEqual(summary.min)
      if (summary.max !== null) expect(summary.quantity).toBeLessThanOrEqual(summary.max)
    })
  })

  it('cumple una obligación rodoviaria diferente para cada planta', async () => {
    const data = cloneInitialData()
    data.plants = data.plants.map((plant) => ({
      ...plant,
      roadRule: { type: 'exact', quantity: plant.id === 'fiasa' ? 500 : 100 },
    }))

    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('optimal')
    expect(result.roadByPlant.find((item) => item.plantId === 'fiasa')?.quantity).toBe(500)
    expect(result.roadByPlant.find((item) => item.plantId === 'porto-real')?.quantity).toBe(100)
  })

  it('compara independientemente los costos de cada terminal', async () => {
    const data = cloneInitialData()
    const fiape = data.seaRates.find((rate) => rate.plantId === 'porto-real' && rate.carrierId === 'nyk' && rate.terminal === 'Fiape')
    expect(fiape).toBeDefined()
    fiape!.cost = 1

    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('optimal')
    const allocation = result.allocations.find((item) => item.id === fiape!.id)
    expect(allocation?.quantity).toBe(800)
  })

  it('aplica el compromiso de una naviera solo a la terminal seleccionada', async () => {
    const data = cloneInitialData()
    data.carriers = data.carriers.map((carrier) => carrier.id === 'k-line'
      ? { ...carrier, terminalScope: 'Fiape', min: 100 }
      : carrier)

    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('optimal')
    const kLineFiape = result.allocations
      .filter((item) => item.carrierId === 'k-line' && item.terminal === 'Fiape')
      .reduce((sum, item) => sum + item.quantity, 0)
    const summary = result.carrierSummaries.find((item) => item.carrierId === 'k-line')
    expect(kLineFiape).toBeGreaterThanOrEqual(100)
    expect(summary?.terminalScope).toBe('Fiape')
    expect(summary?.quantity).toBe(kLineFiape)
  })

  it('agrupa Rio y Santos en un único compromiso combinado', async () => {
    const data = cloneInitialData()
    data.carriers = data.carriers.map((carrier) => carrier.id === 'k-line'
      ? { ...carrier, terminalScope: 'rio-santos', min: 100 }
      : carrier)
    data.seaRates = data.seaRates.map((rate) => rate.carrierId === 'k-line' && rate.terminal === 'Fiape'
      ? { ...rate, cost: 1 }
      : rate)

    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('optimal')
    const kLineRioSantos = result.allocations
      .filter((item) => item.carrierId === 'k-line' && (item.terminal === 'Rio' || item.terminal === 'Santos'))
      .reduce((sum, item) => sum + item.quantity, 0)
    const summary = result.carrierSummaries.find((item) => item.carrierId === 'k-line')
    expect(kLineRioSantos).toBeGreaterThanOrEqual(100)
    expect(summary?.terminalScope).toBe('rio-santos')
    expect(summary?.quantity).toBe(kLineRioSantos)
  })

  it('informa inviabilidad sin relajar restricciones', async () => {
    const data = cloneInitialData()
    data.carriers = data.carriers.map((carrier) => ({ ...carrier, max: 100 }))

    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('infeasible')
    expect(result.allocations).toHaveLength(0)
    expect(result.messages.join(' ')).toContain('capacidad marítima total')
  })

  it('rechaza combinaciones de tarifas duplicadas antes de resolver', async () => {
    const data = cloneInitialData()
    data.seaRates.push({ ...data.seaRates[0], id: 'duplicated-rate' })

    const result = await optimizeTransport(data, solver)

    expect(result.status).toBe('invalid')
    expect(result.messages.join(' ')).toContain('combinaciones duplicadas')
  })
})
