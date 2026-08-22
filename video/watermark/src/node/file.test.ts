/**
 * End-to-end tests for the file helpers, against real ffmpeg and real models.
 *
 * Gated behind `VARIAX_WATERMARK_E2E=1` like the other integration tests, and
 * additionally needs `ffmpeg` on PATH.
 */

import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Watermarker } from '../watermarker'
import { extractFile, probe, watermarkFile } from './index'

const ENABLED =
  process.env.VARIAX_WATERMARK_E2E === '1' &&
  spawnSync('ffmpeg', ['-version']).status === 0

const CACHE_DIR =
  process.env.VARIAX_WATERMARK_MODELS ??
  fileURLToPath(new URL('../../node_modules/.cache/variax-watermark', import.meta.url))

/** A short synthetic clip with motion, plus an audio track to check it survives. */
function makeClip(path: string, size = '1280x720', seconds = 2): void {
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=15:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    path,
  ])
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr?.toString().slice(-500)}`)
  }
}

describe.skipIf(!ENABLED)('file helpers', () => {
  let wm: Watermarker
  let dir: string
  const payload = { templateId: 987654, renderId: 21 }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'variax-wm-file-'))
    wm = await Watermarker.create({ cacheDir: CACHE_DIR })
  }, 600_000)

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('round-trips a payload through an mp4', async () => {
    const input = join(dir, 'in.mp4')
    const output = join(dir, 'out.mp4')
    makeClip(input)

    await watermarkFile(wm, input, output, payload)
    const result = await extractFile(wm, output, { frames: 8 })

    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(payload)
  }, 600_000)

  it('preserves dimensions, duration and the audio track', async () => {
    const input = join(dir, 'audio-in.mp4')
    const output = join(dir, 'audio-out.mp4')
    makeClip(input)

    await watermarkFile(wm, input, output, payload)

    const before = await probe(input)
    const after = await probe(output)

    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)
    expect(after.hasAudio).toBe(true)
    expect(after.durationMs).toBeGreaterThan(before.durationMs * 0.8)
    expect((await stat(output)).size).toBeGreaterThan(0)
  }, 600_000)

  it('finds nothing in an unwatermarked file', async () => {
    const input = join(dir, 'clean.mp4')
    makeClip(input)

    const result = await extractFile(wm, input, { frames: 8 })
    expect(result.payload).not.toEqual(payload)
  }, 600_000)
})
