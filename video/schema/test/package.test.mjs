import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// The schema is the canonical format, so a consumer must be able to reach it at
// runtime — that is the whole point of publishing it. These guard the two ways
// it can silently stop being reachable: dropped from `files` (published but
// empty) or dropped from `exports` (present in the tarball but unresolvable).
test('json/ is published', () => {
  assert.ok(pkg.files.includes('json'), '"json" missing from package.json files')
})

test('the schema has a subpath export', () => {
  assert.equal(pkg.exports['./json/v1.json'], './json/v1.json')
})

test('the subpath resolves to a readable draft-07 schema', async () => {
  const url = import.meta.resolve('@variax-ai/video-schema/json/v1.json')
  const schema = JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  assert.equal(schema.$id, 'https://variax.dev/schemas/video/v1.json')
  assert.equal(schema.title, 'VideoDocument')
  assert.deepEqual(schema.properties.version, { type: 'integer', const: 1 })
})

test('the published schema is the one the types were generated from', () => {
  const fromRepo = readFileSync(new URL('../json/v1.json', import.meta.url), 'utf8')
  const fromExport = readFileSync(fileURLToPath(import.meta.resolve('@variax-ai/video-schema/json/v1.json')), 'utf8')
  assert.equal(fromExport, fromRepo)
})
