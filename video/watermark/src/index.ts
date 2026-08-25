/**
 * Hidden watermarking for video frames.
 *
 * Embeds an identifier into the pixels of a frame so it survives being encoded,
 * re-encoded and rescaled, and can be recovered from the exported video. Built
 * on adobe/trustmark's ONNX models.
 *
 * The payload is an *identifier*, not a metadata container — the largest schema
 * carries 75 bits. Resolve the real metadata from `contentId` yourself.
 *
 * ```ts
 * const wm = await Watermarker.create({ cacheDir: '.models' })
 * const marked = await wm.embedFrame(frame, { contentId: 481927351 })
 * const found = await wm.extract([marked])
 * ```
 *
 * This entry point is platform-neutral. Node-only helpers that read and write
 * video files live in `@variax-ai/video-watermark/node`.
 */

export { Watermarker } from './watermarker'
export type {
  EmbedOptions,
  EmbedStrategy,
  ExtractOptions,
  ExtractResult,
} from './watermarker'

export type { Frame, Planar } from './frame'
export { createFrame } from './frame'

export type { Payload, PayloadInput } from './payload'
export { maxContentId, maxValue, payloadBits } from './payload'

export {
  DataLayer,
  DEFAULT_SCHEMA,
  PAYLOAD_BITS,
  SCHEMAS,
  schemaByName,
} from './datalayer'
export type { DecodedPacket, SchemaName, SchemaSpec } from './datalayer'

export {
  DEFAULT_MODELS_URL,
  DEFAULT_VARIANT,
  VARIANTS,
  createRuntime,
  loadModelBytes,
  loadModels,
} from './models'
export type {
  LoadedModels,
  ModelOptions,
  OrtModule,
  Runtime,
  Session,
  TensorLike,
  Variant,
  VariantConfig,
} from './models'

export { ASPECT_RATIO_LIMIT, watermarkRegion } from './pixels'
