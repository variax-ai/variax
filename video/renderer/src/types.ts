import type { Layer } from '@variax-ai/video-schema'

export type FrameDrawer = (ctx: CanvasRenderingContext2D, tMs: number) => void

export interface ComponentProps {
  params?: Record<string, unknown>
  color?: string
  size?: number
  position?: [number, number]
}

export type ComponentDrawer = (
  ctx: CanvasRenderingContext2D,
  tMs: number,
  props: ComponentProps,
) => void

export type DataVizDrawer = (
  ctx: CanvasRenderingContext2D,
  tMs: number,
  data: Record<string, unknown>,
  area: { top?: number; bottom?: number; left?: number; right?: number },
  style: Record<string, unknown>,
  animation: Record<string, unknown>,
) => void

/**
 * Host-supplied floors on how sharply an image may ever be rendered. There is
 * deliberately no document-side counterpart: a document must not be able to opt
 * out, so these clamp rather than warn, and setting `minDownscaleBlurPx` forces
 * every image draw through the downscale-blur path even when the document
 * declares no blur at all.
 */
export interface RendererConstraints {
  minDownscaleBlurPx?: number
  minDownscaleShrink?: number
}

export interface RendererOptions {
  vars: Record<string, string | number | boolean>
  images: Record<string, CanvasImageSource>
  components?: Record<string, ComponentDrawer>
  dataVizRenderers?: Record<string, DataVizDrawer>
  createCanvas?: (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas
  constraints?: RendererConstraints
}

export interface ResolveContext {
  vars: Record<string, string | number | boolean>
  tokens: Record<string, string>
}

export interface RenderContext {
  width: number
  height: number
  resolve: ResolveContext
  options: RendererOptions
  fonts: Record<string, { family: string; weight: number; fallback?: string[] }>
  drawLayer: (ctx: CanvasRenderingContext2D, layer: Layer, tMs: number) => void
  sceneStartMs: number
}

export interface PersistedLayer {
  layer: Layer
  sceneEndMs: number
  sceneStartMs: number
}
