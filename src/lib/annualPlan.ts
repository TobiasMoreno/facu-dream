import type { AnnualMonthResult, AnnualPlan, OptimizationResult, ScenarioData } from '../types'
import { optimizeTransport } from './optimizer'

export const MONTHS = [
  { short: 'Ene', long: 'Enero' },
  { short: 'Feb', long: 'Febrero' },
  { short: 'Mar', long: 'Marzo' },
  { short: 'Abr', long: 'Abril' },
  { short: 'May', long: 'Mayo' },
  { short: 'Jun', long: 'Junio' },
  { short: 'Jul', long: 'Julio' },
  { short: 'Ago', long: 'Agosto' },
  { short: 'Sep', long: 'Septiembre' },
  { short: 'Oct', long: 'Octubre' },
  { short: 'Nov', long: 'Noviembre' },
  { short: 'Dic', long: 'Diciembre' },
] as const

export function createAnnualPlan(data: ScenarioData, year = new Date().getFullYear()): AnnualPlan {
  return {
    year,
    monthlyVolumes: Object.fromEntries(data.plants.map((plant) => [plant.id, Array(12).fill(plant.volume)])),
  }
}

export function monthlyVolume(plan: AnnualPlan, plantId: string, month: number, fallback = 0): number {
  const value = plan.monthlyVolumes[plantId]?.[month]
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

export function validateAnnualPlan(plan: AnnualPlan, data: ScenarioData): string[] {
  const errors: string[] = []
  if (!Number.isInteger(plan.year) || plan.year < 2000 || plan.year > 2200) errors.push('El año debe estar entre 2000 y 2200.')
  data.plants.forEach((plant) => {
    MONTHS.forEach((month, index) => {
      const value = monthlyVolume(plan, plant.id, index, Number.NaN)
      if (!Number.isInteger(value) || value < 0) errors.push(`${plant.name} / ${month.long}: el volumen debe ser un entero no negativo.`)
    })
  })
  return errors
}

export async function optimizeAnnualPlan(
  plan: AnnualPlan,
  data: ScenarioData,
  suppliedOptimizer?: (monthlyData: ScenarioData) => Promise<OptimizationResult>,
): Promise<AnnualMonthResult[]> {
  const solver = suppliedOptimizer ? undefined : await (await import('glpk.js')).default()
  const optimize = suppliedOptimizer ?? ((monthlyData: ScenarioData) => optimizeTransport(monthlyData, solver))
  const results: AnnualMonthResult[] = []
  for (let month = 0; month < MONTHS.length; month += 1) {
    const monthlyData: ScenarioData = {
      ...data,
      plants: data.plants.map((plant) => ({
        ...plant,
        volume: monthlyVolume(plan, plant.id, month, plant.volume),
      })),
    }
    results.push({ month, result: await optimize(monthlyData) })
  }
  return results
}
