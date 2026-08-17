import type { ResolveContext } from './types'

export function resolveString(value: string, ctx: ResolveContext): string {
  if (value.startsWith('$var:')) {
    const name = value.slice(5)
    const v = ctx.vars[name]
    return v !== undefined ? String(v) : ''
  }
  if (value.startsWith('$token:')) {
    const name = value.slice(7)
    return ctx.tokens[name] ?? ''
  }
  return value
}

export function resolveColor(value: string | undefined, ctx: ResolveContext): string | undefined {
  if (!value) return undefined
  return resolveString(value, ctx) || undefined
}

export function resolveNumberVar(value: number | string, ctx: ResolveContext): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.startsWith('$var:')) {
    const name = value.slice(5)
    const v = ctx.vars[name]
    return typeof v === 'number' ? v : 0
  }
  return 0
}
