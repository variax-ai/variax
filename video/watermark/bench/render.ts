/**
 * Render a VideoDocument to RGBA frames using the real renderer.
 *
 * Uses @napi-rs/canvas for a Canvas2D implementation under Node. Both that and
 * the renderer are devDependencies — the watermark package itself never depends
 * on the schema or the renderer.
 */

import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { createDocumentDrawer } from '@variax-ai/video-renderer'
import type { VideoDocument } from '@variax-ai/video-schema'
import type { Frame } from '../src/frame'

export interface RenderOptions {
  /** Frames per second to sample at. Defaults to the document's own rate. */
  fps?: number
}

export function renderFrames(
  doc: VideoDocument,
  options: RenderOptions = {},
): Frame[] {
  // Register whatever the host has, so text layers are not drawn blank.
  GlobalFonts.loadSystemFonts()

  const canvas = createCanvas(doc.width, doc.height)
  const ctx = canvas.getContext('2d')

  const draw = createDocumentDrawer(doc, {
    vars: {},
    images: {},
    createCanvas: ((w: number, h: number) =>
      createCanvas(w, h)) as never,
  })

  const fps = options.fps ?? doc.fps
  const count = Math.max(1, Math.round((doc.durationMs / 1000) * fps))
  const frames: Frame[] = []

  for (let i = 0; i < count; i++) {
    const tMs = (i / fps) * 1000
    ctx.clearRect(0, 0, doc.width, doc.height)
    draw(ctx as unknown as CanvasRenderingContext2D, tMs)

    const image = ctx.getImageData(0, 0, doc.width, doc.height)
    frames.push({
      width: doc.width,
      height: doc.height,
      data: new Uint8ClampedArray(image.data),
    })
  }

  return frames
}
