/**
 * ffmpeg plumbing: video files in, raw RGBA frames out, and back again.
 *
 * ffmpeg is spawned directly over pipes rather than going through a wrapper
 * package — the command lines are short, streaming keeps memory flat regardless
 * of clip length, and it avoids a dependency for what amounts to argument
 * building.
 *
 * ffmpeg must be on PATH. It is not bundled.
 */

import { spawn } from 'node:child_process'
import type { Frame } from '../frame'

export interface VideoInfo {
  width: number
  height: number
  /** Frames per second, as reported by the container. */
  fps: number
  durationMs: number
  hasAudio: boolean
}

export interface FfmpegOptions {
  /** Path to the ffmpeg binary. */
  ffmpegPath?: string
  /** Path to the ffprobe binary. */
  ffprobePath?: string
}

function run(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} exited with ${code}: ${stderr.slice(-2000)}`))
    })
  })
}

/** Read dimensions, frame rate and duration from a video file. */
export async function probe(
  input: string,
  options: FfmpegOptions = {},
): Promise<VideoInfo> {
  const { stdout } = await run(options.ffprobePath ?? 'ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=width,height,avg_frame_rate,codec_type',
    '-show_entries', 'format=duration',
    '-of', 'json',
    input,
  ])

  const parsed = JSON.parse(stdout) as {
    streams?: {
      width?: number
      height?: number
      avg_frame_rate?: string
      codec_type?: string
    }[]
    format?: { duration?: string }
  }

  const video = parsed.streams?.find((s) => s.codec_type === 'video')
  if (!video?.width || !video?.height) {
    throw new Error(`no video stream found in ${input}`)
  }

  const [num, den] = (video.avg_frame_rate ?? '0/1').split('/').map(Number)
  const fps = den ? num / den : 0

  return {
    width: video.width,
    height: video.height,
    fps,
    durationMs: Number(parsed.format?.duration ?? 0) * 1000,
    hasAudio: parsed.streams?.some((s) => s.codec_type === 'audio') ?? false,
  }
}

export interface ReadOptions extends FfmpegOptions {
  /** Extra input filters, e.g. `fps=1` to sample rather than read every frame. */
  filter?: string
  /** Stop after this many frames. */
  limit?: number
}

/**
 * Decode a video to RGBA frames.
 *
 * Yields frames as ffmpeg produces them. Each yielded frame owns its buffer, so
 * it stays valid after the next one arrives.
 */
export async function* readFrames(
  input: string,
  info: VideoInfo,
  options: ReadOptions = {},
): AsyncGenerator<Frame> {
  const frameBytes = info.width * info.height * 4
  const args = ['-v', 'error', '-i', input]
  if (options.filter) args.push('-vf', options.filter)
  if (options.limit != null) args.push('-frames:v', String(options.limit))
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-')

  const child = spawn(options.ffmpegPath ?? 'ffmpeg', args)
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))

  const failed = new Promise<never>((_, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-2000)}`))
      }
    })
  })
  // The close handler above rejects even after we have finished reading; keep
  // it from surfacing as an unhandled rejection once the stream ends cleanly.
  failed.catch(() => {})

  let pending: Buffer = Buffer.alloc(0)
  let produced = 0

  for await (const chunk of child.stdout) {
    pending = pending.length === 0 ? (chunk as Buffer) : Buffer.concat([pending, chunk as Buffer])

    while (pending.length >= frameBytes) {
      const slice = pending.subarray(0, frameBytes)
      pending = pending.subarray(frameBytes)

      yield {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(
          slice.buffer.slice(
            slice.byteOffset,
            slice.byteOffset + slice.byteLength,
          ),
        ),
      }

      produced += 1
      if (options.limit != null && produced >= options.limit) {
        child.kill('SIGKILL')
        return
      }
    }
  }
}

export interface WriteOptions extends FfmpegOptions {
  /** x264 constant rate factor. Lower is higher quality. */
  crf?: number
  /** x264 preset. */
  preset?: string
  /** Video codec. */
  codec?: string
  /** Copy the audio stream from this file, when it has one. */
  audioFrom?: string
  /** Extra arguments inserted before the output path. */
  extraArgs?: string[]
}

/**
 * Encode RGBA frames to a video file.
 *
 * Audio is copied from `audioFrom` when supplied, so watermarking a clip does
 * not silently drop its soundtrack.
 */
export async function writeFrames(
  output: string,
  frames: AsyncIterable<Frame>,
  info: VideoInfo,
  options: WriteOptions = {},
): Promise<void> {
  const args = [
    '-v', 'error',
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${info.width}x${info.height}`,
    '-r', String(info.fps || 30),
    '-i', 'pipe:0',
  ]

  const withAudio = options.audioFrom && info.hasAudio
  if (withAudio) args.push('-i', options.audioFrom as string)

  args.push(
    '-map', '0:v:0',
    ...(withAudio ? ['-map', '1:a:0', '-c:a', 'copy'] : []),
    '-c:v', options.codec ?? 'libx264',
    '-preset', options.preset ?? 'medium',
    '-crf', String(options.crf ?? 18),
    '-pix_fmt', 'yuv420p',
    ...(withAudio ? ['-shortest'] : []),
    ...(options.extraArgs ?? []),
    output,
  )

  const child = spawn(options.ffmpegPath ?? 'ffmpeg', args)
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))

  const finished = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-2000)}`))
    })
  })

  try {
    for await (const frame of frames) {
      const bytes = Buffer.from(
        frame.data.buffer,
        frame.data.byteOffset,
        frame.data.byteLength,
      )
      if (!child.stdin.write(bytes)) {
        await new Promise((resolve) => child.stdin.once('drain', resolve))
      }
    }
  } finally {
    child.stdin.end()
  }

  await finished
}
