import type { Condition, Layer } from '@variax-ai/video-schema'
import type { ResolveContext } from './types'
import { lookupVar } from './resolve'

type VarValue = string | number | boolean | undefined

/**
 * The truthiness a `visibleIf` string tests.
 *
 * `"false"` and `"0"` are false as well as `false` and `0`, because vars cross
 * process boundaries as strings — a query parameter, a database column, a form
 * field — and a var that reads `"false"` meaning false, but renders as true, is
 * a silent wrong frame rather than an error.
 */
function isTruthy(value: VarValue): boolean {
  if (value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  return value !== '' && value !== 'false' && value !== '0'
}

/**
 * Compared as strings, so a var that arrives as `"3"` still matches `3`. An
 * unset var matches nothing, including the empty string.
 */
function matches(value: VarValue, expected: string | number | boolean): boolean {
  if (value === undefined) return false
  return String(value) === String(expected)
}

/**
 * Whether a layer's `visibleIf` holds. An absent condition always holds; one
 * that cannot be evaluated never does, so a typo'd predicate hides a layer
 * rather than drawing one the author meant to leave out.
 */
export function conditionHolds(condition: Condition | undefined, resolve: ResolveContext): boolean {
  if (condition === undefined) return true

  if (typeof condition === 'string') return isTruthy(lookupVar(condition, resolve))

  if (typeof condition !== 'object' || condition === null || typeof condition.var !== 'string') {
    // Malformed document. Nothing else in the renderer throws on one bad layer.
    return false
  }

  const value = lookupVar(condition.var, resolve)
  let held: boolean
  if (condition.equals !== undefined) {
    held = matches(value, condition.equals)
  } else if (condition.in !== undefined) {
    held = Array.isArray(condition.in) && condition.in.some(candidate => matches(value, candidate))
  } else {
    held = isTruthy(value)
  }

  return condition.not ? !held : held
}

/** Whether a layer is drawn at all: its time window and its condition. */
export function layerIsVisible(layer: Layer, tMs: number, resolve: ResolveContext): boolean {
  if (layer.startMs !== undefined && tMs < layer.startMs) return false
  if (layer.endMs !== undefined && tMs >= layer.endMs) return false
  return conditionHolds(layer.visibleIf, resolve)
}
