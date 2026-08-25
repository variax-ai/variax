import { describe, expect, it } from 'vitest'
import { DataLayer, SCHEMAS, type SchemaName } from './datalayer'
import { maxContentId, packPayload, unpackPayload } from './payload'

describe('payload', () => {
  const layer = new DataLayer()

  for (const spec of SCHEMAS) {
    const name = spec.name as SchemaName

    describe(name, () => {
      it('fills the schema capacity exactly', () => {
        expect(packPayload({ contentId: 1 }, name)).toHaveLength(spec.dataBits)
      })

      it('survives a full round trip through the data layer', () => {
        // Stays under 40 bits so the case is valid for BCH_SUPER too, the
        // narrowest schema.
        const payload = { contentId: 123456789n }
        const packet = layer.encode(packPayload(payload, name), name)
        const decoded = layer.decode(packet)

        expect(decoded.valid).toBe(true)
        expect(unpackPayload(decoded.data, decoded.schema)).toEqual(payload)
      })

      it('carries the largest id the schema can hold', () => {
        const payload = { contentId: maxContentId(name) }
        const decoded = layer.decode(layer.encode(packPayload(payload, name), name))

        expect(decoded.valid).toBe(true)
        expect(unpackPayload(decoded.data, decoded.schema)).toEqual(payload)
      })

      it('takes a plain number for a small id', () => {
        const bits = packPayload({ contentId: 7 }, name)
        expect(unpackPayload(bits, name)).toEqual({ contentId: 7n })
      })

      it('rejects an id that does not fit', () => {
        expect(() => packPayload({ contentId: maxContentId(name) + 1n }, name)).toThrow(
          /contentId is/,
        )
      })

      it('rejects a negative or fractional id', () => {
        expect(() => packPayload({ contentId: -1 }, name)).toThrow(/non-negative/)
        expect(() => packPayload({ contentId: -1n }, name)).toThrow(/non-negative/)
        expect(() => packPayload({ contentId: 1.5 }, name)).toThrow(/integer/)
      })

      it('rejects a number too large to be exact rather than rounding it', () => {
        expect(() => packPayload({ contentId: 2 ** 60 }, name)).toThrow(/bigint/)
      })

      it('refuses what BigInt would have swallowed', () => {
        // `BigInt('')`, `BigInt([])` and `BigInt(false)` are all 0n. An untyped
        // caller passing a missing id must not mark content as id 0.
        for (const value of ['', [], false, '0x10', ' 5 ', null, undefined]) {
          expect(() =>
            packPayload({ contentId: value as never }, name),
          ).toThrow(/contentId must be a bigint or a number/)
        }
      })
    })
  }

  it('keeps a content id stable across schemas', () => {
    // One field spanning the payload means a roomier schema only adds leading
    // zeros, so the same id reads back the same whichever schema a render
    // happened to use.
    const ids = SCHEMAS.map((spec) => {
      const name = spec.name as SchemaName
      const decoded = layer.decode(
        layer.encode(packPayload({ contentId: 0xdeadbeefn }, name), name),
      )
      return unpackPayload(decoded.data, decoded.schema).contentId
    })
    expect(new Set(ids)).toEqual(new Set([0xdeadbeefn]))
  })

  it('holds ids past the range a number carries exactly', () => {
    // The default schema's 61 bits outrun the 53 a double holds, which is the
    // whole reason the field is a bigint.
    const id = maxContentId('BCH_5')
    expect(id).toBe(2n ** 61n - 1n)
    expect(BigInt(Number(id))).not.toBe(id)

    const bits = packPayload({ contentId: id }, 'BCH_5')
    expect(unpackPayload(bits, 'BCH_5')).toEqual({ contentId: id })
  })
})
