import type { VideoDocument } from '@variax-ai/video-schema'
import type { FrameDrawer, RenderContext, RendererOptions } from './types'
import { drawFrame } from './scene'
import { drawLayer as drawLayerImpl } from './layers/index'
import { buildFontRegistry } from './fonts'
import { resolveDocumentDefs } from './defs'
import { indexLayersById } from './layer-index'
import type { Layer } from '@variax-ai/video-schema'

export type {
  FrameDrawer,
  RendererOptions,
  RendererConstraints,
  ComponentDrawer,
  ComponentProps,
  DataVizDrawer,
} from './types'

export type { VideoDocument } from '@variax-ai/video-schema'

export { requiredFonts } from './fonts'
export type { RequiredFont } from './fonts'

export { resolveDocumentDefs, CyclicDefError } from './defs'

export function createDocumentDrawer(
  source: VideoDocument,
  options: RendererOptions,
): FrameDrawer {
  // Once, here, rather than per frame: every reference to a def then points at
  // one value, so layers sharing an expression share its evaluation too.
  const doc = resolveDocumentDefs(source)

  // The renderer does not load faces: this only records what a text layer that
  // names an asset should be drawn with. Hosts preload the families themselves,
  // from `requiredFonts(doc)`.
  const fonts = buildFontRegistry(doc)

  const rctx: RenderContext = {
    width: doc.width,
    height: doc.height,
    resolve: {
      vars: options.vars,
      tokens: doc.tokens ?? {},
    },
    options,
    fonts,
    layersById: indexLayersById(doc),
    drawLayer: (ctx: CanvasRenderingContext2D, layer: Layer, tMs: number) => {
      drawLayerImpl(ctx, layer, tMs, rctx)
    },
    sceneStartMs: 0,
  }

  return (ctx: CanvasRenderingContext2D, tMs: number) => {
    drawFrame(ctx, tMs, doc, rctx)
  }
}
