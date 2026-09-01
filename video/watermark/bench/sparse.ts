/**
 * Sparse marking — how few frames can carry the mark and still be found?
 *
 * Marking every frame costs a full-resolution pass per frame, which on a phone
 * is most of the render. Since every frame carries the *same* id and a decoder
 * can scan until it finds one, marking a fraction of them is tempting.
 *
 * The reason it is not obviously safe is the video encoder. The residual is
 * low amplitude by design, and inter-frame coding spends bits only where a
 * frame differs from its prediction. A residual held steady across a shot is
 * cheap to keep — it lands once and later frames inherit it. A residual that
 * appears for one frame and vanishes is exactly the faint, isolated difference
 * rate-distortion optimisation drops in favour of a skip block.
 *
 * So this measures layouts, not just counts: the same fraction of frames marked
 * in runs versus one at a time, with and without forcing the export to start a
 * keyframe where each run begins. What it reports per layout is what a scanning
 * decoder actually experiences — which frames decode the id on their own, and
 * how far in it had to look.
 *
 * Run with:  npm run bench:sparse -w @variax-ai/video-watermark
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Watermarker } from '../src/watermarker'
import { DataLayer, PAYLOAD_BITS } from '../src/datalayer'
import { packPayload, unpackPayload } from '../src/payload'
import type { Payload } from '../src/payload'
import type { Frame } from '../src/frame'
import { probe, readFrames, writeFrames } from '../src/node/ffmpeg'
import { benchDocument } from './document'
import { renderFrames } from './render'
import { CACHE_DIR, accuracy, availableEncoders, ffmpeg, psnr } from './harness'

const PAYLOAD: Payload = { contentId: 20260901084500n }
const FPS = 30
/** Frames between the start of one marked run and the next — one per second. */
const STRIDE = 30
/** How many frames from the start a scanning decoder is allowed to look at. */
const SCAN = 32

interface Layout {
  name: string
  description: string
  /** Frames marked at the start of each `STRIDE`-frame group. */
  run: number
  /**
   * Force a keyframe where each run begins, on both the master and the export.
   * An I-frame is coded from scratch rather than predicted, so the residual in
   * it cannot be predicted away — and later frames that copy from it inherit
   * the mark for free.
   */
  keyframes?: boolean
}

const LAYOUTS: Layout[] = [
  { name: 'every', description: 'every frame — what embedFrames does today', run: STRIDE },
  { name: 'run10', description: '10 consecutive frames per second', run: 10 },
  { name: 'run10+key', description: '10 consecutive, keyframe at each run', run: 10, keyframes: true },
  { name: 'run3', description: '3 consecutive frames per second', run: 3 },
  { name: 'single', description: '1 isolated frame per second', run: 1 },
  { name: 'single+key', description: '1 isolated frame, keyframe on it', run: 1, keyframes: true },
]

interface Condition {
  name: string
  description: string
  args: string[]
  /** Encoder the condition needs; skipped when this ffmpeg lacks it. */
  requires?: string
  /** Container extension, when the codec will not sit in an mp4. */
  ext?: string
}

const CONDITIONS: Condition[] = [
  {
    name: 'crf23',
    description: 'H.264 CRF 23',
    args: ['-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p'],
  },
  {
    name: 'crop10',
    description: '10% centre crop',
    args: [
      '-vf', 'crop=iw*0.9:ih*0.9', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
    ],
  },
  {
    name: 'vp9-720',
    description: 'VP9 at 720p, 1.5Mbps (what YouTube serves)',
    args: [
      '-vf', 'scale=1280:720',
      '-c:v', 'libvpx-vp9', '-b:v', '1500k', '-row-mt', '1', '-cpu-used', '4',
      '-pix_fmt', 'yuv420p',
    ],
    ext: 'webm',
    requires: 'libvpx-vp9',
  },
]

function isMarked(index: number, layout: Layout): boolean {
  return index % STRIDE < layout.run
}

/** Times, in seconds, where each marked run begins. */
function runStarts(count: number): string[] {
  const times: string[] = []
  for (let i = 0; i < count; i += STRIDE) times.push((i / FPS).toFixed(3))
  return times
}

/**
 * Mark the frames a layout selects, leaving the rest untouched.
 *
 * Only the selected frames go through `embedFrames`, which is what a host
 * doing this would write — and it means the scene-change detector sees the
 * marked frames as a sequence of its own. For sparse layouts those frames are
 * a second apart, so it recomputes more often, and that cost is counted here
 * rather than hidden.
 */
async function markFrames(
  wm: Watermarker,
  frames: Frame[],
  layout: Layout,
): Promise<{ frames: Frame[]; embedMs: number; quality: number }> {
  const selected = frames.filter((_, i) => isMarked(i, layout))

  const started = Date.now()
  const marked: Frame[] = []
  for await (const frame of wm.embedFrames(selected, PAYLOAD)) marked.push(frame)
  const embedMs = Date.now() - started

  const out = frames.slice()
  let next = 0
  let quality = 0
  for (let i = 0; i < frames.length; i++) {
    if (!isMarked(i, layout)) continue
    out[i] = marked[next++]
    quality += psnr(frames[i].data, out[i].data)
  }

  return { frames: out, embedMs, quality: quality / marked.length }
}

interface ScanResult {
  /** One character per scanned frame: the id, a wrong payload, or nothing. */
  map: string
  /** Index of the first frame that gave up the id, or -1. */
  first: number
  hits: number
  /** Frames that decoded a valid packet carrying something other than the id. */
  wrongId: number
  scanned: number
  markedBits: number
  unmarkedBits: number
}

/**
 * Decode frames one at a time from the start, the way a scanner would.
 *
 * Deliberately *not* `extract`, which sums logits across every frame it is
 * given. Over a sparsely marked clip that buries a handful of marked frames
 * under the noise of the rest — worth knowing before pointing it at a video.
 */
async function scan(
  wm: Watermarker,
  file: string,
  layout: Layout,
  expected: Uint8Array,
): Promise<ScanResult> {
  const info = await probe(file)
  // `isMarked` maps a decoded frame index straight back to a source index, so
  // a condition that dropped, duplicated or reordered frames would split the
  // marked and unmarked columns along the wrong rows. None of the conditions
  // above do; this makes adding one that does a loud failure rather than a
  // quietly wrong table.
  if (Math.round(info.fps) !== FPS) {
    throw new Error(
      `${file} came back at ${info.fps}fps rather than ${FPS}: a condition that ` +
        'changes the frame rate breaks the marked/unmarked split',
    )
  }
  const dataLayer = new DataLayer()

  let map = ''
  let first = -1
  let hits = 0
  let wrongId = 0
  let index = 0
  let markedBits = 0
  let markedCount = 0
  let unmarkedBits = 0
  let unmarkedCount = 0

  for await (const frame of readFrames(file, info, { limit: SCAN })) {
    const logits = await wm.decodeFrame(frame)
    const bits = new Uint8Array(PAYLOAD_BITS)
    for (let i = 0; i < PAYLOAD_BITS; i++) bits[i] = logits[i] >= 0 ? 1 : 0

    const acc = accuracy(bits, expected)
    if (isMarked(index, layout)) {
      markedBits += acc
      markedCount += 1
    } else {
      unmarkedBits += acc
      unmarkedCount += 1
    }

    const decoded = dataLayer.decode(bits)
    const found =
      decoded.valid &&
      unpackPayload(decoded.data, decoded.schema).contentId === PAYLOAD.contentId

    if (found) {
      hits += 1
      if (first < 0) first = index
      map += '#'
    } else if (decoded.valid) {
      // A valid packet carrying something else is the number that decides how
      // a scanner has to work: stopping at the first frame that decodes would
      // report this id. The data layer falls back through the other schemas
      // when the tag itself is damaged, and a frame carrying a partial mark
      // gives it enough to land on a codeword that satisfies BCH.
      wrongId += 1
      map += '?'
    } else {
      map += '.'
    }
    index += 1
  }

  return {
    map,
    first,
    hits,
    wrongId,
    scanned: index,
    markedBits: markedCount ? markedBits / markedCount : NaN,
    unmarkedBits: unmarkedCount ? unmarkedBits / unmarkedCount : NaN,
  }
}

function percent(value: number): string {
  return Number.isNaN(value) ? '   — ' : `${(value * 100).toFixed(1).padStart(5)}%`
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'variax-sparse-'))
  const started = Date.now()

  try {
    console.log('Loading models...')
    const wm = await Watermarker.create({ cacheDir: CACHE_DIR })

    const doc = benchDocument()
    console.log(`Rendering ${doc.width}x${doc.height} at ${FPS}fps...`)
    const frames = renderFrames(doc, { fps: FPS })
    console.log(`  ${frames.length} frames, ${(frames.length / FPS).toFixed(1)}s`)

    const expected = new DataLayer().encode(packPayload(PAYLOAD, 'BCH_5'), 'BCH_5')
    const info = {
      width: doc.width,
      height: doc.height,
      fps: FPS,
      durationMs: doc.durationMs,
      hasAudio: false,
    }
    const keyframeArgs = ['-force_key_frames', runStarts(frames.length).join(',')]

    const encoders = await availableEncoders()

    const summary: {
      layout: string
      condition: string
      first: number
      wrongId: number
    }[] = []

    for (const layout of LAYOUTS) {
      const marked = frames.filter((_, i) => isMarked(i, layout)).length
      const { frames: output, embedMs, quality } = await markFrames(wm, frames, layout)

      console.log(`\n${layout.name} — ${layout.description}`)
      console.log(
        `  ${marked}/${frames.length} frames marked   ` +
          `${embedMs}ms embedding (${(embedMs / frames.length).toFixed(1)}ms per delivered frame)   ` +
          `PSNR ${quality.toFixed(1)} dB where marked`,
      )

      // Near-lossless intermediate, so each condition below measures its own
      // damage rather than damage inherited from this step.
      const master = join(dir, `${layout.name}-master.mp4`)
      await writeFrames(
        master,
        (async function* () {
          yield* output
        })(),
        info,
        { crf: 14, extraArgs: layout.keyframes ? keyframeArgs : undefined },
      )

      let marks = ''
      for (let i = 0; i < Math.min(SCAN, frames.length); i++) {
        marks += isMarked(i, layout) ? 'M' : '-'
      }
      console.log(`  marked   ${marks}`)

      for (const condition of CONDITIONS) {
        if (condition.requires && !encoders.has(condition.requires)) {
          console.log(
            `  ${condition.name.padEnd(8)} skipped — no ${condition.requires}`,
          )
          continue
        }

        const file = join(dir, `${layout.name}-${condition.name}.${condition.ext ?? 'mp4'}`)
        await ffmpeg([
          '-i', master,
          ...condition.args,
          ...(layout.keyframes ? keyframeArgs : []),
          file,
        ])

        const result = await scan(wm, file, layout, expected)
        summary.push({
          layout: layout.name,
          condition: condition.name,
          first: result.first,
          wrongId: result.wrongId,
        })

        console.log(
          `  ${condition.name.padEnd(8)} ${result.map}  ` +
            `${result.first < 0 ? 'NOT FOUND' : `found at frame ${result.first}`}, ` +
            `${result.hits}/${result.scanned} frames, ${result.wrongId} wrong-id   ` +
            `bits ${percent(result.markedBits)} marked / ${percent(result.unmarkedBits)} unmarked`,
        )
      }
    }

    console.log(`\n${'-'.repeat(72)}`)
    console.log('# frame gave up the id   ? valid packet, wrong id   . nothing')
    console.log(
      'Bit accuracy is before error correction; ~50% is the chance level, so an\n' +
        'unmarked column near 50% means the mark did not bleed into those frames.',
    )

    const wrong = summary.reduce((total, s) => total + s.wrongId, 0)
    if (wrong > 0) {
      console.log(
        `\n${wrong} frames decoded a valid packet carrying the wrong id. A scanner ` +
          'that\nstops at the first valid decode reports one of those, so require the ' +
          'same id\nfrom more than one frame before believing it.',
      )
    }

    const failed = summary.filter((s) => s.first < 0)
    if (failed.length > 0) {
      console.log(
        `\n${failed.length} layout/condition pairs never gave up the id: ` +
          failed.map((f) => `${f.layout}/${f.condition}`).join(', '),
      )
    }
    console.log(`total ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
