/**
 * The page `npm run check:browser` serves.
 *
 * Deliberately goes through `createRuntime` rather than hand-wiring a session
 * wrapper, so this exercises the same adapter a real browser consumer uses.
 */

import * as ort from 'onnxruntime-web'
import { Watermarker, createRuntime, type Frame } from '../../src/index'

// Multithreaded WASM needs cross-origin isolation, which a plain static server
// does not provide. This is what a typical page gets.
ort.env.wasm.numThreads = 1
ort.env.wasm.wasmPaths = '/'

const out = document.getElementById('out') as HTMLPreElement
const log = (message: string) => {
  console.log(message)
  out.textContent += message + '\n'
}

/** A frame shaped like a Variax render: flat field, hard edges, blocky type. */
function makeFrame(width: number, height: number): Frame {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#6c4df6'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 5; i++) ctx.fillRect(80, 120 + i * 70, 300 + i * 40, 40)
  ctx.fillStyle = '#f6c44d'
  ctx.fillRect(width - 300, height - 300, 220, 220)

  return ctx.getImageData(0, 0, width, height)
}

async function main(): Promise<void> {
  const payload = { contentId: 987654321n }
  try {
    log('loading the encoder through createRuntime(onnxruntime-web)...')
    const started = performance.now()
    const wm = await Watermarker.create({
      modelsUrl: '/models/',
      runtime: createRuntime(ort as never, { executionProviders: ['wasm'] }),
    })
    log(`encoder loaded in ${Math.round(performance.now() - started)}ms`)

    const frame = makeFrame(1280, 720)

    const embedStart = performance.now()
    const marked = await wm.embedFrame(frame, payload)
    log(`single frame embedded in ${Math.round(performance.now() - embedStart)}ms`)

    // The decoder loads on first extraction. Time that separately: folding a
    // 47.4MB fetch into the figure below is what the README's per-frame extract
    // row is read from, and it would be off by orders of magnitude.
    const decoderStart = performance.now()
    await wm.extract([marked])
    log(`decoder loaded in ${Math.round(performance.now() - decoderStart)}ms`)

    const extractStart = performance.now()
    const result = await wm.extract([marked])
    log(`extracted in ${Math.round(performance.now() - extractStart)}ms`)
    log(`payload: contentId ${result.payload?.contentId}`)

    // A sequence is what watermarking a video actually costs: sharedResidual
    // runs the encoder once per shot, so the rest is plain arithmetic.
    const sequence = Array.from({ length: 12 }, () => makeFrame(1280, 720))
    const seqStart = performance.now()
    let count = 0
    for await (const _ of wm.embedFrames(sequence, payload)) count += 1
    const seqMs = performance.now() - seqStart
    log(`sequence: ${count} frames in ${Math.round(seqMs)}ms (${(seqMs / count).toFixed(1)}ms/frame)`)

    const ok = result.valid && result.payload?.contentId === payload.contentId

    log(ok ? 'RESULT: PASS' : 'RESULT: FAIL')
    document.title = ok ? 'PASS' : 'FAIL'
  } catch (error) {
    log('ERROR: ' + (error instanceof Error ? error.stack : String(error)))
    document.title = 'FAIL'
  }
}

void main()
