/**
 * The main entry point: embed a payload into frames, and recover it again.
 */

import { assertFrame, type Frame, type Planar } from './frame'
import {
  DataLayer,
  DEFAULT_SCHEMA,
  PAYLOAD_BITS,
  type SchemaName,
} from './datalayer'
import {
  DECODER_INPUT,
  DECODER_OUTPUT,
  ENCODER_BITS_INPUT,
  ENCODER_IMAGE_INPUT,
  ENCODER_OUTPUT,
  loadModels,
  type LoadedModels,
  type ModelOptions,
} from './models'
import { packPayload, unpackPayload, type Payload } from './payload'
import {
  applyResidual,
  cloneFrame,
  toModelTensor,
  upscaleResidual,
  watermarkRegion,
} from './pixels'
import type { CropBox } from './resize'
import { computeResidual, frameSignature, signatureDistance } from './residual'

/**
 * How the residual is derived across a sequence of frames.
 *
 * - `sharedResidual` computes one residual and reuses it until the picture
 *   changes materially. Much cheaper — one inference per shot rather than per
 *   frame — and the residual stays temporally stable, which both looks better
 *   and compresses better, since a residual that flickers frame to frame is
 *   noise the encoder has to spend bits on.
 * - `perFrame` runs the encoder on every frame. Use when frames within a shot
 *   differ enough that a shared residual stops matching the content.
 */
export type EmbedStrategy = 'sharedResidual' | 'perFrame'

export interface EmbedOptions {
  /** Embedding strength. 1.0 is the reference default; lower is less visible. */
  strength?: number
  schema?: SchemaName
  strategy?: EmbedStrategy
  /**
   * Signature distance above which `sharedResidual` recomputes. Measured in
   * [-1, 1] luma units, so 0.05 is roughly a 2.5% shift in average brightness.
   */
  sceneChangeThreshold?: number
}

export interface ExtractOptions {
  /** Stop after this many frames. Defaults to all supplied. */
  maxFrames?: number
}

export interface ExtractResult {
  /** Recovered payload, or null when error correction failed. */
  payload: Payload | null
  valid: boolean
  schema: SchemaName
  /** Bit flips corrected, or -1 on failure. */
  bitflips: number
  framesUsed: number
  /**
   * Mean absolute decoder logit across the aggregated bits. Higher means the
   * decoder was more decisive; near zero means it was guessing.
   */
  confidence: number
}

const DEFAULT_STRENGTH = 1.0
const DEFAULT_SCENE_CHANGE_THRESHOLD = 0.05

export class Watermarker {
  private readonly models: LoadedModels
  private readonly dataLayer: DataLayer

  constructor(models: LoadedModels, dataLayer = new DataLayer()) {
    this.models = models
    this.dataLayer = dataLayer
  }

  /** Load the models and build a watermarker. Do this once and reuse it. */
  static async create(options: ModelOptions = {}): Promise<Watermarker> {
    return new Watermarker(await loadModels(options))
  }

  /** Embed a payload into a single frame, returning a new frame. */
  async embedFrame(
    frame: Frame,
    payload: Payload,
    options: EmbedOptions = {},
  ): Promise<Frame> {
    assertFrame(frame)
    const schema = options.schema ?? DEFAULT_SCHEMA
    const bits = this.packetFor(payload, schema)

    const region = watermarkRegion(frame.width, frame.height)
    const cover = toModelTensor(frame, this.models.config.encodeSize, region)
    const residual = await this.residualFor(cover, bits)

    const out = cloneFrame(frame)
    applyResidual(
      out,
      upscaleResidual(residual, region),
      region,
      this.effectiveStrength(options),
    )
    return out
  }

  /**
   * Embed a payload across a sequence of frames.
   *
   * Frames are processed as they arrive and yielded one at a time, so a whole
   * video never has to be held in memory.
   */
  async *embedFrames(
    frames: AsyncIterable<Frame> | Iterable<Frame>,
    payload: Payload,
    options: EmbedOptions = {},
  ): AsyncGenerator<Frame> {
    const schema = options.schema ?? DEFAULT_SCHEMA
    const bits = this.packetFor(payload, schema)
    const strategy = options.strategy ?? 'sharedResidual'
    const strength = this.effectiveStrength(options)
    const threshold = options.sceneChangeThreshold ?? DEFAULT_SCENE_CHANGE_THRESHOLD
    const size = this.models.config.encodeSize

    let cached:
      | { upscaled: Planar; signature: Float32Array; region: CropBox }
      | undefined

    for await (const frame of frames) {
      assertFrame(frame)
      const region = watermarkRegion(frame.width, frame.height)
      // Cheap enough to run unconditionally; the expensive tensor build below
      // only happens when this says the residual can no longer be reused.
      const signature = frameSignature(frame, region)

      const stale =
        !cached ||
        cached.region.width !== region.width ||
        cached.region.height !== region.height ||
        signatureDistance(cached.signature, signature) > threshold

      if (strategy === 'perFrame' || stale) {
        const cover = toModelTensor(frame, size, region)
        const residual = await this.residualFor(cover, bits)
        cached = { upscaled: upscaleResidual(residual, region), signature, region }
      }

      const out = cloneFrame(frame)
      applyResidual(out, cached!.upscaled, region, strength)
      yield out
    }
  }

  /**
   * Recover a payload from one or more frames.
   *
   * Decoder outputs are summed as soft values and thresholded once at the end,
   * rather than thresholding each frame and taking a majority vote: a frame
   * where the decoder was merely unsure should not carry the same weight as one
   * where it was certain, and averaging the logits keeps that information.
   */
  async extract(
    frames: AsyncIterable<Frame> | Iterable<Frame> | Frame[],
    options: ExtractOptions = {},
  ): Promise<ExtractResult> {
    const totals = new Float32Array(PAYLOAD_BITS)
    let framesUsed = 0

    for await (const frame of frames as AsyncIterable<Frame>) {
      if (options.maxFrames != null && framesUsed >= options.maxFrames) break
      assertFrame(frame)

      const logits = await this.decodeFrame(frame)
      for (let i = 0; i < PAYLOAD_BITS; i++) totals[i] += logits[i]
      framesUsed += 1
    }

    if (framesUsed === 0) {
      throw new Error('extract needs at least one frame')
    }

    const packet = new Uint8Array(PAYLOAD_BITS)
    let confidence = 0
    for (let i = 0; i < PAYLOAD_BITS; i++) {
      packet[i] = totals[i] >= 0 ? 1 : 0
      confidence += Math.abs(totals[i]) / framesUsed
    }

    const decoded = this.dataLayer.decode(packet)
    return {
      payload: decoded.valid ? unpackPayload(decoded.data, decoded.schema) : null,
      valid: decoded.valid,
      schema: decoded.schema,
      bitflips: decoded.bitflips,
      framesUsed,
      confidence: confidence / PAYLOAD_BITS,
    }
  }

  /** Raw decoder logits for one frame: 100 signed values, positive meaning 1. */
  async decodeFrame(frame: Frame): Promise<Float32Array> {
    assertFrame(frame)
    const size = this.models.config.decodeSize
    const region = watermarkRegion(frame.width, frame.height)
    const tensor = toModelTensor(frame, size, region)

    const outputs = await this.models.decoder.run({
      [DECODER_INPUT]: { data: tensor, dims: [1, 3, size, size] },
    })
    const output = outputs[DECODER_OUTPUT]
    if (!output) {
      throw new Error(
        `decoder produced no "${DECODER_OUTPUT}" output (got ${Object.keys(outputs).join(', ')})`,
      )
    }
    const logits = output.data as Float32Array
    if (logits.length < PAYLOAD_BITS) {
      throw new Error(
        `decoder returned ${logits.length} values, expected at least ${PAYLOAD_BITS} — ` +
          'the model does not match this data layer',
      )
    }
    return logits
  }

  private packetFor(payload: Payload, schema: SchemaName): Float32Array {
    const packet = this.dataLayer.encode(packPayload(payload, schema), schema)
    return Float32Array.from(packet)
  }

  private effectiveStrength(options: EmbedOptions): number {
    return (
      (options.strength ?? DEFAULT_STRENGTH) * this.models.config.strengthMultiplier
    )
  }

  private async residualFor(
    cover: Float32Array,
    bits: Float32Array,
  ): Promise<Planar> {
    const size = this.models.config.encodeSize
    const outputs = await this.models.encoder.run({
      [ENCODER_IMAGE_INPUT]: { data: cover, dims: [1, 3, size, size] },
      [ENCODER_BITS_INPUT]: { data: bits, dims: [1, bits.length] },
    })

    const stego = outputs[ENCODER_OUTPUT]
    if (!stego) {
      throw new Error(
        `encoder produced no "${ENCODER_OUTPUT}" output (got ${Object.keys(outputs).join(', ')})`,
      )
    }
    return computeResidual(cover, stego.data as Float32Array, size)
  }
}
