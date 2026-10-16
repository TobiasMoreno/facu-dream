import type { ScenarioData } from '../types'
import { CARRIER_TERMINAL_OPTIONS, TERMINALS, type Terminal, type TerminalScope } from '../constants'

const isFiniteNonNegative = (value: number) => Number.isFinite(value) && value >= 0

export function validateScenario(data: ScenarioData): string[] {
  const errors: string[] = []

  if (!data.plants.length) errors.push('Debe existir al menos una planta.')
  if (!data.carriers.length) errors.push('Debe existir al menos una naviera.')

  const duplicateNames = (values: string[]) =>
    values.filter((value, index) => values.findIndex((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase()) !== index)

  data.plants.forEach((plant, index) => {
    if (!plant.name.trim()) errors.push(`La planta ${index + 1} no tiene nombre.`)
    if (!Number.isInteger(plant.volume) || !isFiniteNonNegative(plant.volume)) {
      errors.push(`El volumen de ${plant.name || `planta ${index + 1}`} debe ser un entero no negativo.`)
    }
    if (!isFiniteNonNegative(plant.roadCost)) {
      errors.push(`El costo rodoviario de ${plant.name || `planta ${index + 1}`} debe ser no negativo.`)
    }
    if (!plant.roadRule || !['exact', 'min', 'max'].includes(plant.roadRule.type) || !Number.isInteger(plant.roadRule.quantity) || !isFiniteNonNegative(plant.roadRule.quantity)) {
      errors.push(`La cantidad rodoviaria de ${plant.name || `planta ${index + 1}`} debe ser un entero no negativo.`)
    }
  })

  duplicateNames(data.plants.map((plant) => plant.name.trim()).filter(Boolean)).forEach((name) =>
    errors.push(`La planta “${name}” está duplicada.`),
  )

  data.carriers.forEach((carrier, index) => {
    if (!carrier.name.trim()) errors.push(`La naviera ${index + 1} no tiene nombre.`)
    if (!CARRIER_TERMINAL_OPTIONS.some((option) => option.value === carrier.terminalScope)) {
      errors.push(`La terminal de ${carrier.name || `naviera ${index + 1}`} debe ser Rio, Santos, Fiape o Todas.`)
    }
    if (!Number.isInteger(carrier.min) || !isFiniteNonNegative(carrier.min)) {
      errors.push(`El mínimo de ${carrier.name || `naviera ${index + 1}`} debe ser un entero no negativo.`)
    }
    if (carrier.max !== null && (!Number.isInteger(carrier.max) || !isFiniteNonNegative(carrier.max))) {
      errors.push(`La capacidad de ${carrier.name || `naviera ${index + 1}`} debe ser un entero no negativo o quedar vacía.`)
    }
    if (carrier.max !== null && carrier.min > carrier.max) {
      errors.push(`${carrier.name}: el mínimo (${carrier.min}) supera la capacidad (${carrier.max}).`)
    }
  })

  duplicateNames(data.carriers.map((carrier) => carrier.name.trim()).filter(Boolean)).forEach((name) =>
    errors.push(`La naviera “${name}” está duplicada.`),
  )

  const combinations = new Map<string, number>()
  data.seaRates.forEach((rate, index) => {
    const plant = data.plants.find((item) => item.id === rate.plantId)
    const carrier = data.carriers.find((item) => item.id === rate.carrierId)
    if (!plant) errors.push(`La tarifa ${index + 1} referencia una planta inexistente.`)
    if (!carrier) errors.push(`La tarifa ${index + 1} referencia una naviera inexistente.`)
    if (!TERMINALS.includes(rate.terminal as Terminal)) {
      errors.push(`La terminal de la tarifa ${index + 1} debe ser Rio, Santos o Fiape.`)
    }
    if (!isFiniteNonNegative(rate.cost)) errors.push(`El costo de la tarifa ${index + 1} debe ser no negativo.`)
    const key = `${rate.plantId}|${rate.carrierId}|${rate.terminal.trim().toLocaleLowerCase()}`
    combinations.set(key, (combinations.get(key) ?? 0) + 1)
  })
  combinations.forEach((count) => {
    if (count > 1) errors.push('Hay combinaciones duplicadas de planta, naviera y terminal.')
  })

  if (data.roadTotalRule && (!Number.isInteger(data.roadTotalRule.quantity) || !isFiniteNonNegative(data.roadTotalRule.quantity))) {
    errors.push('La cantidad rodoviaria total heredada debe ser un entero no negativo.')
  }

  return [...new Set(errors)]
}

export function diagnoseInfeasibility(data: ScenarioData): string[] {
  const reasons: string[] = []
  const total = data.plants.reduce((sum, plant) => sum + plant.volume, 0)
  const minSea = data.carriers.reduce((sum, carrier) => sum + carrier.min, 0)
  const finiteCapacity = data.carriers.every((carrier) => carrier.max !== null && carrier.terminalScope === 'all')
    ? data.carriers.reduce((sum, carrier) => sum + (carrier.max ?? 0), 0)
    : Number.POSITIVE_INFINITY

  data.plants.forEach((plant) => {
    if ((plant.roadRule.type === 'exact' || plant.roadRule.type === 'min') && plant.roadRule.quantity > plant.volume) {
      reasons.push(`${plant.name} exige ${plant.roadRule.quantity} rodoviarios, pero su volumen es ${plant.volume}.`)
    }
  })

  const plantRoadMin = data.plants.reduce(
    (sum, plant) => sum + (plant.roadRule.type === 'min' || plant.roadRule.type === 'exact' ? plant.roadRule.quantity : 0),
    0,
  )
  const plantRoadMax = data.plants.reduce(
    (sum, plant) => sum + (plant.roadRule.type === 'max' || plant.roadRule.type === 'exact' ? Math.min(plant.roadRule.quantity, plant.volume) : plant.volume),
    0,
  )
  const totalRuleMin = data.roadTotalRule && (data.roadTotalRule.type === 'min' || data.roadTotalRule.type === 'exact') ? data.roadTotalRule.quantity : 0
  const totalRuleMax = data.roadTotalRule && (data.roadTotalRule.type === 'max' || data.roadTotalRule.type === 'exact') ? data.roadTotalRule.quantity : total
  const roadMin = Math.max(plantRoadMin, totalRuleMin)
  const roadMax = Math.min(plantRoadMax, totalRuleMax)
  if (roadMin > roadMax) {
    reasons.push(`Las reglas rodoviarias por planta no son compatibles con la restricción total heredada (${roadMin} mínimos frente a ${roadMax} máximos).`)
  }
  if (minSea + roadMin > total) {
    reasons.push(`Los mínimos marítimos (${minSea}) más los rodoviarios obligatorios (${roadMin}) superan el volumen total (${total}).`)
  }
  const requiredSea = Math.max(0, total - roadMax)
  if (finiteCapacity < requiredSea) {
    reasons.push(`La capacidad marítima total (${finiteCapacity}) no alcanza los ${requiredSea} vehículos que deben viajar por mar.`)
  }

  data.carriers.forEach((carrier) => {
    const reachable = data.plants
      .filter((plant) => data.seaRates.some((rate) => rate.enabled && rate.plantId === plant.id && rate.carrierId === carrier.id && carrierIncludesTerminal(carrier.terminalScope, rate.terminal)))
      .reduce((sum, plant) => {
        const roadLower = plant.roadRule.type === 'min' || plant.roadRule.type === 'exact' ? plant.roadRule.quantity : 0
        return sum + Math.max(0, plant.volume - roadLower)
      }, 0)
    if (carrier.min > reachable) {
      const terminal = carrier.terminalScope === 'all' ? 'todas las terminales' : `terminal ${carrier.terminalScope}`
      reasons.push(`${carrier.name} exige un mínimo de ${carrier.min} en ${terminal}, pero sus flujos habilitados solo alcanzan ${reachable} vehículos.`)
    }
  })

  data.plants.forEach((plant) => {
    const hasSea = data.seaRates.some((rate) => rate.enabled && rate.plantId === plant.id)
    const plantRoadMax = plant.roadRule.type === 'max' || plant.roadRule.type === 'exact' ? plant.roadRule.quantity : plant.volume
    if (!hasSea && plantRoadMax < plant.volume) {
      reasons.push(`${plant.name} no tiene flujos marítimos habilitados y su límite rodoviario (${plantRoadMax}) no permite transportar todo su volumen (${plant.volume}).`)
    }
  })

  if (!reasons.length) {
    reasons.push('La combinación de capacidades, mínimos, flujos habilitados y regla rodoviaria no admite una asignación completa.')
  }
  return reasons
}

function carrierIncludesTerminal(scope: TerminalScope, terminal: string) {
  return scope === 'all' || scope === terminal
}
