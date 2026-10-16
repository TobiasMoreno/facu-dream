import type { AnnualPlan, RoadRule, ScenarioData, StoredAppState } from '../types'
import { normalizeTerminal } from '../constants'
import type { TerminalScope } from '../constants'

export const STORAGE_KEY = 'ruta-optima-state-v1'

export function loadState(): StoredAppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = normalizeState(JSON.parse(raw) as StoredAppState)
    if (parsed.version !== 1 || !Array.isArray(parsed.scenarios) || !parsed.scenarios.length) return null
    return parsed
  } catch {
    return null
  }
}

export function normalizeState(state: StoredAppState): StoredAppState {
  return {
    ...state,
    scenarios: state.scenarios.map((scenario) => ({
      ...scenario,
      data: normalizeData(scenario.data),
      annualPlan: normalizeAnnualPlan(scenario.annualPlan),
    })),
  }
}

function normalizeAnnualPlan(plan: AnnualPlan | undefined): AnnualPlan | undefined {
  if (!plan || !Number.isInteger(plan.year) || !plan.monthlyVolumes || typeof plan.monthlyVolumes !== 'object') return undefined
  return {
    ...plan,
    monthlyVolumes: Object.fromEntries(
      Object.entries(plan.monthlyVolumes).map(([plantId, values]) => [
        plantId,
        Array.from({ length: 12 }, (_, month) => {
          const value = Array.isArray(values) ? Number(values[month]) : 0
          return Number.isInteger(value) && value >= 0 ? value : 0
        }),
      ]),
    ),
  }
}

function normalizeData(data: ScenarioData): ScenarioData {
  const legacy = data as ScenarioData & { roadRule?: RoadRule }
  const { roadRule: legacyTotalRule, ...rest } = legacy
  return {
    ...rest,
    plants: data.plants.map((plant) => ({
      ...plant,
      roadRule: plant.roadRule ?? { type: 'min', quantity: 0 },
    })),
    carriers: data.carriers.map((carrier) => ({
      ...carrier,
      terminalScope: normalizeTerminalScope(carrier.terminalScope),
    })),
    seaRates: data.seaRates.map((rate) => ({ ...rate, terminal: normalizeTerminal(rate.terminal) })),
    roadTotalRule: data.roadTotalRule ?? legacyTotalRule,
  }
}

function normalizeTerminalScope(value: TerminalScope | undefined): TerminalScope {
  if (!value || value === 'all') return 'all'
  return normalizeTerminal(value) as TerminalScope
}

export function saveState(state: StoredAppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
