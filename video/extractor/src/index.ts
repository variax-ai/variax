import type { VideoDocument } from '@variax-ai/video-schema'

export interface ExtractorOptions {
  source: HTMLVideoElement | string
  width?: number
  height?: number
}

export async function extractDocument(
  _options: ExtractorOptions,
): Promise<VideoDocument> {
  throw new Error('extractDocument is not yet implemented')
}
