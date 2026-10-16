import type { LP, Result } from 'glpk.js'
import type { Allocation, OptimizationResult, ScenarioData } from '../types'
import { terminalMatchesScope, terminalScopeLabel } from '../constants'
import { diagnoseInfeasibility, validateScenario } from './validation'

interface SolverLike {
  GLP_MIN: number
  GLP_LO: number
  GLP_UP: number
  GLP_FX: number
  GLP_OPT: number
  GLP_FEAS: number
  GLP_MSG_OFF: number
  solve: (lp: LP, options?: object) => Result | Promise<Result>
}

const seaVar = (id: string) => `sea__${id}`
const roadVar = (id: string) => `road__${id}`

export async function optimizeTransport(data: ScenarioData, suppliedSolver?: SolverLike): Promise<OptimizationResult> {
  const errors = validateScenario(data)
  if (errors.length) {
    return emptyResult('invalid', errors)
  }

  try {
    const solver = suppliedSolver ?? (await (await import('glpk.js')).default())
    const enabledRates = data.seaRates.filter((rate) => rate.enabled)
    const variables = [
      ...enabledRates.map((rate) => ({ name: seaVar(rate.id), coef: rate.cost })),
      ...data.plants.map((plant) => ({ name: roadVar(plant.id), coef: plant.roadCost })),
    ]

    const subjectTo: LP['subjectTo'] = data.plants.map((plant) => ({
      name: `balance_${plant.id}`,
      vars: [
        ...enabledRates.filter((rate) => rate.plantId === plant.id).map((rate) => ({ name: seaVar(rate.id), coef: 1 })),
        { name: roadVar(plant.id), coef: 1 },
      ],
      bnds: { type: solver.GLP_FX, lb: plant.volume, ub: plant.volume },
    }))

    data.carriers.forEach((carrier) => {
      const vars = enabledRates
        .filter((rate) => rate.carrierId === carrier.id && terminalMatchesScope(carrier.terminalScope, rate.terminal))
        .map((rate) => ({ name: seaVar(rate.id), coef: 1 }))
      if (carrier.min > 0) {
        subjectTo.push({
          name: `carrier_min_${carrier.id}`,
          vars,
          bnds: { type: solver.GLP_LO, lb: carrier.min, ub: 0 },
        })
      }
      if (carrier.max !== null) {
        subjectTo.push({
          name: `carrier_max_${carrier.id}`,
          vars,
          bnds: { type: solver.GLP_UP, lb: 0, ub: carrier.max },
        })
      }
    })

    data.plants.forEach((plant) => {
      subjectTo.push({
        name: `road_rule_${plant.id}`,
        vars: [{ name: roadVar(plant.id), coef: 1 }],
        bnds: ruleBounds(plant.roadRule.type, plant.roadRule.quantity, solver),
      })
    })
    if (data.roadTotalRule) {
      subjectTo.push({
        name: 'legacy_road_total_rule',
        vars: data.plants.map((plant) => ({ name: roadVar(plant.id), coef: 1 })),
        bnds: ruleBounds(data.roadTotalRule.type, data.roadTotalRule.quantity, solver),
      })
    }

    const names = variables.map((variable) => variable.name)
    const lp: LP = {
      name: 'vehicle_transport',
      objective: { direction: solver.GLP_MIN, name: 'total_cost', vars: variables },
      subjectTo,
      bounds: names.map((name) => ({ name, type: solver.GLP_LO, lb: 0, ub: 0 })),
      generals: names,
    }

    const solved = await solver.solve(lp, { msglev: solver.GLP_MSG_OFF, presol: true })
    if (![solver.GLP_OPT, solver.GLP_FEAS].includes(solved.result.status)) {
      return emptyResult('infeasible', diagnoseInfeasibility(data))
    }

    const allocations: Allocation[] = []
    enabledRates.forEach((rate) => {
      const quantity = Math.round(solved.result.vars[seaVar(rate.id)] ?? 0)
      if (quantity <= 0) return
      const plant = data.plants.find((item) => item.id === rate.plantId)!
      const carrier = data.carriers.find((item) => item.id === rate.carrierId)!
      allocations.push({
        id: rate.id,
        plantId: plant.id,
        plant: plant.name,
        carrierId: carrier.id,
        carrier: carrier.name,
        terminal: rate.terminal,
        mode: 'Marítimo',
        quantity,
        unitCost: rate.cost,
        totalCost: quantity * rate.cost,
      })
    })
    data.plants.forEach((plant) => {
      const quantity = Math.round(solved.result.vars[roadVar(plant.id)] ?? 0)
      if (quantity <= 0) return
      allocations.push({
        id: `road-${plant.id}`,
        plantId: plant.id,
        plant: plant.name,
        terminal: '—',
        mode: 'Rodoviario',
        quantity,
        unitCost: plant.roadCost,
        totalCost: quantity * plant.roadCost,
      })
    })

    const totalVehicles = data.plants.reduce((sum, plant) => sum + plant.volume, 0)
    const totalCost = allocations.reduce((sum, allocation) => sum + allocation.totalCost, 0)
    const carrierSummaries = data.carriers.map((carrier) => {
      const quantity = allocations
        .filter((allocation) => allocation.carrierId === carrier.id && terminalMatchesScope(carrier.terminalScope, allocation.terminal))
        .reduce((sum, allocation) => sum + allocation.quantity, 0)
      return {
        carrierId: carrier.id,
        carrier: carrier.name,
        terminalScope: carrier.terminalScope,
        quantity,
        min: carrier.min,
        max: carrier.max,
        minMet: quantity >= carrier.min,
        maxMet: carrier.max === null || quantity <= carrier.max,
      }
    })

    return {
      status: 'optimal',
      totalCost,
      averageCost: totalVehicles ? totalCost / totalVehicles : 0,
      totalVehicles,
      allocations,
      carrierSummaries,
      roadByPlant: data.plants.map((plant) => ({
        plantId: plant.id,
        plant: plant.name,
        quantity: allocations.find((allocation) => allocation.id === `road-${plant.id}`)?.quantity ?? 0,
      })),
      messages: buildExplanation(data, allocations),
      optimizedAt: new Date().toISOString(),
    }
  } catch (error) {
    return emptyResult('error', [error instanceof Error ? error.message : 'Ocurrió un error inesperado al ejecutar GLPK.'])
  }
}

function buildExplanation(data: ScenarioData, allocations: Allocation[]): string[] {
  const maritime = allocations.filter((item) => item.mode === 'Marítimo')
  const usedRates = [...maritime].sort((a, b) => a.unitCost - b.unitCost)
  const messages = [
    'GLPK minimizó el costo global comparando simultáneamente todos los flujos habilitados; cada vehículo fue asignado una sola vez.',
  ]
  if (usedRates.length) {
    const cheapest = usedRates[0]
    messages.push(`Se aprovechó primero el flujo competitivo ${cheapest.plant} / ${cheapest.carrier} / ${cheapest.terminal} (${formatMoney(cheapest.unitCost)} por vehículo), sujeto a las capacidades globales.`)
  }
  const constrained = data.carriers.filter((carrier) => carrier.min > 0)
  if (constrained.length) messages.push(`Se respetaron los mínimos obligatorios de ${constrained.map((carrier) => `${carrier.name} (${terminalScopeLabel(carrier.terminalScope)})`).join(', ')}.`)
  const roadRules = data.plants.map((plant) => {
    const roadLabel = plant.roadRule.type === 'exact' ? 'exactamente' : plant.roadRule.type === 'min' ? 'como mínimo' : 'como máximo'
    return `${plant.name}: ${roadLabel} ${plant.roadRule.quantity}`
  })
  messages.push(`Se respetó la regla rodoviaria de cada planta (${roadRules.join('; ')}).`)
  if (data.roadTotalRule) {
    const totalLabel = data.roadTotalRule.type === 'exact' ? 'exactamente' : data.roadTotalRule.type === 'min' ? 'como mínimo' : 'como máximo'
    messages.push(`También se conservó la restricción total heredada: ${totalLabel} ${data.roadTotalRule.quantity} rodoviarios.`)
  }
  return messages
}

function ruleBounds(type: ScenarioData['plants'][number]['roadRule']['type'], quantity: number, solver: SolverLike) {
  return type === 'exact'
    ? { type: solver.GLP_FX, lb: quantity, ub: quantity }
    : type === 'min'
      ? { type: solver.GLP_LO, lb: quantity, ub: 0 }
      : { type: solver.GLP_UP, lb: 0, ub: quantity }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)
}

function emptyResult(status: OptimizationResult['status'], messages: string[]): OptimizationResult {
  return { status, allocations: [], carrierSummaries: [], roadByPlant: [], messages }
}
