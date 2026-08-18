import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt'

describe('buildPrompt', () => {
  const metadata = { width: 1920, height: 1080, durationMs: 15000, fps: 30 }

  it('includes video dimensions', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('1920x1080')
  })

  it('includes duration', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('15000ms')
  })

  it('includes fps', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('30')
  })

  it('uses default fps when not provided', () => {
    const prompt = buildPrompt({ width: 100, height: 100, durationMs: 5000 })
    expect(prompt).toContain('30')
  })

  it('describes all 4 MVP layer types', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('ShapeLayer')
    expect(prompt).toContain('TextLayer')
    expect(prompt).toContain('ImageLayer')
    expect(prompt).toContain('GroupLayer')
  })

  it('includes transform schema', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('position')
    expect(prompt).toContain('scale')
    expect(prompt).toContain('rotation')
    expect(prompt).toContain('opacity')
  })

  it('includes easing names', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('easeOutCubic')
    expect(prompt).toContain('easeInOut')
  })

  it('includes conventions', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('milliseconds')
    expect(prompt).toContain('hex')
    expect(prompt).toContain('$token:')
  })

  it('asks for JSON-only output', () => {
    const prompt = buildPrompt(metadata)
    expect(prompt).toContain('ONLY the JSON')
  })
})
