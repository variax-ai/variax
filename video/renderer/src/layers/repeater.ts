import type { RepeaterLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'

export function drawRepeaterLayer(
  ctx: CanvasRenderingContext2D,
  layer: RepeaterLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const offset = layer.phaseOffsetMs ?? 0
  for (let i = 0; i < layer.count; i++) {
    rctx.drawLayer(ctx, layer.child, tMs - i * offset)
  }
}
