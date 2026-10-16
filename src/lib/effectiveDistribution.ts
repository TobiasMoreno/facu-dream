import type { EffectiveAllocation, OptimizationResult, ScenarioData } from '../types'

export interface CalculatedEffectiveRow extends EffectiveAllocation {
  plant: string
  carrierName?: string
  terminal: string
  unitCost: number | null
  totalCost: number | null
  error?: string
  warning?: string
}

export interface EffectiveDistributionCalculation {
  rows: CalculatedEffectiveRow[]
  totalCost: number
  totalVehicles: number
  averageCost: number
  errors: string[]
}

export function calculateEffectiveDistribution(data: ScenarioData, allocations: EffectiveAllocation[]): EffectiveDistributionCalculation {
  const rows = allocations.map((allocation, index) => calculateRow(data, allocation, index))
  const totalCost = rows.reduce((sum, row) => sum + (row.totalCost ?? 0), 0)
  const totalVehicles = rows.reduce((sum, row) => sum + (Number.isInteger(row.quantity) && row.quantity >= 0 ? row.quantity : 0), 0)
  const volumeErrors = allocations.length ? data.plants.flatMap((plant) => {
    const actual = rows.filter((row) => row.plantId === plant.id).reduce((sum, row) => sum + (Number.isInteger(row.quantity) && row.quantity >= 0 ? row.quantity : 0), 0)
    return actual === plant.volume ? [] : [`${plant.name}: la distribución efectiva suma ${actual} vehículos y el volumen del escenario es ${plant.volume}.`]
  }) : []
  return {
    rows,
    totalCost,
    totalVehicles,
    averageCost: totalVehicles ? totalCost / totalVehicles : 0,
    errors: [...rows.flatMap((row) => row.error ? [row.error] : []), ...volumeErrors],
  }
}

export function effectiveFromOptimization(result: OptimizationResult): EffectiveAllocation[] {
  return result.allocations.map((allocation, index) => ({
    id: `effective-${allocation.id}-${index}`,
    plantId: allocation.plantId,
    mode: allocation.mode,
    carrierName: allocation.carrier,
    terminal: allocation.mode === 'Marítimo' ? allocation.terminal : undefined,
    quantity: allocation.quantity,
  }))
}

export function effectiveFlowKey(row: Pick<CalculatedEffectiveRow, 'plant' | 'mode' | 'carrierName' | 'terminal'>): string {
  return row.mode === 'Rodoviario' ? `${row.plant} / Rodoviario` : `${row.plant} / ${row.carrierName} / ${row.terminal}`
}

function calculateRow(data: ScenarioData, allocation: EffectiveAllocation, index: number): CalculatedEffectiveRow {
  const plant = data.plants.find((item) => item.id === allocation.plantId)
  const rowNumber = index + 1
  if (!plant) return invalidRow(allocation, '', rowNumber, 'referencia una planta inexistente')
  if (!Number.isInteger(allocation.quantity) || allocation.quantity < 0) {
    return invalidRow(allocation, plant.name, rowNumber, 'debe tener una cantidad entera no negativa')
  }

  if (allocation.mode === 'Rodoviario') {
    return {
      ...allocation,
      carrierName: undefined,
      terminal: '—',
      plant: plant.name,
      unitCost: plant.roadCost,
      totalCost: allocation.quantity * plant.roadCost,
    }
  }

  if (!allocation.carrierName || !allocation.terminal) {
    return invalidRow(allocation, plant.name, rowNumber, 'debe indicar naviera y terminal')
  }
  const rate = data.seaRates.find((item) => {
    const carrier = data.carriers.find((candidate) => candidate.id === item.carrierId)
    return item.plantId === allocation.plantId
      && normalizeName(carrier?.name) === normalizeName(allocation.carrierName)
      && item.terminal === allocation.terminal
  })
  if (!rate) {
    return invalidRow(allocation, plant.name, rowNumber, `no tiene una tarifa para ${allocation.carrierName} / ${allocation.terminal}`)
  }
  return {
    ...allocation,
    plant: plant.name,
    terminal: allocation.terminal,
    unitCost: rate.cost,
    totalCost: allocation.quantity * rate.cost,
    warning: rate.enabled ? undefined : 'El flujo está deshabilitado en la simulación.',
  }
}

function invalidRow(allocation: EffectiveAllocation, plant: string, rowNumber: number, message: string): CalculatedEffectiveRow {
  return {
    ...allocation,
    plant,
    terminal: allocation.terminal ?? '—',
    unitCost: null,
    totalCost: null,
    error: `La fila efectiva ${rowNumber} ${message}.`,
  }
}

const normalizeName = (value?: string) => value?.trim().toLocaleLowerCase() ?? ''
