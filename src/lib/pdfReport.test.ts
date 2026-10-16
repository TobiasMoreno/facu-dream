import { describe, expect, it } from 'vitest'
import { createInitialScenario } from '../data/defaultScenario'
import { buildScenariosPdf } from './pdfReport'

describe('buildScenariosPdf', () => {
  it('genera un documento PDF válido para un escenario', async () => {
    const doc = await buildScenariosPdf([createInitialScenario()])
    const bytes = doc.output('arraybuffer')

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    expect(bytes.byteLength).toBeGreaterThan(5_000)
  })
})
