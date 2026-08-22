/**
 * The TrustMark data layer: how 100 watermark bits are divided into payload,
 * error-correction and schema bits.
 *
 * Ported from `python/trustmark/datalayer.py` and `js/tm_datalayer.js`
 * (adobe/trustmark, MIT). The layout is fixed by interoperability — a packet we
 * build has to be readable by Adobe's own decoders:
 *
 *     [ data bits ][ ECC bits ][ 4 version bits ]
 *     |<------- 96 bits ----->|<---- 4 bits --->|
 *
 * The schema is recovered from the *last two* of the four version bits, and it
 * determines the split: more ECC bits buy more correctable bit flips at the
 * cost of payload.
 */

import { BCH } from './bch'

export const PAYLOAD_BITS = 100
export const DATA_ECC_BITS = 96
export const VERSION_BITS = 4

const BCH_POLYNOMIAL = 137

export type SchemaName = 'BCH_SUPER' | 'BCH_5' | 'BCH_4' | 'BCH_3'

export interface SchemaSpec {
  /** Value written into the version bits. */
  version: number
  name: SchemaName
  /** Correctable bit flips. */
  t: number
  /** Usable payload bits. */
  dataBits: number
}

export const SCHEMAS: readonly SchemaSpec[] = [
  { version: 0, name: 'BCH_SUPER', t: 8, dataBits: 40 },
  { version: 1, name: 'BCH_5', t: 5, dataBits: 61 },
  { version: 2, name: 'BCH_4', t: 4, dataBits: 68 },
  { version: 3, name: 'BCH_3', t: 3, dataBits: 75 },
]

/**
 * The default. 61 payload bits is comfortably more than an id needs, and 5
 * correctable flips is the most error correction available without dropping to
 * BCH_SUPER's 40 bits.
 */
export const DEFAULT_SCHEMA: SchemaName = 'BCH_5'

export function schemaByName(name: SchemaName): SchemaSpec {
  const spec = SCHEMAS.find((s) => s.name === name)
  if (!spec) throw new Error(`unknown schema ${name}`)
  return spec
}

export interface DecodedPacket {
  /** Payload bits, `schema.dataBits` long. Present even when `valid` is false. */
  data: Uint8Array
  /** Whether error correction succeeded. Only trust `data` when this is true. */
  valid: boolean
  schema: SchemaName
  version: number
  /** Bit flips corrected, or -1 when correction failed. */
  bitflips: number
}

function bitsToBytes(bits: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7)
  }
  return bytes
}

function bytesToBits(bytes: Uint8Array, count: number): Uint8Array {
  const bits = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    bits[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1
  }
  return bits
}

/**
 * Builds and caches one BCH engine per schema. Construction fills a few
 * kilobytes of lookup tables, so hold on to an instance rather than making one
 * per frame.
 */
export class DataLayer {
  private readonly engines = new Map<number, BCH>()

  private engine(spec: SchemaSpec): BCH {
    let bch = this.engines.get(spec.version)
    if (!bch) {
      bch = new BCH(spec.t, BCH_POLYNOMIAL)
      this.engines.set(spec.version, bch)
    }
    return bch
  }

  /**
   * Build a 100-bit packet from payload bits.
   *
   * Payloads shorter than the schema's capacity are zero-padded; longer ones
   * are rejected rather than truncated, since a silently shortened id would
   * decode cleanly as the wrong id.
   */
  encode(dataBits: Uint8Array, schema: SchemaName = DEFAULT_SCHEMA): Uint8Array {
    const spec = schemaByName(schema)
    const bch = this.engine(spec)

    if (dataBits.length > spec.dataBits) {
      throw new Error(
        `payload is ${dataBits.length} bits but schema ${schema} holds ${spec.dataBits}`,
      )
    }
    if (bch.getEccBits() !== DATA_ECC_BITS - spec.dataBits) {
      throw new Error(
        `schema ${schema} expects ${DATA_ECC_BITS - spec.dataBits} ECC bits, got ${bch.getEccBits()}`,
      )
    }

    const packet = new Uint8Array(PAYLOAD_BITS)
    packet.set(dataBits, 0)

    // Data is zero-padded to a byte boundary before ECC is computed; the
    // padding is not transmitted.
    const dataBytes = bitsToBytes(packet.subarray(0, spec.dataBits))
    const eccBytes = bch.encode(dataBytes)
    const eccBits = bytesToBits(eccBytes, bch.getEccBits())
    packet.set(eccBits, spec.dataBits)

    for (let i = 0; i < VERSION_BITS; i++) {
      packet[DATA_ECC_BITS + i] = (spec.version >> (VERSION_BITS - 1 - i)) & 1
    }
    return packet
  }

  /**
   * Recover a payload from 100 watermark bits.
   *
   * When the declared schema fails to validate the remaining schemas are tried
   * in turn, mirroring the shipping JS decoder: a flip landing in the version
   * bits would otherwise discard an otherwise-correctable packet.
   */
  decode(packet: Uint8Array): DecodedPacket {
    if (packet.length !== PAYLOAD_BITS) {
      throw new Error(`expected ${PAYLOAD_BITS} bits, got ${packet.length}`)
    }

    const declared = packet[DATA_ECC_BITS + 2] * 2 + packet[DATA_ECC_BITS + 3]
    const order = [declared, ...SCHEMAS.map((s) => s.version)].filter(
      (v, i, all) => all.indexOf(v) === i,
    )

    let first: DecodedPacket | undefined
    for (const version of order) {
      const attempt = this.attempt(packet, SCHEMAS[version])
      if (attempt.valid) return attempt
      first ??= attempt
    }
    return first as DecodedPacket
  }

  private attempt(packet: Uint8Array, spec: SchemaSpec): DecodedPacket {
    const bch = this.engine(spec)

    const dataBytes = bitsToBytes(packet.subarray(0, spec.dataBits))
    const eccBytes = bitsToBytes(packet.subarray(spec.dataBits, DATA_ECC_BITS))

    let bitflips = -1
    if (eccBytes.length === bch.getEccBytes()) {
      bitflips = bch.decode(dataBytes, eccBytes)
    }

    return {
      data: bytesToBits(dataBytes, spec.dataBits),
      valid: bitflips !== -1,
      schema: spec.name,
      version: spec.version,
      bitflips,
    }
  }
}
