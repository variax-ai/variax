/**
 * What actually goes into the watermark.
 *
 * The hard constraint is size: the roomiest schema carries 75 bits, and the
 * default carries 61. That is nowhere near enough for arbitrary metadata, so a
 * mark carries *identifiers* and the metadata is resolved from them. Trying to
 * pack strings in here is the wrong shape — resolve `templateId` against your
 * own catalogue instead.
 *
 * Bit widths are computed from the schema rather than hard-coded, so a packet
 * always fills its capacity. `templateId` is pinned at 32 bits so a template's
 * id means the same thing regardless of which schema a given render used;
 * `renderId` takes whatever is left.
 */

import { schemaByName, type SchemaName } from './datalayer'

/** Bits reserved for the template id, fixed across schemas. */
export const TEMPLATE_ID_BITS = 32

export interface PayloadLayout {
  templateId: number
  renderId: number
}

export interface Payload {
  /** Which template produced the video. */
  templateId: number
  /** Which render of that template. Defaults to 0 when not supplied. */
  renderId?: number
}

export function layoutFor(schema: SchemaName): PayloadLayout {
  const { dataBits } = schemaByName(schema)
  if (dataBits <= TEMPLATE_ID_BITS) {
    throw new Error(
      `schema ${schema} holds ${dataBits} bits, too few for a ${TEMPLATE_ID_BITS}-bit template id`,
    )
  }
  return { templateId: TEMPLATE_ID_BITS, renderId: dataBits - TEMPLATE_ID_BITS }
}

/** Largest value a field of `width` bits can hold. */
export function maxValue(width: number): number {
  return Number((1n << BigInt(width)) - 1n)
}

function packField(
  bits: Uint8Array,
  offset: number,
  width: number,
  value: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${value}`)
  }
  if (value > maxValue(width)) {
    throw new Error(
      `${name} is ${value} but only ${width} bits are available (max ${maxValue(width)})`,
    )
  }
  // BigInt rather than shifts: renderId can exceed 32 bits, where `>>` breaks.
  let v = BigInt(value)
  for (let i = width - 1; i >= 0; i--) {
    bits[offset + i] = Number(v & 1n)
    v >>= 1n
  }
}

function unpackField(bits: Uint8Array, offset: number, width: number): number {
  let v = 0n
  for (let i = 0; i < width; i++) {
    v = (v << 1n) | BigInt(bits[offset + i])
  }
  return Number(v)
}

/** Pack a payload into the data bits for `schema`. */
export function packPayload(payload: Payload, schema: SchemaName): Uint8Array {
  const layout = layoutFor(schema)
  const bits = new Uint8Array(layout.templateId + layout.renderId)

  packField(bits, 0, layout.templateId, payload.templateId, 'templateId')
  packField(
    bits,
    layout.templateId,
    layout.renderId,
    payload.renderId ?? 0,
    'renderId',
  )
  return bits
}

/** Recover a payload from the data bits of a decoded packet. */
export function unpackPayload(bits: Uint8Array, schema: SchemaName): Payload {
  const layout = layoutFor(schema)
  if (bits.length !== layout.templateId + layout.renderId) {
    throw new Error(
      `expected ${layout.templateId + layout.renderId} data bits for ${schema}, got ${bits.length}`,
    )
  }
  return {
    templateId: unpackField(bits, 0, layout.templateId),
    renderId: unpackField(bits, layout.templateId, layout.renderId),
  }
}
