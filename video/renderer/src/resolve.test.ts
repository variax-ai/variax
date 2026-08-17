import { describe, it, expect } from 'vitest'
import { resolveString, resolveColor, resolveNumberVar } from './resolve'
import type { ResolveContext } from './types'

const ctx: ResolveContext = {
  vars: { message: 'hello', count: 42, flag: true },
  tokens: { brand500: '#6c4df6', accent: '#ffb020' },
}

describe('resolveString', () => {
  it('returns plain strings unchanged', () => {
    expect(resolveString('hello world', ctx)).toBe('hello world')
  })

  it('resolves $var: references', () => {
    expect(resolveString('$var:message', ctx)).toBe('hello')
    expect(resolveString('$var:count', ctx)).toBe('42')
  })

  it('resolves $token: references', () => {
    expect(resolveString('$token:brand500', ctx)).toBe('#6c4df6')
  })

  it('returns empty string for missing var', () => {
    expect(resolveString('$var:missing', ctx)).toBe('')
  })

  it('returns empty string for missing token', () => {
    expect(resolveString('$token:missing', ctx)).toBe('')
  })
})

describe('resolveColor', () => {
  it('returns undefined for undefined input', () => {
    expect(resolveColor(undefined, ctx)).toBeUndefined()
  })

  it('resolves token colors', () => {
    expect(resolveColor('$token:accent', ctx)).toBe('#ffb020')
  })

  it('passes through hex colors', () => {
    expect(resolveColor('#ff0000', ctx)).toBe('#ff0000')
  })
})

describe('resolveNumberVar', () => {
  it('returns numbers directly', () => {
    expect(resolveNumberVar(42, ctx)).toBe(42)
  })

  it('resolves $var: number references', () => {
    expect(resolveNumberVar('$var:count', ctx)).toBe(42)
  })

  it('returns 0 for non-number vars', () => {
    expect(resolveNumberVar('$var:message', ctx)).toBe(0)
  })
})
