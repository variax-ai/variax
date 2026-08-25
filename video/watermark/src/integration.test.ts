/**
 * End-to-end tests against the real TrustMark models.
 *
 * These download ~64MB of ONNX on first run and cache it under
 * `node_modules/.cache`, so they are skipped unless `VARIAX_WATERMARK_E2E=1`.
 * Everything else in the suite runs offline in milliseconds; this is the one
 * that proves the pixel pipeline actually works.
 *
 * The test images are deliberately motion-graphics shaped — flat fields, hard
 * edges, blocky type — rather than photographs. That is the content Variax
 * renders and the content this style of watermark finds hardest, so a
 * photograph passing here would prove very little.
 */

import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Watermarker } from './watermarker'
import { createFrame, type Frame } from './frame'
import { frameToPlanar } from './pixels'
import { resizePlanar } from './resize'

const ENABLED = process.env.VARIAX_WATERMARK_E2E === '1'
const CACHE_DIR =
  process.env.VARIAX_WATERMARK_MODELS ??
  fileURLToPath(new URL('../node_modules/.cache/variax-watermark', import.meta.url))

function fill(
  frame: Frame,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgb: [number, number, number],
): void {
  for (let y = y0; y < Math.min(y0 + h, frame.height); y++) {
    for (let x = x0; x < Math.min(x0 + w, frame.width); x++) {
      const p = (y * frame.width + x) * 4
      frame.data[p] = rgb[0]
      frame.data[p + 1] = rgb[1]
      frame.data[p + 2] = rgb[2]
      frame.data[p + 3] = 255
    }
  }
}

/** A frame in the shape of a Variax render: flat brand field, shapes, type. */
function motionGraphicsFrame(width = 1920, height = 1080, phase = 0): Frame {
  const frame = createFrame(width, height)
  fill(frame, 0, 0, width, height, [108, 77, 246]) // brand purple, perfectly flat

  fill(frame, 160, 220, 900, 12, [255, 255, 255])
  // Blocky "text" lines.
  for (let i = 0; i < 5; i++) {
    const w = 420 + ((i * 137 + phase * 31) % 380)
    fill(frame, 160, 300 + i * 90, w, 54, [255, 255, 255])
  }
  fill(frame, 1200, 300 + phase * 4, 520, 520, [246, 196, 77])
  fill(frame, 160, 820, 300, 90, [20, 20, 30])
  return frame
}

/** Peak signal-to-noise ratio in dB; higher means less visible damage. */
function psnr(a: Frame, b: Frame): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < a.data.length; i++) {
    if (i % 4 === 3) continue // skip alpha
    const d = a.data[i] - b.data[i]
    sum += d * d
    count += 1
  }
  const mse = sum / count
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse)
}

/** Rescale a frame, standing in for what a platform transcode does. */
function rescale(frame: Frame, width: number, height: number): Frame {
  const planar = resizePlanar(frameToPlanar(frame), width, height)
  const out = createFrame(width, height)
  const plane = width * height
  for (let i = 0; i < plane; i++) {
    out.data[i * 4] = planar.data[i]
    out.data[i * 4 + 1] = planar.data[plane + i]
    out.data[i * 4 + 2] = planar.data[2 * plane + i]
    out.data[i * 4 + 3] = 255
  }
  return out
}

describe.skipIf(!ENABLED)('end to end against the real models', () => {
  let wm: Watermarker
  const payload = { contentId: 123456789n }

  beforeAll(async () => {
    wm = await Watermarker.create({ cacheDir: CACHE_DIR })
    // `create` now fetches only the encoder, so the decoder's download would
    // otherwise land inside whichever test extracts first and be billed against
    // that test's much smaller budget. Warm it here, where the generous timeout
    // for a cold cache already lives, and the per-test timings stay meaningful.
    await wm.extract([motionGraphicsFrame()])
  }, 600_000)

  it('recovers the payload from a watermarked frame', async () => {
    const original = motionGraphicsFrame()
    const marked = await wm.embedFrame(original, payload)
    const result = await wm.extract([marked])

    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(payload)
  }, 120_000)

  it('does not find a watermark that was never embedded', async () => {
    const result = await wm.extract([motionGraphicsFrame()])
    expect(result.payload).not.toEqual(payload)
  }, 120_000)

  it('stays visually close to the original', async () => {
    const original = motionGraphicsFrame()
    const marked = await wm.embedFrame(original, payload)

    // Below ~35dB the residual starts being visible on flat colour.
    expect(psnr(original, marked)).toBeGreaterThan(35)
  }, 120_000)

  it('survives a downscale to 720p', async () => {
    const marked = await wm.embedFrame(motionGraphicsFrame(), payload)
    const result = await wm.extract([rescale(marked, 1280, 720)])

    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(payload)
  }, 120_000)

  it('aggregates across frames of a shot', async () => {
    const frames = [0, 1, 2, 3].map((phase) =>
      motionGraphicsFrame(1920, 1080, phase),
    )
    const marked: Frame[] = []
    for await (const frame of wm.embedFrames(frames, payload)) marked.push(frame)

    expect(marked).toHaveLength(4)
    const result = await wm.extract(marked)

    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(payload)
    expect(result.framesUsed).toBe(4)
  }, 300_000)

  it('round-trips a portrait frame', async () => {
    const marked = await wm.embedFrame(motionGraphicsFrame(1080, 1920), payload)
    const result = await wm.extract([marked])

    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(payload)
  }, 120_000)
})
