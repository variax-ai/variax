import { describe, it, expect } from 'vitest'
import type { VideoDocument } from '@variax-ai/video-schema'
import { renderCallStream } from './snapshot-helpers'
import { createStubCtx } from './test-helpers'

/**
 * A baseline document exercising the layer types and animation forms that
 * existed before the trail/per-axis/constraints work. Its call stream must not
 * move: any diff here is a visual regression in existing rendering.
 */
const baselineDoc = {
  version: 1,
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 4000,
  tokens: { brand: '#6c4df6', ink: '#241f3d' },
  assets: {
    heading: { type: 'font', family: 'Lilita One', weight: 400, src: 'fonts/lilita.woff2' },
  },
  scenes: [
    {
      id: 'one',
      startMs: 0,
      endMs: 2000,
      background: '$token:ink',
      layers: [
        {
          type: 'image',
          asset: 'photo',
          frame: { x: 60, y: 200, w: 960, h: 960, radius: 48 },
          effects: [{ type: 'downscaleBlur', radius: 56, shrink: 20 }],
        },
        {
          type: 'shape',
          shape: 'roundedRect',
          size: [800, 300],
          radius: 40,
          fill: '$token:brand',
          position: [540, 1400],
          transform: {
            anchor: [540, 1400],
            scale: { keyframes: [{ t: 0, value: 0.5, easing: 'easeOutBack' }, { t: 600, value: 1 }] },
            opacity: { keyframes: [{ t: 0, value: 0 }, { t: 400, value: 1 }] },
          },
          persist: true,
        },
        {
          type: 'group',
          position: [540, 1400],
          children: [
            {
              type: 'text',
              content: 'Prove it',
              font: { asset: 'heading', size: 96 },
              color: '#ffffff',
              position: [0, 0],
            },
          ],
        },
      ],
    },
    {
      id: 'two',
      startMs: 2000,
      endMs: 4000,
      background: '#000000',
      layers: [
        {
          type: 'repeater',
          count: 3,
          phaseOffsetMs: 200,
          child: {
            type: 'shape',
            shape: 'ellipse',
            size: [200, 200],
            position: [540, 800],
            transform: { rotation: { generator: { fn: 'pulse', params: { from: 0, to: 360, periodMs: 1000 } } } },
            stroke: { color: '#ffffff', width: 6 },
          },
        },
        {
          type: 'text',
          content: { template: 'x{n} and counting', bindings: { n: { type: 'countUp', target: 42, durationMs: 800 } } },
          font: { size: 84 },
          position: [540, 1560],
        },
      ],
    },
  ],
} as unknown as VideoDocument

const IMAGE_STUB = { width: 1200, height: 1200 } as unknown as CanvasImageSource

/** Offscreen canvases record into their own stub ctx; only the outer composite
 *  lands in the snapshot, which is what we care about. */
function makeCanvas(width: number, height: number): HTMLCanvasElement {
  return { width, height, getContext: () => createStubCtx() } as unknown as HTMLCanvasElement
}

describe('rendering regression baseline', () => {
  it('produces a stable call stream across the clip', () => {
    const stream = renderCallStream(
      baselineDoc,
      {
        vars: {},
        images: { photo: IMAGE_STUB },
        createCanvas: makeCanvas,
      },
      [0, 300, 700, 1500, 2000, 2400, 3000, 3900],
    )
    expect(stream).toMatchSnapshot()
  })
})
