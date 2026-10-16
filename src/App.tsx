import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Anchor,
  ArrowLeftRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Download,
  FileJson,
  Gauge,
  Info,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  RotateCcw,
  Ship,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LabelProps } from 'recharts'
import { cloneInitialData, createInitialScenario } from './data/defaultScenario'
import { CARRIER_TERMINAL_OPTIONS, TERMINALS, terminalScopeLabel, type Terminal, type TerminalScope } from './constants'
import { optimizeTransport } from './lib/optimizer'
import { calculateEffectiveDistribution, effectiveFlowKey, effectiveFromOptimization } from './lib/effectiveDistribution'
import { loadState, normalizeState, saveState } from './lib/storage'
import { validateScenario } from './lib/validation'
import type { Carrier, EffectiveAllocation, OptimizationResult, Plant, Scenario, ScenarioData, SeaRate, StoredAppState } from './types'

type View = 'data' | 'result' | 'compare'

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const percentage = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const COLORS = ['#ef6a3a', '#2b7a78', '#dcae49', '#477998', '#88498f']
const TRANSPORT_COLORS = ['#173e48', '#2b7a78', '#dcae49', '#477998', '#88498f', '#788b91']

function initialState(): StoredAppState {
  const stored = loadState()
  if (stored && stored.scenarios.some((scenario) => scenario.id === stored.activeScenarioId)) return stored
  const scenario = createInitialScenario()
  return { version: 1, activeScenarioId: scenario.id, scenarios: [scenario] }
}

function App() {
  const [state, setState] = useState<StoredAppState>(initialState)
  const [view, setView] = useState<View>('data')
  const [optimizing, setOptimizing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const active = state.scenarios.find((scenario) => scenario.id === state.activeScenarioId) ?? state.scenarios[0]

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const updateData = (updater: (data: ScenarioData) => ScenarioData) => {
    setState((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.id === current.activeScenarioId
          ? { ...scenario, data: updater(scenario.data), result: undefined, updatedAt: new Date().toISOString() }
          : scenario,
      ),
    }))
  }

  const updateActive = (updates: Partial<Scenario>) => {
    setState((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.id === current.activeScenarioId ? { ...scenario, ...updates, updatedAt: new Date().toISOString() } : scenario,
      ),
    }))
  }

  const runOptimization = async () => {
    setOptimizing(true)
    setView('result')
    const result = await optimizeTransport(active.data)
    updateActive({ result })
    setOptimizing(false)
  }

  const createScenario = () => {
    const scenario: Scenario = {
      id: crypto.randomUUID(),
      name: `Escenario ${state.scenarios.length + 1}`,
      data: cloneInitialData(),
      updatedAt: new Date().toISOString(),
    }
    setState((current) => ({ ...current, activeScenarioId: scenario.id, scenarios: [...current.scenarios, scenario] }))
    setView('data')
  }

  const duplicateScenario = () => {
    const scenario: Scenario = {
      ...structuredClone(active),
      id: crypto.randomUUID(),
      name: `${active.name} (copia)`,
      updatedAt: new Date().toISOString(),
    }
    setState((current) => ({ ...current, activeScenarioId: scenario.id, scenarios: [...current.scenarios, scenario] }))
    setNotice('Escenario duplicado.')
  }

  const deleteScenario = () => {
    if (state.scenarios.length === 1) return
    const remaining = state.scenarios.filter((scenario) => scenario.id !== active.id)
    setState({ ...state, activeScenarioId: remaining[0].id, scenarios: remaining })
    setNotice('Escenario eliminado.')
  }

  const restoreExample = () => {
    updateActive({ data: cloneInitialData(), result: undefined })
    setNotice('Se restauró el caso inicial.')
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ruta-optima-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as Partial<StoredAppState>
      if (parsed.version !== 1 || !Array.isArray(parsed.scenarios) || !parsed.scenarios.length) throw new Error('Formato no reconocido')
      const normalized = normalizeState(parsed as StoredAppState)
      const imported = normalized.scenarios
      if (imported.some((scenario) => !scenario.id || !scenario.name || !scenario.data || validateScenario(scenario.data).length)) {
        throw new Error('El archivo contiene escenarios con datos inválidos')
      }
      setState({ version: 1, scenarios: imported, activeScenarioId: imported.some((item) => item.id === parsed.activeScenarioId) ? parsed.activeScenarioId! : imported[0].id })
      setNotice(`${imported.length} escenario${imported.length === 1 ? '' : 's'} importado${imported.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setNotice(error instanceof Error ? `No se pudo importar: ${error.message}.` : 'No se pudo importar el archivo.')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  const selectView = (next: View) => {
    setView(next)
    setMobileMenu(false)
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="Ruta Óptima">
          <span className="brand-mark"><Anchor size={22} /></span>
          <span><b>RUTA</b> ÓPTIMA<small>planificación logística</small></span>
        </a>

        <nav className={mobileMenu ? 'main-nav is-open' : 'main-nav'} aria-label="Navegación principal">
          <button className={view === 'data' ? 'nav-item active' : 'nav-item'} onClick={() => selectView('data')}>01 <span>Datos</span></button>
          <button className={view === 'result' ? 'nav-item active' : 'nav-item'} onClick={() => selectView('result')}>02 <span>Resultado</span></button>
          <button className={view === 'compare' ? 'nav-item active' : 'nav-item'} onClick={() => selectView('compare')}>03 <span>Comparar</span></button>
        </nav>
        <button className="mobile-toggle" onClick={() => setMobileMenu((value) => !value)} aria-label="Abrir menú"><Menu /></button>

        <div className="scenario-select-wrap">
          <span>Escenario activo</span>
          <div className="select-shell">
            <select
              aria-label="Escenario activo"
              value={active.id}
              onChange={(event) => setState((current) => ({ ...current, activeScenarioId: event.target.value }))}
            >
              {state.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
      </header>

      <main id="top" className="page-shell">
        <section className="scenario-bar" aria-label="Acciones de escenarios">
          <div className="scenario-title">
            <span className="eyebrow">ESCENARIO / {String(state.scenarios.findIndex((item) => item.id === active.id) + 1).padStart(2, '0')}</span>
            {renaming ? (
              <form onSubmit={(event) => { event.preventDefault(); setRenaming(false) }} className="rename-form">
                <input autoFocus value={active.name} onChange={(event) => updateActive({ name: event.target.value })} onBlur={() => setRenaming(false)} />
                <Check size={18} />
              </form>
            ) : (
              <button className="name-button" onClick={() => setRenaming(true)}>{active.name} <Pencil size={15} /></button>
            )}
            <span className="saved-dot"><i /> Guardado automático</span>
          </div>
          <div className="action-row">
            <ActionButton icon={<Plus />} label="Nuevo" onClick={createScenario} />
            <ActionButton icon={<Copy />} label="Duplicar" onClick={duplicateScenario} />
            <ActionButton icon={<Trash2 />} label="Eliminar" onClick={deleteScenario} disabled={state.scenarios.length === 1} />
            <span className="action-divider" />
            <ActionButton icon={<RotateCcw />} label="Restaurar ejemplo" onClick={restoreExample} />
            <ActionButton icon={<Upload />} label="Importar" onClick={() => importRef.current?.click()} />
            <ActionButton icon={<Download />} label="Exportar" onClick={exportJson} />
            <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importJson(event.target.files?.[0])} />
          </div>
        </section>

        {view === 'data' && <DataView data={active.data} updateData={updateData} onOptimize={runOptimization} />}
        {view === 'result' && <ResultView result={active.result} data={active.data} optimizing={optimizing} onOptimize={runOptimization} />}
        {view === 'compare' && <CompareView scenario={active} onChange={(effectiveDistribution) => updateActive({ effectiveDistribution })} />}
      </main>

      {notice && <div className="toast"><CheckCircle2 size={18} /> {notice}</div>}
      <footer><span>RUTA ÓPTIMA</span><span>Los cálculos permanecen en este dispositivo.</span></footer>
    </div>
  )
}

function ActionButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button className="action-button" onClick={onClick} disabled={disabled}>{icon}<span>{label}</span></button>
}

function SectionHeader({ number, icon, title, description, action }: { number: string; icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div className="section-index">{number}</div>
      <div className="section-icon">{icon}</div>
      <div><h2>{title}</h2><p>{description}</p></div>
      {action && <div className="section-action">{action}</div>}
    </div>
  )
}

function DataView({ data, updateData, onOptimize }: { data: ScenarioData; updateData: (updater: (data: ScenarioData) => ScenarioData) => void; onOptimize: () => void }) {
  const validation = useMemo(() => validateScenario(data), [data])
  const updatePlant = (id: string, field: keyof Plant, value: Plant[keyof Plant]) =>
    updateData((current) => ({ ...current, plants: current.plants.map((plant) => plant.id === id ? { ...plant, [field]: value } : plant) }))
  const updateCarrier = (id: string, field: keyof Carrier, value: Carrier[keyof Carrier]) =>
    updateData((current) => ({ ...current, carriers: current.carriers.map((carrier) => carrier.id === id ? { ...carrier, [field]: value } : carrier) }))
  const updateRate = (id: string, field: keyof SeaRate, value: string | number | boolean) =>
    updateData((current) => ({ ...current, seaRates: current.seaRates.map((rate) => rate.id === id ? { ...rate, [field]: value } : rate) }))

  const removePlant = (id: string) => updateData((current) => ({
    ...current,
    plants: current.plants.filter((plant) => plant.id !== id),
    seaRates: current.seaRates.filter((rate) => rate.plantId !== id),
  }))
  const removeCarrier = (id: string) => updateData((current) => ({
    ...current,
    carriers: current.carriers.filter((carrier) => carrier.id !== id),
    seaRates: current.seaRates.filter((rate) => rate.carrierId !== id),
  }))

  const addPlant = () => updateData((current) => ({ ...current, plants: [...current.plants, { id: crypto.randomUUID(), name: '', volume: 0, roadCost: 0, roadRule: { type: 'exact', quantity: 0 } }] }))
  const addCarrier = () => updateData((current) => ({ ...current, carriers: [...current.carriers, { id: crypto.randomUUID(), name: '', terminalScope: 'all', min: 0, max: null }] }))
  const addRate = () => updateData((current) => ({
    ...current,
    seaRates: [...current.seaRates, {
      id: crypto.randomUUID(), plantId: current.plants[0]?.id ?? '', carrierId: current.carriers[0]?.id ?? '', terminal: TERMINALS[0], cost: 0, enabled: true,
    }],
  }))

  return (
    <div className="view-stack enter">
      <div className="intro-grid">
        <div><span className="eyebrow orange">CONFIGURACIÓN DEL MODELO</span><h1>Datos de transporte</h1><p>Definí volúmenes, límites y tarifas. Cada cambio invalida el cálculo anterior para mantener el análisis consistente.</p></div>
        <div className="volume-stamp"><span>VOLUMEN TOTAL</span><strong>{integer.format(data.plants.reduce((sum, plant) => sum + plant.volume, 0))}</strong><small>vehículos a distribuir</small></div>
      </div>

      {validation.length > 0 && <ValidationPanel errors={validation} />}

      <section className="panel">
        <SectionHeader number="01" icon={<Gauge />} title="Volúmenes por planta" description="Demanda total que debe transportarse, sin faltantes ni duplicaciones." action={<button className="button-secondary" onClick={addPlant}><Plus size={17} /> Agregar planta</button>} />
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Planta</th><th>Volumen de vehículos</th><th aria-label="Acciones" /></tr></thead>
            <tbody>{data.plants.map((plant) => <tr key={plant.id}>
              <td><input aria-label="Nombre de planta" value={plant.name} onChange={(event) => updatePlant(plant.id, 'name', event.target.value)} /></td>
              <td><input aria-label={`Volumen de ${plant.name}`} className="number-input" type="number" min="0" step="1" value={plant.volume} onChange={(event) => updatePlant(plant.id, 'volume', numberValue(event.target.value))} /></td>
              <td className="cell-action"><button className="icon-button danger" onClick={() => removePlant(plant.id)} aria-label={`Eliminar ${plant.name}`}><Trash2 size={17} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <SectionHeader number="02" icon={<Ship />} title="Navieras y compromisos" description="La capacidad vacía se interpreta como ilimitada. Los mínimos son obligatorios." action={<button className="button-secondary" onClick={addCarrier}><Plus size={17} /> Agregar naviera</button>} />
        <div className="table-scroll">
          <table className="data-table carrier-data-table">
            <thead><tr><th>Naviera</th><th>Terminal</th><th>Mínimo obligatorio</th><th>Capacidad máxima</th><th aria-label="Acciones" /></tr></thead>
            <tbody>{data.carriers.map((carrier) => <tr key={carrier.id}>
              <td><input value={carrier.name} aria-label="Nombre de naviera" onChange={(event) => updateCarrier(carrier.id, 'name', event.target.value)} /></td>
              <td><select aria-label={`Terminal del compromiso de ${carrier.name}`} value={carrier.terminalScope} onChange={(event) => updateCarrier(carrier.id, 'terminalScope', event.target.value as TerminalScope)}>{CARRIER_TERMINAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>
              <td><input className="number-input" type="number" min="0" step="1" value={carrier.min} onChange={(event) => updateCarrier(carrier.id, 'min', numberValue(event.target.value))} /></td>
              <td><input className="number-input" type="number" min="0" step="1" placeholder="Ilimitada" value={carrier.max ?? ''} onChange={(event) => updateCarrier(carrier.id, 'max', nullableNumber(event.target.value))} /></td>
              <td className="cell-action"><button className="icon-button danger" onClick={() => removeCarrier(carrier.id)} aria-label={`Eliminar ${carrier.name}`}><Trash2 size={17} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <SectionHeader number="03" icon={<Anchor />} title="Tarifas marítimas" description="Solo los flujos habilitados participan en el modelo de optimización." action={<button className="button-secondary" onClick={addRate} disabled={!data.plants.length || !data.carriers.length}><Plus size={17} /> Agregar tarifa</button>} />
        <div className="table-scroll">
          <table className="data-table rates-table">
            <thead><tr><th>Activo</th><th>Planta</th><th>Naviera</th><th>Terminal</th><th>Costo / vehículo</th><th aria-label="Acciones" /></tr></thead>
            <tbody>{data.seaRates.map((rate) => <tr key={rate.id} className={rate.enabled ? '' : 'disabled-row'}>
              <td><label className="switch"><input type="checkbox" checked={rate.enabled} onChange={(event) => updateRate(rate.id, 'enabled', event.target.checked)} /><span /></label></td>
              <td><select value={rate.plantId} onChange={(event) => updateRate(rate.id, 'plantId', event.target.value)}>{data.plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name || 'Sin nombre'}</option>)}</select></td>
              <td><select value={rate.carrierId} onChange={(event) => updateRate(rate.id, 'carrierId', event.target.value)}>{data.carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name || 'Sin nombre'} · {terminalScopeLabel(carrier.terminalScope)}</option>)}</select></td>
              <td><select aria-label="Terminal marítima" value={rate.terminal} onChange={(event) => updateRate(rate.id, 'terminal', event.target.value)}>{!TERMINALS.includes(rate.terminal as Terminal) && <option value={rate.terminal} disabled>{rate.terminal} (no válida)</option>}{TERMINALS.map((terminal) => <option key={terminal} value={terminal}>{terminal}</option>)}</select></td>
              <td><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={rate.cost} onChange={(event) => updateRate(rate.id, 'cost', numberValue(event.target.value))} /></div></td>
              <td className="cell-action"><button className="icon-button danger" onClick={() => updateData((current) => ({ ...current, seaRates: current.seaRates.filter((item) => item.id !== rate.id) }))} aria-label="Eliminar tarifa"><Trash2 size={17} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel road-panel">
        <SectionHeader number="04" icon={<Truck />} title="Transporte rodoviario por planta" description="Cada origen tiene su propia obligación o límite y su propio costo por vehículo." />
        <div className="table-scroll">
          <table className="data-table road-table">
            <thead><tr><th>Planta</th><th>Tipo de restricción</th><th>Cantidad</th><th>Costo / vehículo</th></tr></thead>
            <tbody>{data.plants.map((plant) => <tr key={plant.id}>
              <td><strong>{plant.name || 'Planta sin nombre'}</strong></td>
              <td><select value={plant.roadRule.type} onChange={(event) => updatePlant(plant.id, 'roadRule', { ...plant.roadRule, type: event.target.value as Plant['roadRule']['type'] })}><option value="exact">Cantidad exacta</option><option value="min">Cantidad mínima</option><option value="max">Cantidad máxima</option></select></td>
              <td><input className="number-input" type="number" min="0" step="1" value={plant.roadRule.quantity} onChange={(event) => updatePlant(plant.id, 'roadRule', { ...plant.roadRule, quantity: numberValue(event.target.value) })} /></td>
              <td><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={plant.roadCost} onChange={(event) => updatePlant(plant.id, 'roadCost', numberValue(event.target.value))} /></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="rule-note road-note"><Info size={18} /><span>Las cantidades se controlan de manera independiente. Por ejemplo: FIASA exacta 500 y Porto Real exacta 100 obliga ambas asignaciones.</span></div>
        {data.roadTotalRule && <div className="legacy-rule"><AlertTriangle size={18} /><div><strong>Restricción total heredada</strong><span>Este escenario anterior también exige {roadRuleLabel(data.roadTotalRule.type)} {integer.format(data.roadTotalRule.quantity)} rodoviarios en total.</span></div><button className="button-secondary" onClick={() => updateData((current) => ({ ...current, roadTotalRule: undefined }))}>Quitar restricción total</button></div>}
      </section>

      <div className="data-cta"><div><span>Todo listo para calcular</span><p>GLPK evaluará todas las asignaciones enteras factibles.</p></div><button className="optimize-button" onClick={onOptimize}><BarChart3 size={20} /> Optimizar escenario</button></div>
    </div>
  )
}

function ValidationPanel({ errors }: { errors: string[] }) {
  return <div className="validation-panel"><AlertTriangle size={21} /><div><strong>Revisá los datos antes de optimizar</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>
}

function ResultView({ result, data, optimizing, onOptimize }: { result?: OptimizationResult; data: ScenarioData; optimizing: boolean; onOptimize: () => void }) {
  const status = optimizing ? 'running' : result?.status ?? 'idle'
  const chartCarriers = data.carriers.filter((carrier, index, carriers) =>
    carriers.findIndex((item) => normalizeCarrierName(item.name) === normalizeCarrierName(carrier.name)) === index,
  )
  const transportMeans = [
    ...chartCarriers.map((carrier, index) => ({ key: `carrier_${carrier.id}`, label: carrier.name, color: TRANSPORT_COLORS[index % TRANSPORT_COLORS.length], carrierName: carrier.name })),
    { key: 'road', label: 'Rodoviario', color: '#ef6a3a', carrierName: undefined },
  ]
  const chartData = data.plants.map((plant) => {
    const row: Record<string, string | number> = { name: plant.name }
    chartCarriers.forEach((carrier) => {
      row[`carrier_${carrier.id}`] = result?.allocations
        .filter((item) => item.plantId === plant.id && normalizeCarrierName(item.carrier ?? '') === normalizeCarrierName(carrier.name))
        .reduce((sum, item) => sum + item.quantity, 0) ?? 0
    })
    row.road = result?.allocations.find((item) => item.id === `road-${plant.id}`)?.quantity ?? 0
    row.total = transportMeans.reduce((sum, medium) => sum + Number(row[medium.key]), 0)
    return row
  })
  const costData = result?.allocations.reduce<Array<{ name: string; value: number }>>((items, allocation) => {
    const found = items.find((item) => item.name === allocation.mode)
    if (found) found.value += allocation.totalCost
    else items.push({ name: allocation.mode, value: allocation.totalCost })
    return items
  }, []) ?? []

  return (
    <div className="view-stack enter">
      <div className="result-hero">
        <div><span className="eyebrow orange">RESULTADO DEL MODELO</span><h1>Plan de distribución</h1><p>Una lectura ejecutiva de la asignación óptima y sus restricciones.</p></div>
        <button className="optimize-button large" onClick={onOptimize} disabled={optimizing}>{optimizing ? <LoaderCircle className="spin" /> : <BarChart3 />} {optimizing ? 'Optimizando…' : 'Optimizar'}</button>
      </div>

      {status === 'idle' && <EmptyResult onOptimize={onOptimize} />}
      {status === 'running' && <div className="status-card loading"><LoaderCircle className="spin" /><h2>Resolviendo el modelo entero…</h2><p>GLPK está evaluando capacidades, mínimos y costos.</p></div>}
      {result && status !== 'running' && result.status !== 'optimal' && <FailureResult result={result} />}

      {result?.status === 'optimal' && status !== 'running' && <>
        <div className="success-strip"><CheckCircle2 /><div><strong>Solución óptima encontrada</strong><span>Se transporta el 100% del volumen respetando todas las restricciones.</span></div><time>{result.optimizedAt ? new Date(result.optimizedAt).toLocaleString('es-AR') : ''}</time></div>
        <div className="metric-grid">
          <MetricCard icon={<CircleDollarSign />} label="Costo total" value={money.format(result.totalCost ?? 0)} accent />
          <MetricCard icon={<Gauge />} label="Costo promedio" value={money.format(result.averageCost ?? 0)} suffix="por vehículo" />
          <MetricCard icon={<Ship />} label="Volumen marítimo" value={integer.format(result.allocations.filter((item) => item.mode === 'Marítimo').reduce((sum, item) => sum + item.quantity, 0))} suffix="vehículos" />
          <MetricCard icon={<Truck />} label="Volumen rodoviario" value={integer.format(result.roadByPlant.reduce((sum, item) => sum + item.quantity, 0))} suffix="vehículos" />
        </div>

        <div className="result-grid">
          <section className="panel span-2">
            <SectionHeader number="01" icon={<ArrowLeftRight />} title="Distribución detallada" description="Asignaciones positivas de la solución; los flujos en cero se omiten." />
            <div className="table-scroll"><table className="result-table"><thead><tr><th>Planta</th><th>Modalidad</th><th>Naviera</th><th>Terminal</th><th className="right">Vehículos</th><th className="right">Costo unit.</th><th className="right">Subtotal</th></tr></thead><tbody>
              {result.allocations.map((item) => <tr key={item.id}><td><strong>{item.plant}</strong></td><td><span className={`mode-pill ${item.mode === 'Marítimo' ? 'sea' : 'road'}`}>{item.mode === 'Marítimo' ? <Ship size={14} /> : <Truck size={14} />}{item.mode}</span></td><td>{item.carrier ?? '—'}</td><td>{item.terminal}</td><td className="right mono">{integer.format(item.quantity)}</td><td className="right mono">{money.format(item.unitCost)}</td><td className="right mono strong">{money.format(item.totalCost)}</td></tr>)}
            </tbody><tfoot><tr><td colSpan={4}>TOTAL</td><td className="right">{integer.format(result.totalVehicles ?? 0)}</td><td /><td className="right">{money.format(result.totalCost ?? 0)}</td></tr></tfoot></table></div>
          </section>

          <section className="panel">
            <SectionHeader number="02" icon={<Ship />} title="Control por naviera" description="Cumplimiento de compromisos y capacidades." />
            <div className="carrier-list">{result.carrierSummaries.map((carrier) => <div className="carrier-row" key={carrier.carrierId}><div><strong>{carrier.carrier}</strong><span>{integer.format(carrier.quantity)} vehículos · {terminalScopeLabel(carrier.terminalScope)}</span></div><div className="capacity-track"><i style={{ width: carrier.max ? `${Math.min(100, carrier.quantity / carrier.max * 100)}%` : carrier.quantity ? '72%' : '0%' }} /></div><div className="constraint-tags"><span className={carrier.minMet ? 'ok' : 'bad'}><Check size={13} /> Mín. {integer.format(carrier.min)}</span><span className={carrier.maxMet ? 'ok' : 'bad'}><Check size={13} /> Máx. {carrier.max === null ? '∞' : integer.format(carrier.max)}</span></div></div>)}</div>
          </section>

          <section className="panel">
            <SectionHeader number="03" icon={<Truck />} title="Rodoviarios por planta" description="Cumplimiento de la regla independiente de cada origen." />
            <div className="road-result-list">{result.roadByPlant.map((item) => {
              const rule = data.plants.find((plant) => plant.id === item.plantId)?.roadRule
              const compliant = rule ? rule.type === 'exact' ? item.quantity === rule.quantity : rule.type === 'min' ? item.quantity >= rule.quantity : item.quantity <= rule.quantity : true
              return <div key={item.plantId}><span className="road-plant"><b>{item.plant}</b>{rule && <small>{roadRuleLabel(rule.type)} {integer.format(rule.quantity)}</small>}</span><strong>{integer.format(item.quantity)}</strong><span className={compliant ? 'road-compliance ok' : 'road-compliance bad'}>{compliant ? <Check size={13} /> : <AlertTriangle size={13} />} {compliant ? 'Cumple' : 'No cumple'}</span></div>
            })}</div>
          </section>

          <section className="panel chart-panel">
            <SectionHeader number="04" icon={<BarChart3 />} title="Volumen por planta y medio" description="Cantidad y porcentaje que aporta cada naviera y el rodoviario sobre el total de cada planta." />
            <ResponsiveContainer width="100%" height={280}><BarChart data={chartData} margin={{ top: 15, right: 10, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d9d6cb" /><XAxis dataKey="name" tick={{ fill: '#53646a', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#53646a', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value, name, item) => { const row = item.payload as Record<string, string | number>; return [`${integer.format(Number(value))} vehículos · ${formatPercentage(Number(value), Number(row.total))}`, String(name)] }} /><Legend />{transportMeans.map((medium, index) => <Bar key={medium.key} dataKey={medium.key} name={medium.label} stackId="transport" fill={medium.color} radius={index === transportMeans.length - 1 ? [4, 4, 0, 0] : undefined} label={{ content: renderTransportLabel(medium.key, chartData, medium.color === '#dcae49' ? '#112a33' : '#ffffff') }} />)}</BarChart></ResponsiveContainer>
            <div className="transport-matrix-scroll">
              <div className="transport-matrix" style={{ gridTemplateColumns: `minmax(105px, 1.25fr) repeat(${transportMeans.length}, minmax(66px, 1fr)) minmax(70px, .8fr)` }}>
                <div className="matrix-head">Planta</div>
                {transportMeans.map((medium) => <div className="matrix-head medium-head" key={medium.key}><i style={{ background: medium.color }} />{medium.label}</div>)}
                <div className="matrix-head total-head">Total</div>
                {chartData.flatMap((row) => [
                  <div className="matrix-plant" key={`${row.name}-name`}>{row.name}</div>,
                  ...transportMeans.map((medium) => <div className="matrix-value" key={`${row.name}-${medium.key}`}><strong>{integer.format(Number(row[medium.key]))}</strong><small>{formatPercentage(Number(row[medium.key]), Number(row.total))}</small></div>),
                  <div className="matrix-value matrix-total" key={`${row.name}-total`}><strong>{integer.format(Number(row.total))}</strong><small>{formatPercentage(Number(row.total), Number(row.total))}</small></div>,
                ])}
              </div>
            </div>
          </section>

          <section className="panel chart-panel">
            <SectionHeader number="05" icon={<CircleDollarSign />} title="Composición del costo" description="Participación económica por modalidad." />
            <div className="pie-wrap"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={costData} dataKey="value" innerRadius={62} outerRadius={92} paddingAngle={3}>{costData.map((_, index) => <Cell key={index} fill={COLORS[index]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value))} /></PieChart></ResponsiveContainer><div className="pie-center"><strong>{costData.length}</strong><span>modalidades</span></div></div>
            <div className="chart-legend">{costData.map((item, index) => <div key={item.name}><i style={{ background: COLORS[index] }} /><span>{item.name}</span><strong>{money.format(item.value)}</strong></div>)}</div>
          </section>

          <section className="panel explanation span-2">
            <SectionHeader number="06" icon={<Info />} title="¿Por qué esta combinación?" description="Una explicación simple de la lógica económica del resultado." />
            <ol>{result.messages.map((message, index) => <li key={message}><span>{String(index + 1).padStart(2, '0')}</span><p>{message}</p></li>)}</ol>
          </section>
        </div>
      </>}
    </div>
  )
}

function MetricCard({ icon, label, value, suffix, accent }: { icon: React.ReactNode; label: string; value: string; suffix?: string; accent?: boolean }) {
  return <div className={accent ? 'metric-card accent' : 'metric-card'}><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong>{suffix && <small>{suffix}</small>}<i /></div>
}

function EmptyResult({ onOptimize }: { onOptimize: () => void }) {
  return <div className="empty-result"><div className="radar"><span /><BarChart3 /></div><span className="eyebrow">MODELO SIN EJECUTAR</span><h2>Convertí restricciones en una decisión clara.</h2><p>Ejecutá el optimizador para obtener el menor costo factible y la distribución completa.</p><button className="optimize-button" onClick={onOptimize}><BarChart3 /> Optimizar ahora</button></div>
}

function FailureResult({ result }: { result: OptimizationResult }) {
  const invalid = result.status === 'invalid'
  return <div className="failure-result"><span className="failure-icon">{invalid ? <FileJson /> : <AlertTriangle />}</span><span className="eyebrow">{invalid ? 'ERROR DE DATOS' : result.status === 'infeasible' ? 'ESCENARIO INVIABLE' : 'ERROR DEL OPTIMIZADOR'}</span><h2>{invalid ? 'Hay datos que necesitan revisión.' : result.status === 'infeasible' ? 'No existe una solución que cumpla todo.' : 'No se pudo completar el cálculo.'}</h2><p>No se modificó ninguna restricción. Corregí la causa y volvé a optimizar.</p><ul>{result.messages.map((message) => <li key={message}>{message}</li>)}</ul></div>
}

function CompareView({ scenario, onChange }: { scenario: Scenario; onChange: (rows: EffectiveAllocation[]) => void }) {
  const effective = useMemo(() => scenario.effectiveDistribution ?? [], [scenario.effectiveDistribution])
  const calculation = useMemo(() => calculateEffectiveDistribution(scenario.data, effective), [scenario.data, effective])
  const simulation = scenario.result?.status === 'optimal' ? scenario.result : undefined
  const carrierNames = scenario.data.carriers
    .map((carrier) => carrier.name)
    .filter((name, index, names) => names.findIndex((item) => normalizeCarrierName(item) === normalizeCarrierName(name)) === index)
  const validComparison = Boolean(simulation && effective.length && !calculation.errors.length)
  const delta = validComparison ? calculation.totalCost - (simulation?.totalCost ?? 0) : 0

  const updateRow = (id: string, updates: Partial<EffectiveAllocation>) =>
    onChange(effective.map((row) => row.id === id ? { ...row, ...updates } : row))
  const addRow = () => onChange([...effective, {
    id: crypto.randomUUID(),
    plantId: scenario.data.plants[0]?.id ?? '',
    mode: 'Marítimo',
    carrierName: carrierNames[0] ?? '',
    terminal: TERMINALS[0],
    quantity: 0,
  }])
  const flowComparison = useMemo(() => {
    const simulated = new Map<string, number>()
    const actual = new Map<string, number>()
    scenario.result?.allocations.forEach((row) => simulated.set(allocationKey(row), (simulated.get(allocationKey(row)) ?? 0) + row.quantity))
    calculation.rows.forEach((row) => actual.set(effectiveFlowKey(row), (actual.get(effectiveFlowKey(row)) ?? 0) + row.quantity))
    return [...new Set([...simulated.keys(), ...actual.keys()])].map((key) => ({ key, simulated: simulated.get(key) ?? 0, actual: actual.get(key) ?? 0 }))
  }, [scenario.result, calculation.rows])

  return <div className="view-stack enter">
    <div className="intro-grid"><div><span className="eyebrow orange">SIMULACIÓN VS. REALIDAD</span><h1>Comparar distribución</h1><p>Cargá el transporte efectivo y medí su costo contra la solución óptima de {scenario.name}. Las tarifas se heredan automáticamente de Datos.</p></div><div className="compare-icon"><ArrowLeftRight /></div></div>

    {!simulation && <div className="validation-panel info"><Info /><div><strong>El escenario todavía no tiene una solución óptima.</strong><p>Podés cargar la distribución efectiva ahora, pero necesitás optimizar el escenario para calcular la diferencia.</p></div></div>}

    <section className="panel">
      <SectionHeader number="01" icon={<Truck />} title="Distribución efectiva" description="Ingresá lo realmente transportado. El costo unitario proviene de las tarifas del escenario." action={<div className="section-button-group"><button className="button-secondary" onClick={() => simulation && onChange(effectiveFromOptimization(simulation))} disabled={!simulation}><Copy size={16} /> Copiar simulación</button><button className="button-secondary" onClick={addRow} disabled={!scenario.data.plants.length}><Plus size={16} /> Agregar movimiento</button></div>} />
      <div className="table-scroll">
        <table className="data-table effective-table">
          <thead><tr><th>Planta</th><th>Modalidad</th><th>Naviera</th><th>Terminal</th><th>Cantidad</th><th className="right">Costo unit.</th><th className="right">Subtotal</th><th aria-label="Acciones" /></tr></thead>
          <tbody>{effective.map((row) => {
            const calculated = calculation.rows.find((item) => item.id === row.id)
            return <tr key={row.id} className={calculated?.error ? 'error-row' : ''}>
              <td><select value={row.plantId} onChange={(event) => updateRow(row.id, { plantId: event.target.value })}>{scenario.data.plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></td>
              <td><select value={row.mode} onChange={(event) => updateRow(row.id, event.target.value === 'Rodoviario' ? { mode: 'Rodoviario', carrierName: undefined, terminal: undefined } : { mode: 'Marítimo', carrierName: carrierNames[0] ?? '', terminal: TERMINALS[0] })}><option value="Marítimo">Marítimo</option><option value="Rodoviario">Rodoviario</option></select></td>
              <td>{row.mode === 'Marítimo' ? <select value={row.carrierName ?? ''} onChange={(event) => updateRow(row.id, { carrierName: event.target.value })}>{carrierNames.map((name) => <option key={name} value={name}>{name}</option>)}</select> : <span className="not-applicable">—</span>}</td>
              <td>{row.mode === 'Marítimo' ? <select value={row.terminal ?? TERMINALS[0]} onChange={(event) => updateRow(row.id, { terminal: event.target.value })}>{TERMINALS.map((terminal) => <option key={terminal} value={terminal}>{terminal}</option>)}</select> : <span className="not-applicable">—</span>}</td>
              <td><input className="number-input" type="number" min="0" step="1" value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: numberValue(event.target.value) })} /></td>
              <td className="right derived-cost">{calculated?.unitCost === null || calculated?.unitCost === undefined ? <span>Sin tarifa</span> : money.format(calculated.unitCost)}</td>
              <td className="right derived-cost strong">{calculated?.totalCost === null || calculated?.totalCost === undefined ? '—' : money.format(calculated.totalCost)}</td>
              <td className="cell-action"><button className="icon-button danger" onClick={() => onChange(effective.filter((item) => item.id !== row.id))} aria-label="Eliminar movimiento"><Trash2 size={17} /></button></td>
            </tr>
          })}</tbody>
          {effective.length > 0 && <tfoot><tr><td colSpan={4}>TOTAL EFECTIVO</td><td>{integer.format(calculation.totalVehicles)}</td><td /><td className="right">{money.format(calculation.totalCost)}</td><td /></tr></tfoot>}
        </table>
      </div>
      {!effective.length && <div className="effective-empty"><Truck /><strong>Todavía no cargaste movimientos efectivos.</strong><span>Agregalos manualmente o copiá la simulación como punto de partida.</span></div>}
    </section>

    {calculation.errors.length > 0 && <ValidationPanel errors={calculation.errors} />}

    {effective.length > 0 && <>
      <div className="comparison-cards">
        <ComparisonSnapshot label="Simulación óptima" totalCost={simulation?.totalCost} averageCost={simulation?.averageCost} totalVehicles={simulation?.totalVehicles ?? 0} muted={!simulation} />
        <div className={!validComparison || delta === 0 ? 'delta neutral' : delta > 0 ? 'delta bad' : 'delta good'}><span>Diferencia efectiva − óptima</span><strong>{validComparison ? `${delta >= 0 ? '+' : '−'}${money.format(Math.abs(delta))}` : 'Pendiente'}</strong><small>{!validComparison ? 'Completá los datos requeridos' : delta === 0 ? 'Mismo costo total' : delta > 0 ? 'La efectiva es más costosa' : 'La efectiva es más económica'}</small></div>
        <ComparisonSnapshot label="Distribución efectiva" totalCost={calculation.totalCost} averageCost={calculation.averageCost} totalVehicles={calculation.totalVehicles} muted={Boolean(calculation.errors.length)} />
      </div>

      <section className="panel"><SectionHeader number="02" icon={<ArrowLeftRight />} title="Diferencias de distribución" description="Cantidad simulada y efectiva para cada flujo." /><div className="table-scroll"><table className="result-table"><thead><tr><th>Flujo</th><th className="right">Simulación</th><th className="right">Efectiva</th><th className="right">Diferencia</th></tr></thead><tbody>{flowComparison.map((row) => <tr key={row.key}><td>{row.key}</td><td className="right mono">{integer.format(row.simulated)}</td><td className="right mono">{integer.format(row.actual)}</td><td className="right mono strong">{row.actual - row.simulated > 0 ? '+' : ''}{integer.format(row.actual - row.simulated)}</td></tr>)}</tbody></table></div></section>
    </>}
  </div>
}

function ComparisonSnapshot({ label, totalCost, averageCost, totalVehicles, muted }: { label: string; totalCost?: number; averageCost?: number; totalVehicles: number; muted?: boolean }) {
  return <article className={muted ? 'comparison-card is-muted' : 'comparison-card'}><span>{label}</span><strong>{totalCost === undefined ? 'Pendiente' : money.format(totalCost)}</strong><small>{averageCost === undefined ? 'Sin calcular' : `${money.format(averageCost)} / vehículo`}</small><div><ArrowLeftRight size={16} /> {integer.format(totalVehicles)} vehículos</div></article>
}

function allocationKey(item: OptimizationResult['allocations'][number]) {
  return item.mode === 'Rodoviario' ? `${item.plant} / Rodoviario` : `${item.plant} / ${item.carrier} / ${item.terminal}`
}

const numberValue = (value: string) => value === '' ? 0 : Number(value)
const nullableNumber = (value: string) => value === '' ? null : Number(value)
const roadRuleLabel = (type: Plant['roadRule']['type']) => type === 'exact' ? 'exactamente' : type === 'min' ? 'como mínimo' : 'como máximo'
const normalizeCarrierName = (name: string) => name.trim().toLocaleLowerCase()
const formatPercentage = (value: number, total: number) => percentage.format(total > 0 ? value / total : 0)

function renderTransportLabel(key: string, rows: Array<Record<string, string | number>>, fill: string) {
  return ({ viewBox, index }: LabelProps) => {
    if (index === undefined || !viewBox || !('x' in viewBox) || viewBox.height < 25 || viewBox.width < 58) return <></>
    const value = Number(rows[index]?.[key] ?? 0)
    const total = Number(rows[index]?.total ?? 0)
    if (!value) return <></>
    return <text x={viewBox.x + viewBox.width / 2} y={viewBox.y + viewBox.height / 2} fill={fill} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="700">{integer.format(value)} · {formatPercentage(value, total)}</text>
  }
}

export default App
