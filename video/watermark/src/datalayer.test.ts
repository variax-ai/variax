import { describe, expect, it } from 'vitest'
import {
  DATA_ECC_BITS,
  DataLayer,
  PAYLOAD_BITS,
  SCHEMAS,
  schemaByName,
  type SchemaName,
} from './datalayer'

function randomBits(n: number, seed: number): Uint8Array {
  // Deterministic LCG — a failing case should be reproducible from its seed.
  let state = seed >>> 0
  const bits = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    bits[i] = (state >>> 16) & 1
  }
  return bits
}

function flip(packet: Uint8Array, positions: number[]): Uint8Array {
  const copy = Uint8Array.from(packet)
  for (const p of positions) copy[p] ^= 1
  return copy
}

describe('DataLayer', () => {
  const layer = new DataLayer()

  it('lays out 100 bits as data + ECC + version', () => {
    const spec = schemaByName('BCH_5')
    const packet = layer.encode(randomBits(spec.dataBits, 1), 'BCH_5')

    expect(packet.length).toBe(PAYLOAD_BITS)
    // Version 1 is 0b0001 across the four version bits.
    expect([...packet.subarray(DATA_ECC_BITS)]).toEqual([0, 0, 0, 1])
  })

  for (const spec of SCHEMAS) {
    describe(spec.name, () => {
      const name = spec.name as SchemaName

      it('round-trips a clean packet', () => {
        const data = randomBits(spec.dataBits, spec.version + 7)
        const decoded = layer.decode(layer.encode(data, name))

        expect(decoded.valid).toBe(true)
        expect(decoded.schema).toBe(name)
        expect(decoded.bitflips).toBe(0)
        expect([...decoded.data]).toEqual([...data])
      })

      it(`corrects up to ${spec.t} bit flips`, () => {
        for (let trial = 0; trial < 40; trial++) {
          const data = randomBits(spec.dataBits, trial * 31 + spec.version)
          const packet = layer.encode(data, name)

          // Choose t distinct positions within the data+ECC region.
          const positions = new Set<number>()
          let cursor = trial * 17 + 3
          while (positions.size < spec.t) {
            cursor = (cursor * 5 + 11) % DATA_ECC_BITS
            positions.add(cursor)
          }

          const decoded = layer.decode(flip(packet, [...positions]))
          expect(decoded.valid, `trial ${trial}`).toBe(true)
          expect([...decoded.data], `trial ${trial}`).toEqual([...data])
        }
      })

      it('recovers when a version bit is flipped', () => {
        const data = randomBits(spec.dataBits, 99)
        const packet = layer.encode(data, name)
        // Flipping a version bit misdirects the schema; the fallback should
        // still find the right one.
        const decoded = layer.decode(flip(packet, [DATA_ECC_BITS + 3]))

        expect(decoded.valid).toBe(true)
        expect([...decoded.data]).toEqual([...data])
      })

      it('pads a short payload with zeros', () => {
        const short = randomBits(8, 5)
        const decoded = layer.decode(layer.encode(short, name))

        expect(decoded.valid).toBe(true)
        expect([...decoded.data.subarray(0, 8)]).toEqual([...short])
        expect([...decoded.data.subarray(8)].every((b) => b === 0)).toBe(true)
      })

      it('rejects a payload larger than the schema holds', () => {
        expect(() => layer.encode(randomBits(spec.dataBits + 1, 3), name)).toThrow(
          /holds/,
        )
      })
    })
  }

  it('rejects a packet of the wrong length', () => {
    expect(() => layer.decode(new Uint8Array(96))).toThrow(/100 bits/)
  })
})
