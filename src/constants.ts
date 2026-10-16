export const TERMINALS = ['Rio', 'Santos', 'Fiape'] as const

export type Terminal = (typeof TERMINALS)[number]

const LEGACY_TERMINALS: Record<string, Terminal> = {
  rio: 'Rio',
  santos: 'Santos',
  fiape: 'Fiape',
  ecoporto: 'Santos',
  tev: 'Fiape',
}

export function normalizeTerminal(value: string): string {
  return LEGACY_TERMINALS[value.trim().toLocaleLowerCase()] ?? value
}
