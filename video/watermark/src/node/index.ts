/**
 * Node-only helpers that work on video files rather than frames.
 *
 * This is what makes the package usable on video that never came from a
 * VideoDocument: point it at any MP4 and it comes back watermarked.
 *
 * ```ts
 * const wm = await Watermarker.create({ cacheDir: '.models' })
 * await watermarkFile(wm, 'in.mp4', 'out.mp4', { contentId: 481927351 })
 * const found = await extractFile(wm, 'out.mp4')
 * ```
 *
 * Requires `ffmpeg` and `ffprobe` on PATH.
 */

import type { Frame } from '../frame'
import type {
  EmbedOptions,
  ExtractResult,
  Watermarker,
} from '../watermarker'
import {
  probe,
  readFrames,
  writeFrames,
  type FfmpegOptions,
  type VideoInfo,
  type WriteOptions,
} from './ffmpeg'

export { probe, readFrames, writeFrames } from './ffmpeg'
export type { FfmpegOptions, ReadOptions, VideoInfo, WriteOptions } from './ffmpeg'

export interface WatermarkFileOptions extends EmbedOptions, WriteOptions {}

/**
 * Watermark a video file.
 *
 * Frames stream through, so memory does not scale with clip length. The output
 * is re-encoded — there is no way around that, since the mark lives in the
 * pixels — so `crf` is worth setting deliberately: the watermark has to survive
 * this encode before it ever faces a platform's.
 */
export async function watermarkFile(
  watermarker: Watermarker,
  input: string,
  output: string,
  payload: Parameters<Watermarker['embedFrame']>[1],
  options: WatermarkFileOptions = {},
): Promise<VideoInfo> {
  const info = await probe(input, options)

  const source = readFrames(input, info, options)
  const marked = watermarker.embedFrames(source, payload, options)

  await writeFrames(output, marked, info, { audioFrom: input, ...options })
  return info
}

export interface ExtractFileOptions extends FfmpegOptions {
  /**
   * How many frames to sample. More frames means a better chance of recovery,
   * at a linear cost in decoder inferences.
   */
  frames?: number
}

/**
 * Recover a payload from a video file.
 *
 * Frames are sampled evenly across the clip rather than taken from the start:
 * a mark can be damaged in one shot and intact in the next, and spreading the
 * samples means a single bad shot does not decide the result.
 */
export async function extractFile(
  watermarker: Watermarker,
  input: string,
  options: ExtractFileOptions = {},
): Promise<ExtractResult> {
  const info = await probe(input, options)
  const wanted = options.frames ?? 16

  // Sample at a rate that spreads `wanted` frames across the whole duration,
  // falling back to every frame for clips too short to sample.
  const seconds = info.durationMs / 1000
  const rate = seconds > 0 ? Math.min(info.fps || 30, wanted / seconds) : 0
  const filter = rate > 0 ? `fps=${rate.toFixed(6)}` : undefined

  const frames = readFrames(input, info, {
    ...options,
    filter,
    limit: wanted,
  })

  return watermarker.extract(frames as AsyncIterable<Frame>)
}
