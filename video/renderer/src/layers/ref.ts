import type { RefLayer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { resolveColor } from '../resolve'

export function drawRefLayer(
  ctx: CanvasRenderingContext2D,
  layer: RefLayer,
  tMs: number,
  rctx: RenderContext,
): void {
  const id = layer.src.startsWith('#') ? layer.src.slice(1) : layer.src
  const drawer = rctx.options.components?.[id]
  if (!drawer) return

  drawer(ctx, tMs, {
    params: layer.params,
    color: resolveColor(layer.color, rctx.resolve),
    size: layer.size,
    position: layer.position,
  })
}
