import type { VideoDocument } from '@variax-ai/video-schema'
import type { FrameDrawer, RenderContext, RendererOptions } from './types'
import { drawFrame } from './scene'
import { drawLayer as drawLayerImpl } from './layers/index'
import { buildFamilyStack } from './text'
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

export function createDocumentDrawer(
  doc: VideoDocument,
  options: RendererOptions,
): FrameDrawer {
  const fonts: RenderContext['fonts'] = {}
  if (doc.assets) {
    for (const [id, asset] of Object.entries(doc.assets)) {
      if (asset.type === 'font') {
        // The stack is fixed for the document's lifetime, so it is built here
        // rather than rebuilt on every text draw of every frame.
        fonts[id] = {
          family: asset.family,
          weight: asset.weight ?? 400,
          stack: buildFamilyStack(asset.family, asset.fallback),
        }
      }
    }
  }

  const rctx: RenderContext = {
    width: doc.width,
    height: doc.height,
    resolve: {
      vars: options.vars,
      tokens: doc.tokens ?? {},
    },
    options,
    fonts,
    drawLayer: (ctx: CanvasRenderingContext2D, layer: Layer, tMs: number) => {
      drawLayerImpl(ctx, layer, tMs, rctx)
    },
    sceneStartMs: 0,
  }

  return (ctx: CanvasRenderingContext2D, tMs: number) => {
    drawFrame(ctx, tMs, doc, rctx)
  }
}
