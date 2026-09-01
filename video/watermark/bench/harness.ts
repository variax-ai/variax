/**
 * Pieces shared by the bench scripts: running ffmpeg, and the two measures
 * every one of them reports.
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

export const CACHE_DIR =
  process.env.VARIAX_WATERMARK_MODELS ??
  join(process.cwd(), 'node_modules/.cache/variax-watermark')

/** Run ffmpeg to completion, failing loudly with its own diagnostics. */
export function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-v', 'error', '-y', ...args])
    let stderr = ''
    child.stderr.on('data', (c) => (stderr += c))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`)),
    )
  })
}

/** Fraction of raw watermark bits recovered, before error correction. */
export function accuracy(actual: Uint8Array, expected: Uint8Array): number {
  let same = 0
  for (let i = 0; i < expected.length; i++) if (actual[i] === expected[i]) same += 1
  return same / expected.length
}

/** Peak signal-to-noise ratio between two RGBA frames, ignoring alpha. */
export function psnr(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue
    const d = a[i] - b[i]
    sum += d * d
    count += 1
  }
  const mse = sum / count
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse)
}

/**
 * Encoder names this ffmpeg build can actually use.
 *
 * Conditions that name a codec the local build lacks are skipped rather than
 * failing the run: VP9 and AV1 are common but not universal, and a bench that
 * cannot run on a machine reports nothing at all.
 */
export async function availableEncoders(): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-encoders'])
    let stdout = ''
    child.stdout.on('data', (c) => (stdout += c))
    child.on('error', reject)
    child.on('close', () => {
      const names = new Set<string>()
      for (const line of stdout.split('\n')) {
        const match = /^\s*[A-Z.]{6}\s+(\S+)/.exec(line)
        if (match) names.add(match[1])
      }
      resolve(names)
    })
  })
}
