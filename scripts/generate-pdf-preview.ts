import { mkdir, writeFile } from 'node:fs/promises'
import GLPK from 'glpk.js/node'
import { createInitialScenario } from '../src/data/defaultScenario'
import { effectiveFromOptimization } from '../src/lib/effectiveDistribution'
import { optimizeTransport } from '../src/lib/optimizer'
import { buildScenariosPdf } from '../src/lib/pdfReport'

const scenario = createInitialScenario()
const solver = await GLPK()
scenario.result = await optimizeTransport(scenario.data, solver)
scenario.effectiveDistribution = effectiveFromOptimization(scenario.result)

const doc = await buildScenariosPdf([scenario])
await mkdir('output/pdf', { recursive: true })
await writeFile('output/pdf/ruta-optima-informe-muestra.pdf', Buffer.from(doc.output('arraybuffer')))
