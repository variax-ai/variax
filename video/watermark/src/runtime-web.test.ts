/**
 * Exercises the browser runtime adapter against `onnxruntime-web`.
 *
 * Every other test in this package runs the models through `onnxruntime-node`,
 * so `createRuntime` — the wrapper the browser path depends on — was never once
 * run against the package it exists to support. The two ort builds have
 * compatible APIs today, which is precisely why a divergence would go unnoticed
 * until someone loaded the page.
 *
 * onnxruntime-web runs under Node on its WASM backend, so this needs no browser
 * and no headless driver. What it cannot cover is the browser *environment*
 * itself — `npm run check:browser` does that, and needs a human to look at it.
 */

import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import * as ortWeb from 'onnxruntime-web'

import { Watermarker } from './watermarker'
import {
  DECODER_INPUT,
  DECODER_OUTPUT,
  ENCODER_BITS_INPUT,
  ENCODER_IMAGE_INPUT,
  ENCODER_OUTPUT,
  createRuntime,
  loadModelBytes,
} from './models'
import { createFrame, type Frame } from './frame'

const ENABLED = process.env.VARIAX_WATERMARK_E2E === '1'
const CACHE_DIR =
  process.env.VARIAX_WATERMARK_MODELS ??
  fileURLToPath(new URL('../node_modules/.cache/variax-watermark', import.meta.url))

function testFrame(width = 640, height = 360): Frame {
  const frame = createFrame(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4
      // Flat brand field with a hard-edged block, as motion graphics look.
      const inBlock = x > width * 0.6 && y > height * 0.5
      frame.data[p] = inBlock ? 246 : 108
      frame.data[p + 1] = inBlock ? 196 : 77
      frame.data[p + 2] = inBlock ? 77 : 246
      frame.data[p + 3] = 255
    }
  }
  return frame
}

describe.skipIf(!ENABLED)('onnxruntime-web runtime', () => {
  const payload = { contentId: 55544433n }
  let wm: Watermarker

  beforeAll(async () => {
    // Threads need cross-origin isolation in a browser, and this is the
    // configuration a page will realistically use.
    ortWeb.env.wasm.numThreads = 1

    wm = await Watermarker.create({
      cacheDir: CACHE_DIR,
      runtime: createRuntime(ortWeb as never, { executionProviders: ['wasm'] }),
    })
  }, 600_000)

  it('round-trips a payload through the web build', async () => {
    const marked = await wm.embedFrame(testFrame(), payload)
    const result = await wm.extract([marked])

    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(payload)
  }, 600_000)

  it('agrees with the graph input and output names we hard-code', async () => {
    // If a future model export renames these, the failure is otherwise a
    // confusing "produced no output" at runtime.
    const [encoder, decoder] = await Promise.all([
      loadModelBytes('encoder_Q.onnx', { cacheDir: CACHE_DIR }),
      loadModelBytes('decoder_Q.onnx', { cacheDir: CACHE_DIR }),
    ])

    const encoderSession = await ortWeb.InferenceSession.create(encoder, {
      executionProviders: ['wasm'],
    })
    const decoderSession = await ortWeb.InferenceSession.create(decoder, {
      executionProviders: ['wasm'],
    })

    expect(encoderSession.inputNames).toEqual(
      expect.arrayContaining([ENCODER_IMAGE_INPUT, ENCODER_BITS_INPUT]),
    )
    expect(encoderSession.outputNames).toContain(ENCODER_OUTPUT)
    expect(decoderSession.inputNames).toContain(DECODER_INPUT)
    expect(decoderSession.outputNames).toContain(DECODER_OUTPUT)
  }, 600_000)
})
