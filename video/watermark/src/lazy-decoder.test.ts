/**
 * The decoder is the larger of the two models by some margin, and embedding
 * never runs it. These tests pin the laziness itself — that embedding never
 * reaches for the decoder, that extraction loads it exactly once however many
 * callers ask at once, and that a failed load stays retryable.
 *
 * Everything here runs against a fake runtime and a stubbed fetch: the point is
 * *which* bytes move and when, not what the real models compute.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFrame } from './frame'
import {
  DECODER_OUTPUT,
  ENCODER_OUTPUT,
  loadModels,
  type Runtime,
  type Session,
  type TensorLike,
} from './models'
import { PAYLOAD_BITS } from './datalayer'
import { Watermarker } from './watermarker'

const SIZE = 256

/** A runtime whose sessions echo plausibly-shaped outputs, counting the calls. */
function fakeRuntime(): Runtime & { created: Uint8Array[] } {
  const created: Uint8Array[] = []
  return {
    created,
    async createSession(model: Uint8Array): Promise<Session> {
      created.push(model)
      return {
        async run(
          feeds: Record<string, TensorLike>,
        ): Promise<Record<string, TensorLike>> {
          // The encoder is fed an image; the decoder is fed one too, but only
          // the encoder gets a second, much smaller bits tensor.
          const isEncoder = Object.keys(feeds).length > 1
          return isEncoder
            ? {
                [ENCODER_OUTPUT]: {
                  data: new Float32Array(3 * SIZE * SIZE),
                  dims: [1, 3, SIZE, SIZE],
                },
              }
            : {
                [DECODER_OUTPUT]: {
                  data: new Float32Array(PAYLOAD_BITS),
                  dims: [1, PAYLOAD_BITS],
                },
              }
        },
      }
    },
  }
}

/**
 * Stub `fetch` so model downloads are recorded rather than performed.
 *
 * `fail` names a file that should reject the first time it is asked for, which
 * is how the retry test simulates a flaky network.
 */
function stubFetch(failOnce?: string): { urls: string[] } {
  const urls: string[] = []
  let failed = false
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(String(url))
    if (failOnce && String(url).includes(failOnce) && !failed) {
      failed = true
      throw new Error('network went away')
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async arrayBuffer() {
        return new ArrayBuffer(8)
      },
    }
  })
  return { urls }
}

function decoderRequests(urls: string[]): string[] {
  return urls.filter((u) => u.includes('decoder_'))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lazy decoder loading', () => {
  it('never loads the decoder to embed', async () => {
    const runtime = fakeRuntime()
    const { urls } = stubFetch()

    const wm = new Watermarker(await loadModels({ runtime }))
    await wm.embedFrame(createFrame(SIZE, SIZE), { templateId: 1 })

    expect(runtime.created).toHaveLength(1)
    expect(decoderRequests(urls)).toEqual([])
  })

  it('loads the decoder once, on first extract', async () => {
    const runtime = fakeRuntime()
    const { urls } = stubFetch()

    const wm = new Watermarker(await loadModels({ runtime }))
    await wm.extract([createFrame(SIZE, SIZE)])
    await wm.extract([createFrame(SIZE, SIZE)])

    expect(decoderRequests(urls)).toHaveLength(1)
    expect(runtime.created).toHaveLength(2) // encoder up front, decoder once
  })

  it('shares one load between concurrent extracts', async () => {
    const runtime = fakeRuntime()
    const { urls } = stubFetch()

    const wm = new Watermarker(await loadModels({ runtime }))
    // Deliberately not awaited in between — both calls hit the unloaded
    // decoder before either finishes loading it.
    await Promise.all([
      wm.extract([createFrame(SIZE, SIZE)]),
      wm.extract([createFrame(SIZE, SIZE)]),
    ])

    expect(decoderRequests(urls)).toHaveLength(1)
    expect(runtime.created).toHaveLength(2)
  })

  it('fails every concurrent caller of one bad load, then retries clean', async () => {
    const runtime = fakeRuntime()
    const { urls } = stubFetch('decoder_')

    const wm = new Watermarker(await loadModels({ runtime }))
    // Both callers join the same in-flight attempt, so both must see the
    // failure — and clearing the memo for one must not strand the other.
    const results = await Promise.allSettled([
      wm.extract([createFrame(SIZE, SIZE)]),
      wm.extract([createFrame(SIZE, SIZE)]),
    ])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(decoderRequests(urls)).toHaveLength(1)

    // The shared failure must not have poisoned the memo for later callers.
    await expect(wm.extract([createFrame(SIZE, SIZE)])).resolves.toBeDefined()
    expect(decoderRequests(urls)).toHaveLength(2)
  })

  it('keeps caller-supplied decoder bytes across a retry', async () => {
    const runtime = fakeRuntime()
    const { urls } = stubFetch()
    // createSession fails once, so the retry re-uses the supplied bytes rather
    // than silently falling back to the network.
    let failed = false
    const original = runtime.createSession.bind(runtime)
    runtime.createSession = async (model: Uint8Array) => {
      if (!failed && model.length === 3) {
        failed = true
        throw new Error('session build failed')
      }
      return original(model)
    }

    const models = await loadModels({
      runtime,
      models: { encoder: new Uint8Array(2), decoder: new Uint8Array(3) },
    })
    await expect(models.decoder()).rejects.toThrow('session build failed')
    await expect(models.decoder()).resolves.toBeDefined()
    expect(decoderRequests(urls)).toEqual([])
  })

  it('retries after a failed decoder load', async () => {
    const runtime = fakeRuntime()
    const { urls } = stubFetch('decoder_')

    const wm = new Watermarker(await loadModels({ runtime }))
    await expect(wm.extract([createFrame(SIZE, SIZE)])).rejects.toThrow(
      'network went away',
    )

    // A rejection that had been memoised would make this fail forever.
    const result = await wm.extract([createFrame(SIZE, SIZE)])
    expect(result.framesUsed).toBe(1)
    expect(decoderRequests(urls)).toHaveLength(2)
  })
})
