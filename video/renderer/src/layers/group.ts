import type { GroupLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'

export function drawGroupLayer(
  ctx: CanvasRenderingContext2D,
  layer: GroupLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  for (const child of layer.children) {
    rctx.drawLayer(ctx, child, tMs)
  }
}
