import { describe, expect, it } from 'vitest'
import type { Planar } from './frame'
import { resizePlanar } from './resize'
import vectors from './__fixtures__/pil-resize-vectors.json'

interface Vector {
  in: [number, number]
  out: [number, number]
  mean: number
  max: number
  min: number
  sampleIndices: number[]
  sampleValues: number[]
}

/** Must match `source()` in the fixture generator exactly. */
function source(width: number, height: number): Planar {
  const data = new Float32Array(3 * width * height)
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = (x * 7 + y * 13 + c * 29 + ((x * y) % 17) * 15) % 256
        data[c * width * height + y * width + x] = v
      }
    }
  }
  return { width, height, channels: 3, data }
}

describe('resizePlanar', () => {
  describe('matches PIL bilinear', () => {
    for (const vector of vectors as Vector[]) {
      const [w, h] = vector.in
      const [ow, oh] = vector.out

      it(`${w}x${h} -> ${ow}x${oh}`, () => {
        const out = resizePlanar(source(w, h), ow, oh)
        expect(out.data.length).toBe(3 * ow * oh)

        let sum = 0
        let max = -Infinity
        let min = Infinity
        for (const v of out.data) {
          sum += v
          if (v > max) max = v
          if (v < min) min = v
        }

        // PIL rounds to uint8; we stay in float. Tolerances absorb that half
        // step but nothing larger — a wrong resampler misses by far more.
        expect(sum / out.data.length).toBeCloseTo(vector.mean, 0)
        expect(max).toBeGreaterThan(vector.max - 2)
        expect(min).toBeLessThan(vector.min + 2)

        for (const [i, index] of vector.sampleIndices.entries()) {
          expect(out.data[index], `index ${index}`).toBeCloseTo(
            vector.sampleValues[i],
            -0.7, // within ~1 uint8 step
          )
        }
      })
    }
  })

  it('area-averages when downscaling rather than point-sampling', () => {
    // A checkerboard averages to mid-grey under a scaled filter, but to a
    // single extreme value under naive point sampling. This is the property
    // that makes the difference for a 1080p frame reduced to 256px.
    const size = 64
    const data = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[y * size + x] = (x + y) % 2 === 0 ? 0 : 255
      }
    }
    const out = resizePlanar({ width: size, height: size, channels: 1, data }, 4, 4)

    for (const v of out.data) expect(v).toBeGreaterThan(100)
    for (const v of out.data) expect(v).toBeLessThan(155)
  })

  it('resamples only the crop box when given one', () => {
    const size = 8
    const data = new Float32Array(size * size)
    // Left half 0, right half 100.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) data[y * size + x] = x < 4 ? 0 : 100
    }
    const src = { width: size, height: size, channels: 1, data }

    // PIL clamps the filter window to the image, not to the box, so the column
    // nearest the seam picks up values from outside the crop. These are PIL's
    // own numbers (it reports 88 and 13 after rounding to uint8).
    const right = resizePlanar(src, 2, 2, { x: 4, y: 0, width: 4, height: 8 })
    expect([...right.data]).toEqual([87.5, 100, 87.5, 100])

    const left = resizePlanar(src, 2, 2, { x: 0, y: 0, width: 4, height: 8 })
    expect([...left.data]).toEqual([0, 12.5, 0, 12.5])
  })

  it('preserves a constant image at any scale', () => {
    const data = new Float32Array(10 * 10).fill(42)
    const src = { width: 10, height: 10, channels: 1, data }

    for (const [w, h] of [
      [3, 3],
      [10, 10],
      [37, 21],
    ]) {
      const out = resizePlanar(src, w, h)
      for (const v of out.data) expect(v).toBeCloseTo(42, 4)
    }
  })
})
