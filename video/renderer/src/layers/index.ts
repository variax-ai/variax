import type { Layer } from '@variax-ai/video-schema'
import type { RenderContext } from '../types'
import { applyTransform } from '../transform'
import { applyPreDrawEffects } from '../effects'
import { layerIsVisible } from '../condition'
import { drawShapeLayer } from './shape'
import { drawTextLayer } from './text'
import { drawImageLayer } from './image'
import { drawGroupLayer } from './group'
import { drawRefLayer } from './ref'
import { drawRepeaterLayer } from './repeater'
import { drawCaptionSequenceLayer } from './captionSequence'
import { drawCompositeMaskLayer } from './compositeMask'
import { drawDataVizLayer } from './dataViz'
import { drawStatBeatLayer } from './statBeat'
import { drawTrailLayer } from './trail'

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  tMs: number,
  rctx: RenderContext,
): void {
  if (!layerIsVisible(layer, tMs, rctx.resolve)) return

  ctx.save()

  const staticPosition = layer.type === 'ref'
    ? undefined
    : ('position' in layer ? layer.position : undefined)
  applyTransform(ctx, layer.transform, staticPosition, tMs)

  const effects = 'effects' in layer ? layer.effects : undefined
  applyPreDrawEffects(ctx, effects, tMs)

  switch (layer.type) {
    case 'shape':
      drawShapeLayer(ctx, layer, tMs, rctx)
      break
    case 'text':
      drawTextLayer(ctx, layer, tMs, rctx)
      break
    case 'image':
      drawImageLayer(ctx, layer, tMs, rctx)
      break
    case 'group':
      drawGroupLayer(ctx, layer, tMs, rctx)
      break
    case 'ref':
      drawRefLayer(ctx, layer, tMs, rctx)
      break
    case 'repeater':
      drawRepeaterLayer(ctx, layer, tMs, rctx)
      break
    case 'captionSequence':
      drawCaptionSequenceLayer(ctx, layer, tMs, rctx)
      break
    case 'compositeMask':
      drawCompositeMaskLayer(ctx, layer, tMs, rctx)
      break
    case 'dataViz':
      drawDataVizLayer(ctx, layer, tMs, rctx)
      break
    case 'statBeat':
      drawStatBeatLayer(ctx, layer, tMs, rctx)
      break
    case 'trail':
      drawTrailLayer(ctx, layer, tMs, rctx)
      break
  }

  ctx.restore()
}
