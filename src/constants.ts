export const TERMINALS = ['Rio', 'Santos', 'Fiape'] as const

export type Terminal = (typeof TERMINALS)[number]
export type TerminalScope = Terminal | 'rio-santos' | 'all'

export const CARRIER_TERMINAL_OPTIONS: ReadonlyArray<{ value: TerminalScope; label: string }> = [
  ...TERMINALS.map((terminal) => ({ value: terminal, label: terminal })),
  { value: 'rio-santos', label: 'Rio/Santos' },
  { value: 'all', label: 'Todas' },
]

export function terminalMatchesScope(scope: TerminalScope, terminal: string): boolean {
  if (scope === 'all') return true
  if (scope === 'rio-santos') return terminal === 'Rio' || terminal === 'Santos'
  return scope === terminal
}

export function terminalScopeLabel(scope: TerminalScope | undefined): string {
  if (!scope || scope === 'all') return 'Todas'
  if (scope === 'rio-santos') return 'Rio/Santos'
  return scope
}

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
