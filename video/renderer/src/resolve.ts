import type { ResolveContext } from './types'

export const VAR_PREFIX = '$var:'
export const TOKEN_PREFIX = '$token:'

/**
 * The value of a var, or undefined when the document does not set one.
 *
 * Own properties only: `'toString' in vars` is true for every document, and a
 * ref that landed on `Object.prototype` would otherwise resolve to a function —
 * truthy, stringifiable, and wrong. Accepts a bare name as readily as a
 * `$var:` reference, so callers that already know they hold a name need not
 * strip anything.
 */
export function lookupVar(ref: string, ctx: ResolveContext): string | number | boolean | undefined {
  const name = ref.startsWith(VAR_PREFIX) ? ref.slice(VAR_PREFIX.length) : ref
  return Object.prototype.hasOwnProperty.call(ctx.vars, name) ? ctx.vars[name] : undefined
}

/** The value of a token, by the same rules as `lookupVar`. */
export function lookupToken(ref: string, ctx: ResolveContext): string | undefined {
  const name = ref.startsWith(TOKEN_PREFIX) ? ref.slice(TOKEN_PREFIX.length) : ref
  return Object.prototype.hasOwnProperty.call(ctx.tokens, name) ? ctx.tokens[name] : undefined
}

export function resolveString(value: string, ctx: ResolveContext): string {
  if (value.startsWith(VAR_PREFIX)) {
    const v = lookupVar(value, ctx)
    return v !== undefined ? String(v) : ''
  }
  if (value.startsWith(TOKEN_PREFIX)) {
    return lookupToken(value, ctx) ?? ''
  }
  return value
}

export function resolveColor(value: string | undefined, ctx: ResolveContext): string | undefined {
  if (!value) return undefined
  return resolveString(value, ctx) || undefined
}

export function resolveNumberVar(value: number | string, ctx: ResolveContext): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.startsWith(VAR_PREFIX)) {
    const v = lookupVar(value, ctx)
    return typeof v === 'number' ? v : 0
  }
  return 0
}
