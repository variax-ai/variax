import type { VideoDocument } from '@variax-ai/video-schema'

export interface Frame {
  data: Uint8Array
  timeMs: number
}

export interface VideoMetadata {
  width: number
  height: number
  durationMs: number
  fps?: number
}

export interface FrameSource {
  metadata(): Promise<VideoMetadata>
  sample(timestamps: number[]): Promise<Frame[]>
  dispose?(): void
}

export interface InferenceRequest {
  frames: Frame[]
  prompt: string
  width: number
  height: number
  durationMs: number
  fps: number
}

export type InferFn = (request: InferenceRequest) => Promise<VideoDocument>

export interface ExtractorOptions {
  source: FrameSource | HTMLVideoElement
  infer: InferFn
  width?: number
  height?: number
  sampleCount?: number
  fps?: number
}
