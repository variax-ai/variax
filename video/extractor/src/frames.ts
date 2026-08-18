import type { Frame, FrameSource, VideoMetadata } from './types'

export function createBrowserFrameSource(
  video: HTMLVideoElement,
): FrameSource {
  return {
    async metadata(): Promise<VideoMetadata> {
      await waitForReady(video)
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs: video.duration * 1000,
      }
    },

    async sample(timestamps: number[]): Promise<Frame[]> {
      await waitForReady(video)
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!

      const frames: Frame[] = []
      for (const timeMs of timestamps) {
        await seekTo(video, timeMs)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(video, 0, 0)
        const data = await canvasToPng(canvas)
        frames.push({ data, timeMs })
      }
      return frames
    },
  }
}

function waitForReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(video.error), { once: true })
  })
}

function seekTo(video: HTMLVideoElement, timeMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener('seeked', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(video.error), { once: true })
    video.currentTime = timeMs / 1000
  })
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}
