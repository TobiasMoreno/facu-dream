import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Gauge,
  LoaderCircle,
  Ship,
  TableProperties,
  Truck,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LabelProps } from 'recharts'
import { terminalScopeLabel } from './constants'
import { createAnnualPlan, MONTHS, monthlyVolume, optimizeAnnualPlan, validateAnnualPlan } from './lib/annualPlan'
import { validateScenario } from './lib/validation'
import type { AnnualPlan, OptimizationResult, Scenario } from './types'

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const COLORS = ['#173e48', '#2b7a78', '#dcae49', '#477998', '#88498f', '#788b91']

interface AnnualViewProps {
  scenario: Scenario
  onChange: (plan: AnnualPlan) => void
}

export default function AnnualView({ scenario, onChange }: AnnualViewProps) {
  const plan = useMemo(() => scenario.annualPlan ?? createAnnualPlan(scenario.data), [scenario.annualPlan, scenario.data])
  const [tab, setTab] = useState<'input' | 'results'>(plan.results ? 'results' : 'input')
  const [selectedMonth, setSelectedMonth] = useState(0)
  const [optimizing, setOptimizing] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const errors = useMemo(() => [...validateScenario(scenario.data), ...validateAnnualPlan(plan, scenario.data)], [plan, scenario.data])

  const updatePlan = (updates: Partial<AnnualPlan>, invalidate = true) => {
    onChange({
      ...plan,
      ...updates,
      ...(invalidate ? { results: undefined, optimizedAt: undefined } : {}),
    })
  }

  const updateVolume = (plantId: string, month: number, value: number) => {
    const plant = scenario.data.plants.find((item) => item.id === plantId)
    const values = Array.from({ length: 12 }, (_, index) => monthlyVolume(plan, plantId, index, plant?.volume ?? 0))
    values[month] = value
    updatePlan({ monthlyVolumes: { ...plan.monthlyVolumes, [plantId]: values } })
  }

  const copyCurrentVolumes = () => updatePlan({
    monthlyVolumes: Object.fromEntries(scenario.data.plants.map((plant) => [plant.id, Array(12).fill(plant.volume)])),
  })

  const run = async () => {
    if (errors.length) {
      setTab('input')
      return
    }
    setRunError(null)
    setOptimizing(true)
    setTab('results')
    try {
      const results = await optimizeAnnualPlan(plan, scenario.data)
      onChange({ ...plan, results, optimizedAt: new Date().toISOString() })
      const firstIssue = results.find((item) => item.result.status !== 'optimal')
      setSelectedMonth(firstIssue?.month ?? 0)
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'No se pudo completar la optimización anual.')
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <div className="view-stack enter annual-view">
      <div className="annual-hero">
        <div>
          <span className="eyebrow orange">PLANIFICACIÓN DE 12 MESES</span>
          <h1>Anualizado <em>{plan.year}</em></h1>
          <p>Cargá la demanda de cada planta por mes. Las mismas tarifas, navieras, capacidades y reglas del escenario se aplican de forma independiente en cada período.</p>
        </div>
        <div className="annual-year-control">
          <CalendarDays />
          <label><span>Año del plan</span><input aria-label="Año del plan" type="number" min="2000" max="2200" value={plan.year} onChange={(event) => updatePlan({ year: Number(event.target.value) })} /></label>
        </div>
      </div>

      <div className="annual-tabs" role="tablist" aria-label="Secciones del plan anual">
        <button role="tab" aria-selected={tab === 'input'} className={tab === 'input' ? 'active' : ''} onClick={() => setTab('input')}><TableProperties /> Carga mensual</button>
        <button role="tab" aria-selected={tab === 'results'} className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}><BarChart3 /> Resultado anual {plan.results && <span>{plan.results.filter((item) => item.result.status === 'optimal').length}/12</span>}</button>
      </div>

      {tab === 'input' ? (
        <AnnualInput plan={plan} scenario={scenario} errors={errors} onVolumeChange={updateVolume} onCopyCurrent={copyCurrentVolumes} onRun={() => void run()} optimizing={optimizing} />
      ) : (
        <AnnualResults plan={plan} scenario={scenario} selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} onRun={() => void run()} optimizing={optimizing} runError={runError} />
      )}
    </div>
  )
}

function AnnualInput({ plan, scenario, errors, onVolumeChange, onCopyCurrent, onRun, optimizing }: {
  plan: AnnualPlan
  scenario: Scenario
  errors: string[]
  onVolumeChange: (plantId: string, month: number, value: number) => void
  onCopyCurrent: () => void
  onRun: () => void
  optimizing: boolean
}) {
  const annualTotal = scenario.data.plants.reduce((sum, plant) => sum + MONTHS.reduce((monthSum, _, month) => monthSum + monthlyVolume(plan, plant.id, month, plant.volume), 0), 0)
  return <>
    {errors.length > 0 && <div className="validation-panel"><AlertTriangle /><div><strong>Revisá los datos antes de optimizar</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}

    <section className="panel annual-volume-panel">
      <div className="annual-section-heading">
        <div><span className="eyebrow">01 / DEMANDA</span><h2>Volúmenes mensuales por planta</h2><p>Los valores iniciales replican el volumen actual del escenario en cada mes.</p></div>
        <button className="button-secondary" onClick={onCopyCurrent}><Copy size={16} /> Repetir volumen actual</button>
      </div>
      <div className="table-scroll">
        <table className="annual-input-table">
          <thead><tr><th className="sticky-column">Planta</th>{MONTHS.map((month) => <th key={month.short}>{month.short}</th>)}<th>Total anual</th></tr></thead>
          <tbody>{scenario.data.plants.map((plant) => {
            const values = MONTHS.map((_, month) => monthlyVolume(plan, plant.id, month, plant.volume))
            return <tr key={plant.id}>
              <td className="sticky-column"><strong>{plant.name || 'Sin nombre'}</strong><small>Base: {integer.format(plant.volume)}</small></td>
              {values.map((value, month) => <td key={month}><input aria-label={`${plant.name} ${MONTHS[month].long}`} type="number" min="0" step="1" value={value} onChange={(event) => onVolumeChange(plant.id, month, numberValue(event.target.value))} /></td>)}
              <td className="annual-row-total">{integer.format(values.reduce((sum, value) => sum + value, 0))}</td>
            </tr>
          })}</tbody>
          <tfoot><tr><td className="sticky-column">TOTAL MES</td>{MONTHS.map((_, month) => <td key={month}>{integer.format(scenario.data.plants.reduce((sum, plant) => sum + monthlyVolume(plan, plant.id, month, plant.volume), 0))}</td>)}<td>{integer.format(annualTotal)}</td></tr></tfoot>
        </table>
      </div>
      <div className="annual-table-note"><CalendarDays size={17} /><span>Cada mes se resuelve como un escenario completo. Un volumen bajo puede resultar inviable si no alcanza los mínimos configurados en Datos.</span></div>
    </section>

    <div className="data-cta annual-cta"><div><span>{integer.format(annualTotal)} vehículos planificados para {plan.year}</span><p>Se ejecutarán 12 optimizaciones con la configuración actual de {scenario.name}.</p></div><button className="optimize-button" disabled={optimizing || errors.length > 0} onClick={onRun}>{optimizing ? <LoaderCircle className="spin" /> : <BarChart3 />} {optimizing ? 'Calculando…' : 'Optimizar 12 meses'}</button></div>
  </>
}

function AnnualResults({ plan, scenario, selectedMonth, onSelectMonth, onRun, optimizing, runError }: {
  plan: AnnualPlan
  scenario: Scenario
  selectedMonth: number
  onSelectMonth: (month: number) => void
  onRun: () => void
  optimizing: boolean
  runError: string | null
}) {
  const [chartMeasure, setChartMeasure] = useState<'volume' | 'percentage'>('volume')
  const results = plan.results ?? []
  const optimalResults = results.filter((item) => item.result.status === 'optimal')
  const selected = results.find((item) => item.month === selectedMonth)?.result
  const totalCost = optimalResults.reduce((sum, item) => sum + (item.result.totalCost ?? 0), 0)
  const totalVehicles = optimalResults.reduce((sum, item) => sum + (item.result.totalVehicles ?? 0), 0)
  const maritime = optimalResults.reduce((sum, item) => sum + item.result.allocations.filter((allocation) => allocation.mode === 'Marítimo').reduce((monthSum, allocation) => monthSum + allocation.quantity, 0), 0)
  const road = optimalResults.reduce((sum, item) => sum + item.result.roadByPlant.reduce((monthSum, item) => monthSum + item.quantity, 0), 0)
  const carriers = scenario.data.carriers.filter((carrier, index, all) => all.findIndex((item) => normalize(item.name) === normalize(carrier.name)) === index)
  const means = [...carriers.map((carrier, index) => ({ key: carrier.id, label: carrier.name, color: COLORS[index % COLORS.length] })), { key: 'road', label: 'Rodoviario', color: '#ef6a3a' }]
  const chartData = MONTHS.map((month, index) => {
    const result = results.find((item) => item.month === index)?.result
    const row: Record<string, string | number> = { month: month.short }
    carriers.forEach((carrier) => {
      row[carrier.id] = result?.allocations.filter((allocation) => allocation.mode === 'Marítimo' && normalize(allocation.carrier ?? '') === normalize(carrier.name)).reduce((sum, allocation) => sum + allocation.quantity, 0) ?? 0
    })
    row.road = result?.roadByPlant.reduce((sum, item) => sum + item.quantity, 0) ?? 0
    return row
  })
  const displayedChartData = chartMeasure === 'volume' ? chartData : chartData.map((row) => {
    const total = means.reduce((sum, medium) => sum + Number(row[medium.key]), 0)
    return { ...row, ...Object.fromEntries(means.map((medium) => [medium.key, total > 0 ? Number(row[medium.key]) / total * 100 : 0])) }
  })

  if (optimizing) return <div className="status-card loading annual-loading"><LoaderCircle className="spin" /><h2>Resolviendo los 12 meses…</h2><p>Se están aplicando las reglas del escenario a cada volumen mensual.</p></div>
  if (runError) return <div className="failure-result"><span className="failure-icon"><AlertTriangle /></span><span className="eyebrow">ERROR DEL PLAN ANUAL</span><h2>No se pudo completar el cálculo.</h2><p>{runError}</p><button className="optimize-button" onClick={onRun}>Volver a intentar</button></div>
  if (!results.length) return <div className="empty-result annual-empty"><div className="calendar-stack"><CalendarDays /></div><span className="eyebrow">PLAN SIN EJECUTAR</span><h2>Doce meses, una sola lectura.</h2><p>Cargá los volúmenes mensuales y ejecutá el anualizado para ver la distribución por planta, naviera y modalidad.</p><button className="optimize-button" onClick={onRun}><BarChart3 /> Optimizar 12 meses</button></div>

  return <>
    <div className={optimalResults.length === 12 ? 'success-strip' : 'success-strip annual-warning'}>{optimalResults.length === 12 ? <CheckCircle2 /> : <AlertTriangle />}<div><strong>{optimalResults.length === 12 ? 'Plan anual optimizado' : `${optimalResults.length} de 12 meses tienen solución`}</strong><span>{optimalResults.length === 12 ? 'Todos los meses respetan las restricciones configuradas.' : 'Seleccioná los meses marcados para revisar por qué no son factibles.'}</span></div><time>{plan.optimizedAt ? new Date(plan.optimizedAt).toLocaleString('es-AR') : ''}</time><button className="button-secondary" onClick={onRun}>Recalcular</button></div>

    <div className="metric-grid">
      <AnnualMetric icon={<CircleDollarSign />} label="Costo anual" value={money.format(totalCost)} accent />
      <AnnualMetric icon={<Gauge />} label="Costo promedio" value={money.format(totalVehicles ? totalCost / totalVehicles : 0)} suffix="por vehículo" />
      <AnnualMetric icon={<Ship />} label="Volumen marítimo" value={integer.format(maritime)} suffix="vehículos" />
      <AnnualMetric icon={<Truck />} label="Volumen rodoviario" value={integer.format(road)} suffix="vehículos" />
    </div>

    <section className="panel annual-chart-panel">
      <div className="annual-section-heading"><div><span className="eyebrow">01 / PANORAMA</span><h2>Distribución mes a mes</h2><p>Aporte de cada naviera y del transporte rodoviario.</p></div><ChartMeasureSelect value={chartMeasure} onChange={setChartMeasure} /></div>
      <ResponsiveContainer width="100%" height={320}><BarChart data={displayedChartData} margin={{ top: 18, right: 22, left: -5, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d9d6cb" /><XAxis dataKey="month" tick={{ fill: '#53646a', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={chartMeasure === 'percentage' ? [0, 100] : undefined} tickFormatter={chartMeasure === 'percentage' ? (value) => `${value}%` : undefined} tick={{ fill: '#53646a', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value, name) => [chartMeasure === 'percentage' ? `${Number(value).toFixed(1)}%` : `${integer.format(Number(value))} vehículos`, String(name)]} /><Legend />{means.map((medium) => <Bar key={medium.key} dataKey={medium.key} name={medium.label} stackId="month" fill={medium.color} label={{ content: renderBarValue(chartMeasure, medium.color === '#dcae49' ? '#112a33' : '#ffffff') }} />)}</BarChart></ResponsiveContainer>
    </section>

    <section className="panel">
      <div className="annual-section-heading"><div><span className="eyebrow">02 / CONTROL</span><h2>Resumen mensual</h2><p>Seleccioná un mes para inspeccionar su asignación completa.</p></div></div>
      <div className="table-scroll"><table className="result-table annual-month-table"><thead><tr><th>Mes</th><th>Estado</th><th className="right">Vehículos</th><th className="right">Marítimo</th><th className="right">Rodoviario</th><th className="right">Costo promedio</th><th className="right">Costo total</th></tr></thead><tbody>{results.map(({ month, result }) => {
        const monthSea = result.allocations.filter((item) => item.mode === 'Marítimo').reduce((sum, item) => sum + item.quantity, 0)
        const monthRoad = result.roadByPlant.reduce((sum, item) => sum + item.quantity, 0)
        return <tr key={month} className={selectedMonth === month ? 'selected' : ''} onClick={() => onSelectMonth(month)}><td><strong>{MONTHS[month].long}</strong></td><td><StatusBadge status={result.status} /></td><td className="right mono">{integer.format(result.totalVehicles ?? 0)}</td><td className="right mono">{integer.format(monthSea)}</td><td className="right mono">{integer.format(monthRoad)}</td><td className="right mono">{result.status === 'optimal' ? money.format(result.averageCost ?? 0) : '—'}</td><td className="right mono strong">{result.status === 'optimal' ? money.format(result.totalCost ?? 0) : '—'}</td></tr>
      })}</tbody><tfoot><tr><td colSpan={2}>TOTAL ANUAL</td><td className="right">{integer.format(totalVehicles)}</td><td className="right">{integer.format(maritime)}</td><td className="right">{integer.format(road)}</td><td className="right">{money.format(totalVehicles ? totalCost / totalVehicles : 0)}</td><td className="right">{money.format(totalCost)}</td></tr></tfoot></table></div>
    </section>

    {selected && <MonthlyDetail result={selected} month={selectedMonth} scenario={scenario} />}
  </>
}

function MonthlyDetail({ result, month, scenario }: { result: OptimizationResult; month: number; scenario: Scenario }) {
  const [chartMeasure, setChartMeasure] = useState<'volume' | 'percentage'>('volume')
  if (result.status !== 'optimal') return <section className="panel annual-month-error"><div className="annual-section-heading"><div><span className="eyebrow">03 / {MONTHS[month].long.toUpperCase()}</span><h2>El mes necesita ajustes</h2><p>El optimizador no encontró una distribución válida.</p></div></div><div className="month-error-body"><AlertTriangle /> <ul>{result.messages.map((message) => <li key={message}>{message}</li>)}</ul></div></section>

  const plantTotals = scenario.data.plants.map((plant) => {
    const allocations = result.allocations.filter((item) => item.plantId === plant.id)
    return { name: plant.name, quantity: allocations.reduce((sum, item) => sum + item.quantity, 0), cost: allocations.reduce((sum, item) => sum + item.totalCost, 0) }
  })
  const carriers = scenario.data.carriers.filter((carrier, index, all) => all.findIndex((item) => normalize(item.name) === normalize(carrier.name)) === index)
  const means = [...carriers.map((carrier, index) => ({ key: carrier.id, label: carrier.name, color: COLORS[index % COLORS.length] })), { key: 'road', label: 'Rodoviario', color: '#ef6a3a' }]
  const plantChartData = scenario.data.plants.map((plant) => {
    const row: Record<string, string | number> = { name: plant.name }
    carriers.forEach((carrier) => {
      row[carrier.id] = result.allocations.filter((allocation) => allocation.plantId === plant.id && allocation.mode === 'Marítimo' && normalize(allocation.carrier ?? '') === normalize(carrier.name)).reduce((sum, allocation) => sum + allocation.quantity, 0)
    })
    row.road = result.roadByPlant.find((item) => item.plantId === plant.id)?.quantity ?? 0
    row.total = means.reduce((sum, medium) => sum + Number(row[medium.key]), 0)
    return row
  })
  const displayedPlantData = chartMeasure === 'volume' ? plantChartData : plantChartData.map((row) => {
    const total = Number(row.total)
    return { ...row, ...Object.fromEntries(means.map((medium) => [medium.key, total > 0 ? Number(row[medium.key]) / total * 100 : 0])) }
  })
  return <>
    <section className="panel annual-chart-panel">
      <div className="annual-section-heading"><div><span className="eyebrow">03 / {MONTHS[month].long.toUpperCase()}</span><h2>Volumen por planta y medio</h2><p>El mismo análisis del resultado mensual, expresado en unidades o participación.</p></div><ChartMeasureSelect value={chartMeasure} onChange={setChartMeasure} /></div>
      <ResponsiveContainer width="100%" height={280}><BarChart data={displayedPlantData} margin={{ top: 16, right: 18, left: -8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d9d6cb" /><XAxis dataKey="name" tick={{ fill: '#53646a', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={chartMeasure === 'percentage' ? [0, 100] : undefined} tickFormatter={chartMeasure === 'percentage' ? (value) => `${value}%` : undefined} tick={{ fill: '#53646a', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value, name) => [chartMeasure === 'percentage' ? `${Number(value).toFixed(1)}%` : `${integer.format(Number(value))} vehículos`, String(name)]} /><Legend />{means.map((medium) => <Bar key={medium.key} dataKey={medium.key} name={medium.label} stackId="plant" fill={medium.color} label={{ content: renderBarValue(chartMeasure, medium.color === '#dcae49' ? '#112a33' : '#ffffff') }} />)}</BarChart></ResponsiveContainer>
    </section>
    <div className="annual-detail-grid">
    <section className="panel annual-detail-main">
      <div className="annual-section-heading"><div><span className="eyebrow">04 / DETALLE DE {MONTHS[month].long.toUpperCase()}</span><h2>Asignación por planta y flujo</h2><p>Resultado completo del mes seleccionado.</p></div></div>
      <div className="table-scroll"><table className="result-table"><thead><tr><th>Planta</th><th>Modalidad</th><th>Naviera</th><th>Terminal</th><th className="right">Vehículos</th><th className="right">Costo unit.</th><th className="right">Subtotal</th></tr></thead><tbody>{result.allocations.map((item) => <tr key={item.id}><td><strong>{item.plant}</strong></td><td><span className={`mode-pill ${item.mode === 'Marítimo' ? 'sea' : 'road'}`}>{item.mode === 'Marítimo' ? <Ship size={13} /> : <Truck size={13} />}{item.mode}</span></td><td>{item.carrier ?? '—'}</td><td>{item.terminal}</td><td className="right mono">{integer.format(item.quantity)}</td><td className="right mono">{money.format(item.unitCost)}</td><td className="right mono strong">{money.format(item.totalCost)}</td></tr>)}</tbody></table></div>
    </section>
    <section className="panel annual-side-summary">
      <div className="annual-section-heading"><div><span className="eyebrow">POR PLANTA</span><h2>Participación mensual</h2></div></div>
      <div>{plantTotals.map((plant) => <article key={plant.name}><span><strong>{plant.name}</strong><small>{integer.format(plant.quantity)} vehículos</small></span><b>{money.format(plant.cost)}</b></article>)}</div>
      <div className="annual-carrier-rules"><span>Compromisos aplicados</span>{result.carrierSummaries.map((carrier) => <div key={carrier.carrierId}><strong>{carrier.carrier}</strong><small>{integer.format(carrier.quantity)} · {terminalScopeLabel(carrier.terminalScope)}</small></div>)}</div>
    </section>
    </div>
  </>
}

function StatusBadge({ status }: { status: OptimizationResult['status'] }) {
  const label = status === 'optimal' ? 'Óptimo' : status === 'infeasible' ? 'Inviable' : status === 'invalid' ? 'Datos inválidos' : 'Error'
  return <span className={`annual-status ${status}`}>{status === 'optimal' ? <CheckCircle2 /> : <AlertTriangle />}{label}</span>
}

function AnnualMetric({ icon, label, value, suffix, accent }: { icon: React.ReactNode; label: string; value: string; suffix?: string; accent?: boolean }) {
  return <div className={accent ? 'metric-card accent' : 'metric-card'}><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong>{suffix && <small>{suffix}</small>}<i /></div>
}

function ChartMeasureSelect({ value, onChange }: { value: 'volume' | 'percentage'; onChange: (value: 'volume' | 'percentage') => void }) {
  return <label className="chart-measure-select"><span>Mostrar</span><select aria-label="Mostrar gráfico como" value={value} onChange={(event) => onChange(event.target.value as 'volume' | 'percentage')}><option value="volume">Volumen</option><option value="percentage">Porcentaje</option></select><ChevronDown size={14} /></label>
}

const numberValue = (value: string) => value === '' ? 0 : Number(value)
const normalize = (value: string) => value.trim().toLocaleLowerCase()

function renderBarValue(measure: 'volume' | 'percentage', fill: string) {
  return ({ viewBox, value }: LabelProps) => {
    if (!viewBox || !('x' in viewBox) || viewBox.width < 30 || viewBox.height < 18 || !Number(value)) return <></>
    const numericValue = Number(value)
    const label = measure === 'percentage' ? `${numericValue.toFixed(1)}%` : integer.format(numericValue)
    if (label.length * 4.8 > viewBox.width) return <></>
    return <text x={viewBox.x + viewBox.width / 2} y={viewBox.y + viewBox.height / 2} fill={fill} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="700">{label}</text>
  }
}
