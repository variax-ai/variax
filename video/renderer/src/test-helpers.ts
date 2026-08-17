import type { RenderContext, RendererOptions } from './types'
import type { Layer } from '@variax-ai/video-schema'

type Call = { method: string; args: unknown[] }

export function createStubCtx(): CanvasRenderingContext2D & { calls: Call[] } {
  const calls: Call[] = []
  const gradientStub = { addColorStop: (...args: unknown[]) => { calls.push({ method: 'addColorStop', args }) } }

  const state = {
    globalAlpha: 1,
    fillStyle: '' as string | CanvasGradient,
    strokeStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
  }

  const handler: ProxyHandler<typeof state & { calls: Call[] }> = {
    get(_target, prop) {
      if (prop === 'calls') return calls
      if (prop in state) return state[prop as keyof typeof state]
      if (prop === 'measureText') return (_t: string) => ({ width: _t.length * 10 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...args: unknown[]) => {
          calls.push({ method: prop, args })
          return gradientStub
        }
      }
      if (typeof prop === 'string') {
        return (...args: unknown[]) => { calls.push({ method: prop, args }) }
      }
      return undefined
    },
    set(_target, prop, value) {
      if (prop in state) (state as Record<string, unknown>)[prop as string] = value
      calls.push({ method: `set:${String(prop)}`, args: [value] })
      return true
    },
  }

  return new Proxy({ calls } as any, handler)
}

export function createTestRctx(overrides?: Partial<RendererOptions> & { tokens?: Record<string, string>; fonts?: Record<string, { family: string; weight: number }> }): RenderContext {
  const options: RendererOptions = {
    vars: overrides?.vars ?? {},
    images: overrides?.images ?? {},
    components: overrides?.components,
    dataVizRenderers: overrides?.dataVizRenderers,
    createCanvas: overrides?.createCanvas,
  }
  const rctx: RenderContext = {
    width: 1920,
    height: 1080,
    resolve: {
      vars: options.vars,
      tokens: overrides?.tokens ?? {},
    },
    options,
    fonts: overrides?.fonts ?? {},
    drawLayer: (_ctx: CanvasRenderingContext2D, _layer: Layer, _tMs: number) => {},
    sceneStartMs: 0,
  }
  return rctx
}

export function getCalls(ctx: ReturnType<typeof createStubCtx>, method: string): Call[] {
  return ctx.calls.filter(c => c.method === method)
}
