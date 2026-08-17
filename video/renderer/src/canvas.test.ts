import { describe, it, expect } from 'vitest'
import { createOffscreenCanvas } from './canvas'
import { createTestRctx } from './test-helpers'

describe('createOffscreenCanvas', () => {
  it('uses createCanvas option when provided', () => {
    const stub = { width: 0, height: 0 } as unknown as HTMLCanvasElement
    const rctx = createTestRctx({
      createCanvas: (w, h) => {
        stub.width = w
        stub.height = h
        return stub
      },
    })
    const result = createOffscreenCanvas(200, 100, rctx)
    expect(result).toBe(stub)
    expect(stub.width).toBe(200)
    expect(stub.height).toBe(100)
  })

  it('falls back to document.createElement in jsdom', () => {
    const rctx = createTestRctx()
    const canvas = createOffscreenCanvas(320, 240, rctx)
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(240)
  })
})
