/**
 * `inPlace` hands the caller's own frame back, marked, instead of a copy — so
 * what needs pinning is which object comes out and whether the input survived.
 *
 * Runs against a fake runtime: the residual the real encoder would produce is
 * beside the point here, only whether the bytes that changed were the caller's.
 * The frames are deliberately not flat, because a fake encoder returning zeros
 * yields a residual of `-cover`, and mean removal flattens that to nothing on a
 * uniform frame — the test would then pass without marking anything.
 */

import { describe, expect, it } from 'vitest'
import { createFrame, type Frame } from './frame'
import {
  ENCODER_OUTPUT,
  loadModels,
  type Runtime,
  type Session,
  type TensorLike,
} from './models'
import { Watermarker } from './watermarker'

const SIZE = 256
const PAYLOAD = { contentId: 42 }

/** A runtime whose encoder returns a plausibly-shaped tensor and nothing more. */
function fakeRuntime(): Runtime {
  return {
    async createSession(): Promise<Session> {
      return {
        async run(): Promise<Record<string, TensorLike>> {
          return {
            [ENCODER_OUTPUT]: {
              data: new Float32Array(3 * SIZE * SIZE),
              dims: [1, 3, SIZE, SIZE],
            },
          }
        },
      }
    },
  }
}

async function watermarker(): Promise<Watermarker> {
  // Supplying the bytes keeps `loadModels` off the network entirely.
  return new Watermarker(
    await loadModels({
      runtime: fakeRuntime(),
      models: { encoder: new Uint8Array(), decoder: new Uint8Array() },
    }),
  )
}

/** A frame with structure in it, so a residual has something to survive. */
function texturedFrame(width = 64, height = 64): Frame {
  const frame = createFrame(width, height)
  for (let i = 0; i < width * height; i++) {
    const p = i * 4
    frame.data[p] = (i * 7) % 256
    frame.data[p + 1] = (i * 13) % 256
    frame.data[p + 2] = (i * 29) % 256
    frame.data[p + 3] = 255
  }
  return frame
}

describe('embedFrame', () => {
  it('returns a new frame and leaves the original alone by default', async () => {
    const wm = await watermarker()
    const frame = texturedFrame()
    const before = new Uint8ClampedArray(frame.data)

    const marked = await wm.embedFrame(frame, PAYLOAD)

    expect(marked).not.toBe(frame)
    expect(Array.from(frame.data)).toEqual(Array.from(before))
    expect(Array.from(marked.data)).not.toEqual(Array.from(before))
  })

  it('marks the caller’s own frame when inPlace is set', async () => {
    const wm = await watermarker()
    const frame = texturedFrame()
    const buffer = frame.data
    const before = new Uint8ClampedArray(frame.data)

    const marked = await wm.embedFrame(frame, PAYLOAD, { inPlace: true })

    expect(marked).toBe(frame)
    // The same buffer, not a replacement assigned onto the same object.
    expect(marked.data).toBe(buffer)
    expect(Array.from(frame.data)).not.toEqual(Array.from(before))
  })

  it('marks identically either way', async () => {
    const wm = await watermarker()
    const copied = await wm.embedFrame(texturedFrame(), PAYLOAD)
    const inPlace = await wm.embedFrame(texturedFrame(), PAYLOAD, { inPlace: true })

    expect(Array.from(inPlace.data)).toEqual(Array.from(copied.data))
  })
})

describe('embedFrames', () => {
  it('leaves the inputs alone by default', async () => {
    const wm = await watermarker()
    const frames = [texturedFrame(), texturedFrame()]
    const before = frames.map((f) => new Uint8ClampedArray(f.data))

    const marked: Frame[] = []
    for await (const frame of wm.embedFrames(frames, PAYLOAD)) marked.push(frame)

    expect(marked).toHaveLength(2)
    frames.forEach((frame, i) => {
      expect(marked[i]).not.toBe(frame)
      expect(Array.from(frame.data)).toEqual(Array.from(before[i]))
    })
  })

  it('yields the frames it was given when inPlace is set', async () => {
    const wm = await watermarker()
    const frames = [texturedFrame(), texturedFrame()]
    const before = new Uint8ClampedArray(frames[0].data)

    const marked: Frame[] = []
    for await (const frame of wm.embedFrames(frames, PAYLOAD, { inPlace: true })) {
      marked.push(frame)
    }

    expect(marked[0]).toBe(frames[0])
    expect(marked[1]).toBe(frames[1])
    expect(Array.from(frames[0].data)).not.toEqual(Array.from(before))
  })
})
