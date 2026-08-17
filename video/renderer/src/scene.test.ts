import { describe, it, expect } from 'vitest'
import { drawFrame } from './scene'
import { createStubCtx, createTestRctx, getCalls } from './test-helpers'
import type { VideoDocument } from '@variax-ai/video-schema'

function makeDoc(scenes: VideoDocument['scenes']): VideoDocument {
  return { version: 1, width: 1920, height: 1080, fps: 30, durationMs: 10000, scenes } as VideoDocument
}

describe('drawFrame', () => {
  it('does nothing when no scene matches the time', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx()
    const doc = makeDoc([{ id: 's1', startMs: 1000, endMs: 2000, layers: [] }])
    drawFrame(ctx, 500, doc, rctx)
    expect(ctx.calls).toHaveLength(0)
  })

  it('finds the active scene by time', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx()
    const doc = makeDoc([
      { id: 's1', startMs: 0, endMs: 1000, background: '#ff0000', layers: [] },
      { id: 's2', startMs: 1000, endMs: 2000, background: '#00ff00', layers: [] },
    ])

    drawFrame(ctx, 500, doc, rctx)
    expect(ctx.calls.some(c => c.method === 'set:fillStyle' && c.args[0] === '#ff0000')).toBe(true)

    ctx.calls.length = 0
    drawFrame(ctx, 1500, doc, rctx)
    expect(ctx.calls.some(c => c.method === 'set:fillStyle' && c.args[0] === '#00ff00')).toBe(true)
  })

  it('falls back to last scene when past all scene ends', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx()
    const doc = makeDoc([
      { id: 's1', startMs: 0, endMs: 1000, background: '#aaaaaa', layers: [] },
    ])
    drawFrame(ctx, 5000, doc, rctx)
    expect(ctx.calls.some(c => c.method === 'set:fillStyle' && c.args[0] === '#aaaaaa')).toBe(true)
  })

  it('sets sceneStartMs on the render context', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx()
    const doc = makeDoc([
      { id: 's1', startMs: 500, endMs: 2000, layers: [] },
    ])
    drawFrame(ctx, 1000, doc, rctx)
    expect(rctx.sceneStartMs).toBe(500)
  })

  it('draws layers in the active scene', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx()
    const doc = makeDoc([{
      id: 's1', startMs: 0, endMs: 5000,
      layers: [
        { type: 'shape', shape: 'rect', size: [100, 100], position: [0, 0], fill: '#ff0000' },
        { type: 'shape', shape: 'ellipse', size: [50, 50], position: [0, 0], fill: '#00ff00' },
      ],
    }])

    drawFrame(ctx, 1000, doc, rctx)
    expect(getCalls(ctx, 'rect')).toHaveLength(1)
    expect(getCalls(ctx, 'ellipse')).toHaveLength(1)
  })

  it('draws persisted layers from earlier scenes', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx()
    const doc = makeDoc([
      {
        id: 's1', startMs: 0, endMs: 1000,
        layers: [
          { type: 'shape', shape: 'rect', size: [10, 10], position: [0, 0], fill: '#fff', persist: true },
        ],
      },
      {
        id: 's2', startMs: 1000, endMs: 2000,
        layers: [
          { type: 'shape', shape: 'ellipse', size: [10, 10], position: [0, 0], fill: '#000' },
        ],
      },
    ])
    drawFrame(ctx, 1500, doc, rctx)
    expect(getCalls(ctx, 'rect')).toHaveLength(1)
    expect(getCalls(ctx, 'ellipse')).toHaveLength(1)
  })

  it('sets correct sceneStartMs for persisted layers', () => {
    const ctx = createStubCtx()
    const rctx = createTestRctx()
    const doc = makeDoc([
      {
        id: 's1', startMs: 100, endMs: 500,
        layers: [{ type: 'shape', shape: 'rect', size: [10, 10], position: [0, 0], fill: '#fff', persist: true }],
      },
      {
        id: 's2', startMs: 500, endMs: 1000,
        layers: [{ type: 'shape', shape: 'rect', size: [10, 10], position: [0, 0], fill: '#000' }],
      },
    ])
    drawFrame(ctx, 700, doc, rctx)
    expect(rctx.sceneStartMs).toBe(500)
  })
})
