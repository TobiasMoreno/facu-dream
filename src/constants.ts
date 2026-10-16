export const TERMINALS = ['Rio', 'Santos', 'Fiape'] as const

export type Terminal = (typeof TERMINALS)[number]
export type TerminalScope = Terminal | 'all'

export const CARRIER_TERMINAL_OPTIONS: ReadonlyArray<{ value: TerminalScope; label: string }> = [
  ...TERMINALS.map((terminal) => ({ value: terminal, label: terminal })),
  { value: 'all', label: 'Todas' },
]

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
