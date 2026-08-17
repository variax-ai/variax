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

export interface RendererOptions {
  vars: Record<string, string | number | boolean>
  images: Record<string, CanvasImageSource>
  components?: Record<string, ComponentDrawer>
  dataVizRenderers?: Record<string, DataVizDrawer>
}

export interface ResolveContext {
  vars: Record<string, string | number | boolean>
  tokens: Record<string, string>
}

export interface FontInfo {
  family: string
  weight: number
  size: number
}

export interface RenderContext {
  width: number
  height: number
  resolve: ResolveContext
  options: RendererOptions
  fonts: Record<string, { family: string; weight: number }>
  drawLayer: (ctx: CanvasRenderingContext2D, layer: Layer, tMs: number) => void
  persistedLayers: PersistedLayer[]
  sceneStartMs: number
}

export interface PersistedLayer {
  layer: Layer
  sceneEndMs: number
}

import type { Layer } from '@variax-ai/video-schema'
