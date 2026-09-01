/**
 * Robustness harness — the number that decides whether this approach works.
 *
 * Renders a real Variax document, watermarks it, pushes the result through the
 * transforms a video actually meets between export and playback, and reports
 * how much of the mark survives each one.
 *
 * Two figures per condition:
 *  - **bit accuracy**: fraction of the 100 raw watermark bits recovered before
 *    error correction. This degrades smoothly and shows how much margin is
 *    left, which pass/fail alone hides.
 *  - **recovered**: whether error correction actually returned the payload.
 *    This is the one that matters in production.
 *
 * Run with:  npm run bench -w @variax-ai/video-watermark
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Watermarker } from '../src/watermarker'
import { DataLayer, PAYLOAD_BITS } from '../src/datalayer'
import { packPayload, unpackPayload } from '../src/payload'
import type { Payload } from '../src/payload'
import { probe, readFrames, writeFrames } from '../src/node/ffmpeg'
import { benchDocument } from './document'
import { renderFrames } from './render'
import { CACHE_DIR, accuracy, ffmpeg, psnr } from './harness'

const PAYLOAD: Payload = { contentId: 20260822001337n }

interface Condition {
  name: string
  description: string
  /** ffmpeg arguments applied between input and output. */
  args: string[]
  /** Run the transform twice, as an upload followed by a platform transcode. */
  twice?: boolean
}

const CONDITIONS: Condition[] = [
  {
    name: 'crf18',
    description: 'H.264 CRF 18, native resolution (our own export)',
    args: ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p'],
  },
  {
    name: 'crf23',
    description: 'H.264 CRF 23, native resolution',
    args: ['-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p'],
  },
  {
    name: 'crf28',
    description: 'H.264 CRF 28, native resolution (aggressive)',
    args: ['-c:v', 'libx264', '-crf', '28', '-pix_fmt', 'yuv420p'],
  },
  {
    name: 'scale720',
    description: '1080p downscaled to 720p',
    args: ['-vf', 'scale=1280:720', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p'],
  },
  {
    name: 'scale640',
    description: '1080p downscaled to 640px wide',
    args: ['-vf', 'scale=640:360', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p'],
  },
  {
    name: 'crop10',
    description: '10% centre crop',
    args: [
      '-vf', 'crop=iw*0.9:ih*0.9', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
    ],
  },
  {
    name: 'double',
    description: 'Re-encoded twice (upload, then platform transcode)',
    args: ['-vf', 'scale=1280:720', '-c:v', 'libx264', '-crf', '26', '-pix_fmt', 'yuv420p'],
    twice: true,
  },
]

/** Aggregate decoder logits across sampled frames and threshold once. */
async function rawBits(
  wm: Watermarker,
  file: string,
  frames: number,
): Promise<{ bits: Uint8Array; used: number }> {
  const info = await probe(file)
  const seconds = info.durationMs / 1000
  const rate = seconds > 0 ? Math.min(info.fps || 30, frames / seconds) : 0

  const totals = new Float32Array(PAYLOAD_BITS)
  let used = 0

  for await (const frame of readFrames(file, info, {
    filter: rate > 0 ? `fps=${rate.toFixed(6)}` : undefined,
    limit: frames,
  })) {
    const logits = await wm.decodeFrame(frame)
    for (let i = 0; i < PAYLOAD_BITS; i++) totals[i] += logits[i]
    used += 1
  }

  const bits = new Uint8Array(PAYLOAD_BITS)
  for (let i = 0; i < PAYLOAD_BITS; i++) bits[i] = totals[i] >= 0 ? 1 : 0
  return { bits, used }
}

function samePayload(a: Payload, b: Payload): boolean {
  return a.contentId === b.contentId
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'variax-wm-'))
  const started = Date.now()

  try {
    console.log('Loading models...')
    const wm = await Watermarker.create({ cacheDir: CACHE_DIR })

    const doc = benchDocument()
    console.log(`Rendering ${doc.width}x${doc.height} document...`)
    const frames = renderFrames(doc, { fps: 15 })
    console.log(`  ${frames.length} frames`)

    // Ground truth: the exact 100 bits that were embedded.
    const expected = new DataLayer().encode(packPayload(PAYLOAD, 'BCH_5'), 'BCH_5')

    console.log('Embedding...')
    const embedStart = Date.now()
    const marked: typeof frames = []
    for await (const frame of wm.embedFrames(frames, PAYLOAD)) marked.push(frame)
    const embedMs = Date.now() - embedStart
    console.log(
      `  ${embedMs}ms for ${frames.length} frames (${(embedMs / frames.length).toFixed(1)}ms/frame)`,
    )

    const quality =
      frames.reduce((total, frame, i) => total + psnr(frame.data, marked[i].data), 0) /
      frames.length
    console.log(`  mean PSNR ${quality.toFixed(2)} dB`)

    const info = {
      width: doc.width,
      height: doc.height,
      fps: 15,
      durationMs: doc.durationMs,
      hasAudio: false,
    }
    // Near-lossless master, so every condition below measures its own damage
    // rather than damage inherited from this step.
    const master = join(dir, 'master.mp4')
    await writeFrames(
      master,
      (async function* () {
        yield* marked
      })(),
      info,
      { crf: 14 },
    )

    console.log('\nCondition                                          bits   recovered')
    console.log('-'.repeat(72))

    const results: { name: string; accuracy: number; recovered: boolean }[] = []

    for (const condition of CONDITIONS) {
      let current = master
      const passes = condition.twice ? 2 : 1
      for (let pass = 0; pass < passes; pass++) {
        const next = join(dir, `${condition.name}-${pass}.mp4`)
        await ffmpeg(['-i', current, ...condition.args, next])
        current = next
      }

      const { bits } = await rawBits(wm, current, 16)
      const acc = accuracy(bits, expected)
      const decoded = new DataLayer().decode(bits)
      // Compare the payload rather than a hard-coded bit range: the fallback
      // decoder may land on a different schema, whose data bits are a
      // different width.
      const recovered =
        decoded.valid &&
        samePayload(unpackPayload(decoded.data, decoded.schema), PAYLOAD)

      results.push({ name: condition.name, accuracy: acc, recovered })
      console.log(
        `${condition.description.padEnd(50)} ${(acc * 100).toFixed(1).padStart(5)}%   ${
          recovered ? 'yes' : 'NO'
        }`,
      )
    }

    // Negative control. Without this the table above is unfalsifiable: a
    // decoder that hallucinated the expected bits, or a harness that read the
    // wrong file, would report a clean sweep just the same. Unwatermarked
    // footage must land near chance.
    const controlSource = join(dir, 'control-source.mp4')
    await writeFrames(
      controlSource,
      (async function* () {
        yield* frames
      })(),
      info,
      { crf: 14 },
    )
    const control = join(dir, 'control.mp4')
    await ffmpeg([
      '-i', controlSource,
      '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
      control,
    ])

    const { bits: controlBits } = await rawBits(wm, control, 16)
    const controlAccuracy = accuracy(controlBits, expected)
    const controlDecoded = new DataLayer().decode(controlBits)
    console.log(
      `${'CONTROL: no watermark embedded'.padEnd(50)} ${(controlAccuracy * 100)
        .toFixed(1)
        .padStart(5)}%   ${controlDecoded.valid ? 'FALSE POSITIVE' : 'no (correct)'}`,
    )

    console.log('-'.repeat(72))
    const passed = results.filter((r) => r.recovered).length
    console.log(`${passed}/${results.length} conditions recovered the payload`)
    console.log(`PSNR ${quality.toFixed(2)} dB, ${(embedMs / frames.length).toFixed(1)}ms/frame`)
    console.log(`total ${((Date.now() - started) / 1000).toFixed(1)}s`)

    if (passed < results.length) process.exitCode = 1
    if (controlDecoded.valid) {
      console.error('\nControl decoded a payload from unwatermarked video.')
      process.exitCode = 1
    }
    if (controlAccuracy > 0.75) {
      console.error(
        `\nControl bit accuracy ${(controlAccuracy * 100).toFixed(1)}% is far above ` +
          'chance — the harness is not measuring what it claims.',
      )
      process.exitCode = 1
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
