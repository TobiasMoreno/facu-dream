import type { RoadRule, ScenarioData, StoredAppState } from '../types'

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
    })),
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
    roadTotalRule: data.roadTotalRule ?? legacyTotalRule,
  }
}

export function saveState(state: StoredAppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
