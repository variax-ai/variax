/**
 * A VideoDocument representative of what Variax actually renders.
 *
 * Deliberately the hard case for this style of watermark: a flat brand-colour
 * background, large clean type, hard-edged shapes, and no photographic texture
 * anywhere. Benchmarking on photographs would produce numbers that look good
 * and mean nothing for this product.
 */

import type { VideoDocument } from '@variax-ai/video-schema'

export const BRAND = '#6c4df6'

export function benchDocument(width = 1920, height = 1080): VideoDocument {
  const cx = width / 2

  return {
    version: 1,
    width,
    height,
    fps: 30,
    durationMs: 4000,
    tokens: {
      brand: BRAND,
      accent: '#f6c44d',
      ink: '#14141e',
      paper: '#ffffff',
    },
    scenes: [
      {
        id: 'title',
        startMs: 0,
        endMs: 2000,
        background: '$token:brand',
        layers: [
          {
            type: 'shape',
            shape: 'roundedRect',
            size: [820, 220],
            radius: 24,
            fill: '$token:paper',
            position: [cx, height * 0.42],
          },
          {
            type: 'text',
            content: 'Quarterly Revenue',
            color: '$token:ink',
            align: 'center',
            font: { size: 84, weight: 700 },
            position: [cx, height * 0.42],
          },
          {
            type: 'shape',
            shape: 'ellipse',
            size: [260, 260],
            fill: '$token:accent',
            position: [width * 0.82, height * 0.78],
            transform: {
              scale: {
                keyframes: [
                  { t: 0, value: 0.4 },
                  { t: 1200, value: 1, easing: 'easeOutCubic' },
                ],
              },
            },
          },
        ],
      },
      {
        id: 'stat',
        startMs: 2000,
        endMs: 4000,
        background: '$token:ink',
        layers: [
          {
            type: 'text',
            content: '+38%',
            color: '$token:accent',
            align: 'center',
            font: { size: 180, weight: 800 },
            position: [cx, height * 0.45],
          },
          {
            type: 'text',
            content: 'year over year',
            color: '$token:paper',
            align: 'center',
            font: { size: 56, weight: 400 },
            position: [cx, height * 0.62],
          },
          {
            type: 'shape',
            shape: 'rect',
            size: [width * 0.6, 8],
            fill: '$token:brand',
            position: [cx, height * 0.72],
          },
        ],
      },
    ],
  }
}
