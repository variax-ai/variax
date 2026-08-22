import { describe, expect, it } from 'vitest'
import { DataLayer, SCHEMAS, type SchemaName } from './datalayer'
import {
  TEMPLATE_ID_BITS,
  layoutFor,
  maxValue,
  packPayload,
  unpackPayload,
} from './payload'

describe('payload', () => {
  const layer = new DataLayer()

  for (const spec of SCHEMAS) {
    const name = spec.name as SchemaName

    describe(name, () => {
      it('fills the schema capacity exactly', () => {
        const layout = layoutFor(name)
        expect(layout.templateId + layout.renderId).toBe(spec.dataBits)
      })

      it('survives a full round trip through the data layer', () => {
        // renderId stays under 8 bits so this case is valid for BCH_SUPER too,
        // which leaves only 40 - 32 = 8 bits for it.
        const payload = { templateId: 123456, renderId: 200 }
        const packet = layer.encode(packPayload(payload, name), name)
        const decoded = layer.decode(packet)

        expect(decoded.valid).toBe(true)
        expect(unpackPayload(decoded.data, decoded.schema)).toEqual(payload)
      })

      it('carries the largest values each field can hold', () => {
        const layout = layoutFor(name)
        const payload = {
          templateId: maxValue(layout.templateId),
          renderId: maxValue(layout.renderId),
        }
        const decoded = layer.decode(layer.encode(packPayload(payload, name), name))

        expect(decoded.valid).toBe(true)
        expect(unpackPayload(decoded.data, decoded.schema)).toEqual(payload)
      })

      it('defaults renderId to zero', () => {
        const bits = packPayload({ templateId: 7 }, name)
        expect(unpackPayload(bits, name)).toEqual({ templateId: 7, renderId: 0 })
      })

      it('rejects a template id that does not fit', () => {
        expect(() =>
          packPayload({ templateId: maxValue(TEMPLATE_ID_BITS) + 1 }, name),
        ).toThrow(/templateId/)
      })

      it('rejects a negative or fractional id', () => {
        expect(() => packPayload({ templateId: -1 }, name)).toThrow(/non-negative/)
        expect(() => packPayload({ templateId: 1.5 }, name)).toThrow(/integer/)
      })
    })
  }

  it('keeps a template id stable across schemas', () => {
    // The whole point of pinning templateId to 32 bits: the same id must read
    // back the same way whichever schema a render happened to use.
    const ids = SCHEMAS.map((spec) => {
      const name = spec.name as SchemaName
      const decoded = layer.decode(
        layer.encode(packPayload({ templateId: 0xdeadbeef }, name), name),
      )
      return unpackPayload(decoded.data, decoded.schema).templateId
    })
    expect(new Set(ids)).toEqual(new Set([0xdeadbeef]))
  })
})
