import type { VideoDocument } from '@variax-ai/video-schema'
import type { ExtractorOptions, FrameSource } from './types'
import { createBrowserFrameSource } from './frames'
import { buildPrompt } from './prompt'
import { validateDocument } from './validate'

const DEFAULT_FPS = 30
const MAX_SAMPLES = 20

function isHTMLVideoElement(source: unknown): source is HTMLVideoElement {
  return (
    typeof HTMLVideoElement !== 'undefined' &&
    source instanceof HTMLVideoElement
  )
}

function isFrameSource(source: unknown): source is FrameSource {
  return (
    typeof source === 'object' &&
    source !== null &&
    'metadata' in source &&
    'sample' in source
  )
}

function computeTimestamps(durationMs: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const step = durationMs / count
  const timestamps: number[] = []
  for (let i = 0; i < count; i++) {
    timestamps.push(Math.round(step * i + step / 2))
  }
  return timestamps
}

export async function extractDocument(
  options: ExtractorOptions,
): Promise<VideoDocument> {
  let source: FrameSource

  if (isHTMLVideoElement(options.source)) {
    source = createBrowserFrameSource(options.source)
  } else if (isFrameSource(options.source)) {
    source = options.source
  } else {
    throw new Error(
      'source must be an HTMLVideoElement or a FrameSource object',
    )
  }

  try {
    const meta = await source.metadata()
    const width = options.width ?? meta.width
    const height = options.height ?? meta.height
    const fps = options.fps ?? meta.fps ?? DEFAULT_FPS
    const durationMs = meta.durationMs
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('Source video must have a finite positive duration')
    }

    const sampleCount = Math.min(
      options.sampleCount ?? Math.max(1, Math.ceil(durationMs / 1000)),
      MAX_SAMPLES,
    )

    const timestamps = computeTimestamps(durationMs, sampleCount)
    const frames = await source.sample(timestamps)

    const prompt = buildPrompt({ width, height, durationMs, fps })

    const raw = await options.infer({
      frames,
      prompt,
      width,
      height,
      durationMs,
      fps,
    })

    return validateDocument(raw)
  } finally {
    source.dispose?.()
  }
}
