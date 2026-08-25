/**
 * What actually goes into the watermark.
 *
 * The hard constraint is size: the roomiest schema carries 75 bits, and the
 * default carries 61. That is nowhere near enough for arbitrary metadata, so a
 * mark carries a single *identifier* and the metadata is resolved from it.
 * Trying to pack strings in here is the wrong shape — resolve `contentId`
 * against your own catalogue instead.
 *
 * `contentId` names the content, not how it was produced. Which template,
 * experiment or variation made a render belongs in that catalogue, where it can
 * change — or be added years later — without re-marking a single frame.
 *
 * One field spanning the whole payload also means an id reads back the same
 * whichever schema carried it: the value is a big-endian integer, and a roomier
 * schema only adds leading zeros. Ids are `bigint` because the default schema's
 * 61 bits outrun the 53 a `number` holds exactly.
 */

import { schemaByName, type SchemaName } from './datalayer'

/** A recovered payload: one opaque identifier for the marked content. */
export interface Payload {
  /** Stable id for the content this frame belongs to. */
  contentId: bigint
}

/** A payload as callers supply it — a small id may be a plain number. */
export interface PayloadInput {
  /** Stable id for the content this frame belongs to. */
  contentId: bigint | number
}

/** How many bits of id `schema` carries. */
export function payloadBits(schema: SchemaName): number {
  return schemaByName(schema).dataBits
}

/** Largest value a field of `width` bits can hold. */
export function maxValue(width: number): bigint {
  return (1n << BigInt(width)) - 1n
}

/** Largest content id `schema` can carry. */
export function maxContentId(schema: SchemaName): bigint {
  return maxValue(payloadBits(schema))
}

function toId(value: bigint | number): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`contentId must be an integer, got ${value}`)
    }
    // Rounding an id is worse than refusing it: the mark would embed cleanly,
    // extract cleanly, and resolve to the wrong content.
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `contentId ${value} is past the largest integer a number holds exactly, pass a bigint`,
      )
    }
  }
  return BigInt(value)
}

/** Pack a payload into the data bits for `schema`. */
export function packPayload(payload: PayloadInput, schema: SchemaName): Uint8Array {
  const width = payloadBits(schema)
  const id = toId(payload.contentId)

  if (id < 0n) {
    throw new Error(`contentId must be non-negative, got ${id}`)
  }
  if (id > maxValue(width)) {
    throw new Error(
      `contentId is ${id} but schema ${schema} holds ${width} bits (max ${maxValue(width)})`,
    )
  }

  const bits = new Uint8Array(width)
  let v = id
  for (let i = width - 1; i >= 0; i--) {
    bits[i] = Number(v & 1n)
    v >>= 1n
  }
  return bits
}

/** Recover a payload from the data bits of a decoded packet. */
export function unpackPayload(bits: Uint8Array, schema: SchemaName): Payload {
  const width = payloadBits(schema)
  if (bits.length !== width) {
    throw new Error(`expected ${width} data bits for ${schema}, got ${bits.length}`)
  }

  let v = 0n
  for (let i = 0; i < width; i++) {
    v = (v << 1n) | BigInt(bits[i])
  }
  return { contentId: v }
}
