import type { jsPDF as JsPdf } from 'jspdf'
import type { Scenario } from '../types'
import { terminalScopeLabel } from '../constants'
import { calculateEffectiveDistribution } from './effectiveDistribution'

type PdfWithTable = JsPdf & { lastAutoTable?: { finalY: number } }
type AutoTable = typeof import('jspdf-autotable')['autoTable']

const ink: [number, number, number] = [17, 42, 51]
const orange: [number, number, number] = [239, 106, 58]
const muted: [number, number, number] = [87, 105, 110]
const pale: [number, number, number] = [241, 240, 233]

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export async function downloadScenariosPdf(scenarios: Scenario[], filename: string): Promise<void> {
  const doc = await buildScenariosPdf(scenarios)
  doc.save(filename)
}

export async function buildScenariosPdf(scenarios: Scenario[]): Promise<JsPdf> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  scenarios.forEach((scenario, index) => {
    if (index > 0) doc.addPage()
    renderScenario(doc, autoTable, scenario, index + 1, scenarios.length)
  })
  addPageFooters(doc)
  return doc
}

function renderScenario(doc: PdfWithTable, autoTable: AutoTable, scenario: Scenario, index: number, count: number) {
  renderHeader(doc, scenario, index, count)
  let y = 44

  const totalVehicles = scenario.data.plants.reduce((sum, plant) => sum + plant.volume, 0)
  metric(doc, 14, y, 56, 'VOLUMEN', `${integer.format(totalVehicles)} veh.`)
  metric(doc, 76, y, 56, 'ESTADO', statusLabel(scenario.result?.status))
  metric(doc, 138, y, 58, 'COSTO OPTIMO', scenario.result?.totalCost === undefined ? 'Sin calcular' : money.format(scenario.result.totalCost))
  y += 25

  y = sectionTitle(doc, 'Datos del escenario', y)
  autoTable(doc, tableOptions(y, ['Planta', 'Volumen', 'Regla rodoviaria', 'Costo rodoviario'], scenario.data.plants.map((plant) => [
    plant.name,
    integer.format(plant.volume),
    `${ruleLabel(plant.roadRule.type)} ${integer.format(plant.roadRule.quantity)}`,
    money.format(plant.roadCost),
  ])))
  y = finalY(doc) + 6

  y = ensureSpace(doc, y, 42)
  y = sectionTitle(doc, 'Navieras y compromisos', y)
  autoTable(doc, tableOptions(y, ['Naviera', 'Terminal', 'Minimo', 'Capacidad'], scenario.data.carriers.map((carrier) => [
    carrier.name,
    terminalScopeLabel(carrier.terminalScope),
    integer.format(carrier.min),
    carrier.max === null ? 'Sin limite' : integer.format(carrier.max),
  ])))
  y = finalY(doc) + 6

  y = ensureSpace(doc, y, 55)
  y = sectionTitle(doc, 'Tarifas maritimas', y)
  autoTable(doc, tableOptions(y, ['Planta', 'Naviera', 'Terminal', 'Costo unit.', 'Estado'], scenario.data.seaRates.map((rate) => {
    const plant = scenario.data.plants.find((item) => item.id === rate.plantId)?.name ?? 'Desconocida'
    const carrier = scenario.data.carriers.find((item) => item.id === rate.carrierId)?.name ?? 'Desconocida'
    return [plant, carrier, rate.terminal, money.format(rate.cost), rate.enabled ? 'Habilitado' : 'Deshabilitado']
  })))
  y = finalY(doc) + 7

  if (scenario.result?.status === 'optimal') {
    y = ensureSpace(doc, y, 70)
    y = sectionTitle(doc, 'Resultado optimo', y)
    const result = scenario.result
    autoTable(doc, tableOptions(y, ['Planta', 'Modalidad', 'Naviera', 'Terminal', 'Cantidad', 'Costo unit.', 'Subtotal'], result.allocations.map((row) => [
      row.plant,
      row.mode,
      row.carrier ?? '-',
      row.terminal,
      integer.format(row.quantity),
      money.format(row.unitCost),
      money.format(row.totalCost),
    ]), [0, 0, 0, 0, 2, 2, 2]))
    y = finalY(doc) + 6
    y = ensureSpace(doc, y, 38)
    autoTable(doc, tableOptions(y, ['Naviera', 'Terminal', 'Asignado', 'Minimo', 'Capacidad', 'Cumple'], result.carrierSummaries.map((row) => [
      row.carrier,
      terminalScopeLabel(row.terminalScope),
      integer.format(row.quantity),
      integer.format(row.min),
      row.max === null ? 'Sin limite' : integer.format(row.max),
      row.minMet && row.maxMet ? 'Si' : 'No',
    ])))
    y = finalY(doc) + 7
  }

  if (scenario.effectiveDistribution?.length) {
    const effective = calculateEffectiveDistribution(scenario.data, scenario.effectiveDistribution)
    y = ensureSpace(doc, y, 65)
    y = sectionTitle(doc, 'Distribucion efectiva', y)
    autoTable(doc, tableOptions(y, ['Planta', 'Modalidad', 'Naviera', 'Terminal', 'Cantidad', 'Costo unit.', 'Subtotal'], effective.rows.map((row) => [
      row.plant,
      row.mode,
      row.carrierName ?? '-',
      row.terminal,
      integer.format(row.quantity),
      row.unitCost === null ? 'Sin tarifa' : money.format(row.unitCost),
      row.totalCost === null ? '-' : money.format(row.totalCost),
    ]), [0, 0, 0, 0, 2, 2, 2]))
    y = finalY(doc) + 6
    y = ensureSpace(doc, y, 28)
    const optimal = scenario.result?.status === 'optimal' ? scenario.result.totalCost ?? 0 : undefined
    const difference = optimal === undefined ? undefined : effective.totalCost - optimal
    doc.setFillColor(...pale)
    doc.roundedRect(14, y, 182, 19, 2, 2, 'F')
    doc.setTextColor(...ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`Costo efectivo: ${money.format(effective.totalCost)}`, 19, y + 8)
    doc.text(`Promedio: ${money.format(effective.averageCost)}`, 78, y + 8)
    doc.setTextColor(...(difference !== undefined && difference > 0 ? orange : ink))
    doc.text(`Diferencia: ${difference === undefined ? 'Sin comparar' : `${difference >= 0 ? '+' : '-'}${money.format(Math.abs(difference))}`}`, 137, y + 8)
    doc.setTextColor(...muted)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(effective.errors.length ? `Advertencias: ${effective.errors.length}` : 'Volumen efectivo completo y valorizado.', 19, y + 14)
  }
}

function renderHeader(doc: JsPdf, scenario: Scenario, index: number, count: number) {
  doc.setFillColor(...ink)
  doc.rect(0, 0, 210, 35, 'F')
  doc.setFillColor(...orange)
  doc.rect(0, 0, 5, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('RUTA OPTIMA', 14, 15)
  doc.setFontSize(11)
  doc.text(scenario.name, 14, 25)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(180, 197, 201)
  doc.text(`Informe de escenario ${index} de ${count}`, 196, 15, { align: 'right' })
  doc.text(`Actualizado: ${new Date(scenario.updatedAt).toLocaleString('es-AR')}`, 196, 25, { align: 'right' })
}

function metric(doc: JsPdf, x: number, y: number, width: number, label: string, value: string) {
  doc.setFillColor(251, 250, 245)
  doc.setDrawColor(218, 215, 204)
  doc.roundedRect(x, y, width, 18, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...muted)
  doc.text(label, x + 4, y + 6)
  doc.setFontSize(10)
  doc.setTextColor(...ink)
  doc.text(value, x + 4, y + 13)
}

function sectionTitle(doc: JsPdf, title: string, y: number): number {
  doc.setFillColor(...orange)
  doc.rect(14, y, 2, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...ink)
  doc.text(title, 20, y + 5.5)
  return y + 10
}

function tableOptions(startY: number, head: string[], body: Array<Array<string>>, rightAlignedColumns: number[] = []) {
  return {
    startY,
    margin: { left: 14, right: 14, top: 16, bottom: 15 },
    head: [head],
    body,
    theme: 'grid' as const,
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2.3, textColor: ink, lineColor: [224, 222, 214] as [number, number, number], lineWidth: 0.15 },
    headStyles: { fillColor: ink, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [248, 247, 241] as [number, number, number] },
    columnStyles: Object.fromEntries(rightAlignedColumns.map((column) => [column, { halign: 'right' as const }])),
  }
}

function ensureSpace(doc: JsPdf, y: number, needed: number): number {
  if (y + needed < 280) return y
  doc.addPage()
  return 18
}

function finalY(doc: PdfWithTable): number {
  return doc.lastAutoTable?.finalY ?? 20
}

function addPageFooters(doc: JsPdf) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(216, 214, 203)
    doc.line(14, 287, 196, 287)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...muted)
    doc.text('Generado localmente por Ruta Optima', 14, 292)
    doc.text(`${page} / ${pages}`, 196, 292, { align: 'right' })
  }
}

function statusLabel(status?: string) {
  if (status === 'optimal') return 'Solucion optima'
  if (status === 'infeasible') return 'Inviable'
  if (status === 'invalid') return 'Datos invalidos'
  if (status === 'error') return 'Error'
  return 'Sin optimizar'
}

function ruleLabel(type: 'exact' | 'min' | 'max') {
  return type === 'exact' ? 'Exacta' : type === 'min' ? 'Minima' : 'Maxima'
}
