import type { VideoDocument } from '@variax-ai/video-schema'
import { createDocumentDrawer } from './index'
import type { RendererOptions } from './types'
import { createStubCtx } from './test-helpers'

/**
 * Renders `doc` at each timestamp and serialises the recorded canvas call
 * stream. Snapshotting the result pins exact paint order and arguments — a
 * stricter check than pixel equality, and the one that catches the regressions
 * that actually bite here (persisted-paint order, missing scale anchors,
 * centre-anchored shapes).
 */
export function renderCallStream(
  doc: VideoDocument,
  options: RendererOptions,
  timestamps: number[],
): string {
  const draw = createDocumentDrawer(doc, options)
  const out: string[] = []
  for (const tMs of timestamps) {
    const ctx = createStubCtx()
    draw(ctx, tMs)
    out.push(`--- t=${tMs} ---`)
    for (const call of ctx.calls) {
      out.push(`${call.method}(${call.args.map(formatArg).join(', ')})`)
    }
  }
  return out.join('\n')
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'number') {
    // Collapse float noise so snapshots survive harmless last-bit drift.
    return Number.isInteger(arg) ? String(arg) : arg.toFixed(4)
  }
  if (typeof arg === 'string') return JSON.stringify(arg)
  if (arg === null || arg === undefined) return String(arg)
  if (typeof arg === 'object') return `<${arg.constructor?.name ?? 'object'}>`
  return String(arg)
}
