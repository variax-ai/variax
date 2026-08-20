import { describe, it, expect } from 'vitest'
import type { AnimatedPoint } from '@variax-ai/video-schema'
import { evaluatePoint } from './animate'

/**
 * Acceptance for the per-axis point work: Smudge's scratch-hand path, which
 * needed a TypeScript callback, expressed as document data.
 *
 * Reference implementation, verbatim from
 * smudge/packages/game/src/video/templates/taunt.ts:99-111.
 */
const W = 1080
const PEEK_BOX = { x: (W - 840) / 2, y: 320, w: 840, h: 1050 }
const HAND_STROKES = 7
const HAND_INSET_PX = 130
const HAND_WOBBLE_PX = 22
const HAND_START_MS = 3400
const HAND_END_MS = 8800
const SPAN = HAND_END_MS - HAND_START_MS

function handPosAt(tMs: number): { x: number; y: number } {
  const u = Math.min(1, Math.max(0, (tMs - HAND_START_MS) / SPAN))
  const x = W / 2 + (PEEK_BOX.w / 2 - HAND_INSET_PX) * Math.sin(Math.PI * 2 * HAND_STROKES * u)
  const y =
    PEEK_BOX.y +
    HAND_INSET_PX +
    (PEEK_BOX.h - 2 * HAND_INSET_PX) * u +
    HAND_WOBBLE_PX * Math.sin(Math.PI * 4 * HAND_STROKES * u)
  return { x, y }
}

const AMPLITUDE = PEEK_BOX.w / 2 - HAND_INSET_PX

/**
 * The y track's ramp-plus-wobble is baked into keyframes: a document is data,
 * and sampling a curve is data. The wobble runs at 2x the stroke frequency, so
 * the sampling density is set per wobble cycle. Measured worst-case error
 * against the reference curve: 8/cycle 1.55px, 16/cycle 0.42px, 24/cycle
 * 0.19px, 32/cycle 0.11px. 16 is the knee — sub-half-pixel for 225 keyframes.
 */
function bakeY(steps: number) {
  const keyframes = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    keyframes.push({ t: HAND_START_MS + u * SPAN, value: handPosAt(HAND_START_MS + u * SPAN).y })
  }
  return keyframes
}

const handPosition = {
  x: {
    generator: {
      fn: 'sineStrokes',
      params: {
        from: W / 2 - AMPLITUDE,
        to: W / 2 + AMPLITUDE,
        strokes: HAND_STROKES,
        periodMs: SPAN,
        startMs: HAND_START_MS,
      },
    },
  },
  y: { keyframes: bakeY(HAND_STROKES * 2 * 16) },
} as unknown as AnimatedPoint

describe('Smudge scratch-hand path as document data', () => {
  it('reproduces the x sweep exactly', () => {
    for (let tMs = HAND_START_MS; tMs <= HAND_END_MS; tMs += 100) {
      expect(evaluatePoint(handPosition, tMs)[0]).toBeCloseTo(handPosAt(tMs).x, 6)
    }
  })

  it('tracks the y ramp and its wobble to within half a pixel', () => {
    let worst = 0
    for (let tMs = HAND_START_MS; tMs <= HAND_END_MS; tMs += 25) {
      worst = Math.max(worst, Math.abs(evaluatePoint(handPosition, tMs)[1] - handPosAt(tMs).y))
    }
    expect(worst).toBeLessThan(0.5)
  })

  it('is the generator time origin that makes the phase land', () => {
    const unphased = {
      ...(handPosition as { x: unknown; y: unknown }),
      x: { generator: { fn: 'sineStrokes', params: { from: W / 2 - AMPLITUDE, to: W / 2 + AMPLITUDE, strokes: HAND_STROKES, periodMs: SPAN } } },
    } as unknown as AnimatedPoint
    // Without startMs the sweep is phase-shifted, i.e. absolute clip time alone
    // cannot express a curve anchored to a scene.
    expect(evaluatePoint(unphased, HAND_START_MS)[0]).not.toBeCloseTo(handPosAt(HAND_START_MS).x, 1)
  })

  it('starts and ends the sweep at the centre of the peek box', () => {
    expect(evaluatePoint(handPosition, HAND_START_MS)[0]).toBeCloseTo(W / 2, 6)
    expect(evaluatePoint(handPosition, HAND_END_MS)[0]).toBeCloseTo(W / 2, 6)
  })
})
