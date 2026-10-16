import type { Scenario, ScenarioData } from '../types'

const id = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export const initialData: ScenarioData = {
  plants: [
    { id: 'porto-real', name: 'Porto Real', volume: 1000, roadCost: 680, roadRule: { type: 'exact', quantity: 0 } },
    { id: 'fiasa', name: 'FIASA', volume: 1000, roadCost: 680, roadRule: { type: 'exact', quantity: 500 } },
  ],
  carriers: [
    { id: 'grimaldi', name: 'Grimaldi', min: 0, max: 500 },
    { id: 'nyk', name: 'NYK', min: 0, max: 800 },
    { id: 'k-line', name: 'K-Line', min: 100, max: null },
  ],
  seaRates: [
    ['Porto Real', 'NYK', 'Rio', 535],
    ['Porto Real', 'Grimaldi', 'Rio', 550.22],
    ['Porto Real', 'K-Line', 'Rio', 551.74],
    ['Porto Real', 'Grimaldi', 'Santos', 615.18],
    ['Porto Real', 'NYK', 'Fiape', 627.17],
    ['Porto Real', 'K-Line', 'Fiape', 641.34],
    ['FIASA', 'NYK', 'Rio', 631.26],
    ['FIASA', 'Grimaldi', 'Rio', 643.91],
    ['FIASA', 'K-Line', 'Rio', 645.43],
    ['FIASA', 'Grimaldi', 'Santos', 691.17],
    ['FIASA', 'NYK', 'Fiape', 695.86],
    ['FIASA', 'K-Line', 'Fiape', 710.02],
  ].map(([plant, carrier, terminal, cost], index) => ({
    id: `rate-${index + 1}`,
    plantId: id(String(plant)),
    carrierId: id(String(carrier)),
    terminal: String(terminal),
    cost: Number(cost),
    enabled: true,
  })),
}

export function cloneInitialData(): ScenarioData {
  return structuredClone(initialData)
}

export function createInitialScenario(): Scenario {
  return {
    id: crypto.randomUUID(),
    name: 'Caso inicial',
    data: cloneInitialData(),
    updatedAt: new Date().toISOString(),
  }
}
