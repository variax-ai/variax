import type { RenderContext } from './types'

export function createOffscreenCanvas(
  width: number,
  height: number,
  rctx: RenderContext,
): HTMLCanvasElement | OffscreenCanvas {
  if (rctx.options.createCanvas) {
    return rctx.options.createCanvas(width, height)
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}
