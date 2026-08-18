import { describe, it, expect, vi } from 'vitest'
import { extractDocument } from './pipeline'
import type { FrameSource, InferFn, VideoMetadata } from './types'
import type { VideoDocument } from '@variax-ai/video-schema'

function makeFrameSource(meta?: Partial<VideoMetadata>): FrameSource {
  return {
    metadata: vi.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      durationMs: 10000,
      fps: 30,
      ...meta,
    }),
    sample: vi.fn().mockResolvedValue([
      { data: new Uint8Array([1, 2, 3]), timeMs: 500 },
    ]),
    dispose: vi.fn(),
  }
}

function makeDoc(overrides?: Partial<VideoDocument>): VideoDocument {
  return {
    version: 1,
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 10000,
    scenes: [{ id: 'scene-0', startMs: 0, endMs: 10000, layers: [] }],
    ...overrides,
  } as VideoDocument
}

describe('extractDocument', () => {
  it('returns a validated VideoDocument', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockResolvedValue(makeDoc())

    const result = await extractDocument({ source, infer })

    expect(result.version).toBe(1)
    expect(result.width).toBe(1920)
    expect(result.scenes).toHaveLength(1)
  })

  it('passes frames and prompt to infer', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockResolvedValue(makeDoc())

    await extractDocument({ source, infer })

    expect(infer).toHaveBeenCalledOnce()
    const request = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(request.frames).toHaveLength(1)
    expect(request.prompt).toContain('1920x1080')
    expect(request.width).toBe(1920)
    expect(request.height).toBe(1080)
    expect(request.durationMs).toBe(10000)
    expect(request.fps).toBe(30)
  })

  it('uses overridden width/height', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockResolvedValue(
      makeDoc({ width: 800, height: 600 }),
    )

    await extractDocument({ source, infer, width: 800, height: 600 })

    const request = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(request.width).toBe(800)
    expect(request.height).toBe(600)
    expect(request.prompt).toContain('800x600')
  })

  it('uses overridden fps', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockResolvedValue(makeDoc({ fps: 60 }))

    await extractDocument({ source, infer, fps: 60 })

    const request = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(request.fps).toBe(60)
  })

  it('calls dispose on source after extraction', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockResolvedValue(makeDoc())

    await extractDocument({ source, infer })

    expect(source.dispose).toHaveBeenCalledOnce()
  })

  it('calls dispose even when infer throws', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockRejectedValue(new Error('fail'))

    await expect(extractDocument({ source, infer })).rejects.toThrow('fail')
    expect(source.dispose).toHaveBeenCalledOnce()
  })

  it('limits sample count to MAX_SAMPLES', async () => {
    const source = makeFrameSource({ durationMs: 60000 })
    const infer: InferFn = vi.fn().mockResolvedValue(
      makeDoc({ durationMs: 60000 }),
    )

    await extractDocument({ source, infer })

    const sampleCall = (source.sample as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(sampleCall.length).toBeLessThanOrEqual(20)
  })

  it('respects custom sampleCount', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockResolvedValue(makeDoc())

    await extractDocument({ source, infer, sampleCount: 5 })

    const sampleCall = (source.sample as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(sampleCall).toHaveLength(5)
  })

  it('rejects invalid source', async () => {
    const infer: InferFn = vi.fn()

    await expect(
      extractDocument({ source: 'bad' as never, infer }),
    ).rejects.toThrow('source must be')
  })

  it('validates infer output', async () => {
    const source = makeFrameSource()
    const infer: InferFn = vi.fn().mockResolvedValue({
      version: 1,
      width: 1920,
      height: 1080,
      fps: 30,
      durationMs: 10000,
      scenes: [{
        id: 's', startMs: 0, endMs: 10000,
        layers: [
          { type: 'shape', shape: 'rect' },
          { type: 'bogus' },
        ],
      }],
    })

    const result = await extractDocument({ source, infer })
    expect(result.scenes[0].layers).toHaveLength(1)
  })
})
