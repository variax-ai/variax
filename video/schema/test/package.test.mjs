import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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

// In the workspace, the export path and the repo path are the same file — the
// node_modules entry is a symlink — so reading both proves nothing about what
// ships. Ask npm what the tarball would contain instead.
test('the schema is in the tarball npm would publish', () => {
  const packageDir = fileURLToPath(new URL('..', import.meta.url))
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: packageDir, encoding: 'utf8' }),
  )
  const paths = packed.files.map(f => f.path)
  assert.ok(paths.includes('json/v1.json'), `json/v1.json missing from the tarball: ${paths.join(', ')}`)
  assert.ok(paths.includes('dist/v1.d.ts'), 'the types are missing from the tarball')
  assert.ok(packed.files.find(f => f.path === 'json/v1.json').size > 0, 'the packed schema is empty')
})
