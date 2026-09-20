import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv'

const schema = JSON.parse(readFileSync(new URL('../json/v1.json', import.meta.url), 'utf8'))
const validate = new Ajv().compile(schema)

function document(layer = { type: 'text', content: 'Hello' }) {
  return {
    version: 1,
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 1000,
    scenes: [{ id: 'intro', startMs: 0, endMs: 1000, layers: [layer] }],
  }
}

function assertValid(doc) {
  assert.equal(validate(doc), true, JSON.stringify(validate.errors))
}

test('existing layers without metadata remain valid', () => {
  assertValid(document())
})

test('metadata is optional and may be empty', () => {
  assertValid(document({ type: 'text', content: 'Hello', metadata: {} }))
})

test('every semantic role is valid on a layer', () => {
  const roles = [
    'hook', 'headline', 'caption', 'cta', 'result', 'score', 'logo', 'product',
    'subject', 'background', 'decoration',
  ]

  for (const role of roles) {
    assertValid(document({ id: `${role}-title`, type: 'text', content: role, metadata: { role } }))
  }
})

test('metadata rejects unknown roles and fields', () => {
  assert.equal(validate(document({ type: 'text', content: 'Hello', metadata: { role: 'tagline' } })), false)
  assert.equal(validate(document({ type: 'text', content: 'Hello', metadata: { audience: 'new' } })), false)
})

test('metadata survives JSON serialization', () => {
  const original = document({
    id: 'victory-title',
    type: 'text',
    content: 'Victory!',
    metadata: { role: 'result' },
  })
  const roundTripped = JSON.parse(JSON.stringify(original))

  assertValid(roundTripped)
  assert.deepEqual(roundTripped, original)
})
