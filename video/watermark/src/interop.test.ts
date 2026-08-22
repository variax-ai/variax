/**
 * Cross-implementation tests against adobe/trustmark.
 *
 * Everything else in this package can pass while being subtly wrong: an
 * encoder and decoder that share a bug agree with each other perfectly. These
 * vectors were produced by running Adobe's own `python/trustmark/datalayer.py`
 * unmodified (see `bench/README.md` for how to regenerate them), so matching
 * them bit-for-bit is what actually establishes that a mark we write can be
 * read by their tooling — and by anything else built against TrustMark.
 */

import { describe, expect, it } from 'vitest'
import { DataLayer, type SchemaName } from './datalayer'
import vectors from './__fixtures__/trustmark-datalayer-vectors.json'

interface Vector {
  mode: number
  schema: string
  dataBits: number
  eccBits: number
  secret: string
  packet: string
}

function toBits(s: string): Uint8Array {
  return Uint8Array.from([...s], (c) => (c === '1' ? 1 : 0))
}

function toString(bits: Uint8Array): string {
  return [...bits].join('')
}

describe('interoperability with adobe/trustmark', () => {
  const layer = new DataLayer()
  const cases = vectors as Vector[]

  it('has vectors covering every schema', () => {
    expect(new Set(cases.map((c) => c.schema)).size).toBe(4)
  })

  for (const [index, vector] of cases.entries()) {
    describe(`${vector.schema} vector ${index}`, () => {
      it('produces a bit-identical packet', () => {
        const packet = layer.encode(
          toBits(vector.secret),
          vector.schema as SchemaName,
        )
        expect(toString(packet)).toBe(vector.packet)
      })

      it('decodes their packet back to the original payload', () => {
        const decoded = layer.decode(toBits(vector.packet))

        expect(decoded.valid).toBe(true)
        expect(decoded.schema).toBe(vector.schema)
        expect(toString(decoded.data)).toBe(vector.secret)
      })

      it('decodes their packet after damage within the correction budget', () => {
        const damaged = toBits(vector.packet)
        // The BCH field has m = 7, so ecc_bits = 7t and t is the correction
        // budget. Spread the flips out rather than clustering them.
        const t = vector.eccBits / 7
        const stride = Math.floor(96 / t)
        for (let i = 0; i < t; i++) {
          damaged[(i * stride + 5) % 96] ^= 1
        }

        const decoded = layer.decode(damaged)
        expect(decoded.valid).toBe(true)
        expect(toString(decoded.data)).toBe(vector.secret)
      })
    })
  }
})
