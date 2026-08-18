export type {
  ExtractorOptions,
  Frame,
  FrameSource,
  InferenceRequest,
  InferFn,
  VideoMetadata,
} from './types'

export { extractDocument } from './pipeline'
export { createBrowserFrameSource } from './frames'
export { parseResponse } from './parse'
export { buildPrompt } from './prompt'
export { validateDocument } from './validate'

export type { VideoDocument } from '@variax-ai/video-schema'
