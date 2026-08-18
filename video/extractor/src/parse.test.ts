import { describe, it, expect } from 'vitest'
import { parseResponse } from './parse'

describe('parseResponse', () => {
  const minimal = { version: 1, width: 100, height: 100 }

  it('parses raw JSON', () => {
    const result = parseResponse(JSON.stringify(minimal))
    expect(result).toEqual(minimal)
  })

  it('extracts JSON from markdown fences', () => {
    const text = 'Here is the result:\n```json\n{"version":1}\n```\nDone.'
    expect(parseResponse(text)).toEqual({ version: 1 })
  })

  it('extracts JSON from fences without language tag', () => {
    const text = '```\n{"version":1}\n```'
    expect(parseResponse(text)).toEqual({ version: 1 })
  })

  it('extracts JSON from text with preamble', () => {
    const text = 'The document is: {"version":1}'
    expect(parseResponse(text)).toEqual({ version: 1 })
  })

  it('extracts JSON from text with trailing content', () => {
    const text = '{"version":1} -- end'
    expect(parseResponse(text)).toEqual({ version: 1 })
  })

  it('handles nested objects', () => {
    const nested = { version: 1, scenes: [{ id: 's1' }] }
    const text = `Result:\n\`\`\`json\n${JSON.stringify(nested)}\n\`\`\``
    expect(parseResponse(text)).toEqual(nested)
  })

  it('throws on empty input', () => {
    expect(() => parseResponse('')).toThrow('No JSON object found')
  })

  it('throws on input with no JSON', () => {
    expect(() => parseResponse('no json here')).toThrow('No JSON object found')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseResponse('{invalid}')).toThrow()
  })
})
