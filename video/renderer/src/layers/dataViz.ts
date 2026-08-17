import type { DataVizLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'

export function drawDataVizLayer(
  ctx: CanvasRenderingContext2D,
  layer: DataVizLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const renderer = rctx.options.dataVizRenderers?.[layer.viz]
  if (!renderer) return

  renderer(
    ctx,
    tMs,
    layer.data,
    layer.area ?? {},
    layer.style ?? {},
    layer.animation ?? {},
  )
}
