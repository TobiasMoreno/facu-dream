import type { TerminalScope } from './constants'

export type RoadRuleType = 'exact' | 'min' | 'max'
export type OptimizationStatus = 'idle' | 'optimal' | 'infeasible' | 'invalid' | 'error'

export interface Plant {
  id: string
  name: string
  volume: number
  roadCost: number
  roadRule: RoadRule
}

export interface Carrier {
  id: string
  name: string
  terminalScope: TerminalScope
  min: number
  max: number | null
}

export interface SeaRate {
  id: string
  plantId: string
  carrierId: string
  terminal: string
  cost: number
  enabled: boolean
}

export interface RoadRule {
  type: RoadRuleType
  quantity: number
}

export interface ScenarioData {
  plants: Plant[]
  carriers: Carrier[]
  seaRates: SeaRate[]
  /** Solo existe al migrar escenarios creados antes de las reglas por planta. */
  roadTotalRule?: RoadRule
}

export interface Allocation {
  id: string
  plantId: string
  plant: string
  carrierId?: string
  carrier?: string
  terminal: string
  mode: 'Marítimo' | 'Rodoviario'
  quantity: number
  unitCost: number
  totalCost: number
}

export interface CarrierSummary {
  carrierId: string
  carrier: string
  terminalScope: TerminalScope
  quantity: number
  min: number
  max: number | null
  minMet: boolean
  maxMet: boolean
}

export interface OptimizationResult {
  status: OptimizationStatus
  totalCost?: number
  averageCost?: number
  totalVehicles?: number
  allocations: Allocation[]
  carrierSummaries: CarrierSummary[]
  roadByPlant: Array<{ plantId: string; plant: string; quantity: number }>
  messages: string[]
  optimizedAt?: string
}

export interface AnnualMonthResult {
  month: number
  result: OptimizationResult
}

export interface AnnualPlan {
  year: number
  /** Volumen mensual por planta. Cada arreglo usa los índices 0 (enero) a 11 (diciembre). */
  monthlyVolumes: Record<string, number[]>
  results?: AnnualMonthResult[]
  optimizedAt?: string
}

export interface EffectiveAllocation {
  id: string
  plantId: string
  mode: 'Marítimo' | 'Rodoviario'
  carrierName?: string
  terminal?: string
  quantity: number
}

export interface Scenario {
  id: string
  name: string
  data: ScenarioData
  result?: OptimizationResult
  annualPlan?: AnnualPlan
  effectiveDistribution?: EffectiveAllocation[]
  updatedAt: string
}

export interface StoredAppState {
  version: 1
  activeScenarioId: string
  scenarios: Scenario[]
}
