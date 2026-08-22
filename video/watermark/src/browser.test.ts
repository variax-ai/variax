/**
 * Guards the package's claim to work in a browser.
 *
 * The main entry is documented as platform-neutral, but nothing was enforcing
 * it and the claim had already quietly become false: `loadModelBytes` guards
 * its on-disk cache behind `isNode()`, yet a static `import('node:fs/promises')`
 * is resolved by bundlers at *build* time, so a browser build failed on a
 * branch it would never run. Worse, tsup rewrote the specifier to a bare
 * `"fs/promises"`, which reads as a missing npm package rather than as a Node
 * builtin.
 *
 * Bundling the entry for a browser target is the only check that catches this:
 * every unit test here passes under Node regardless.
 */

import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const entry = (name: string) => fileURLToPath(new URL(name, import.meta.url))

describe('browser compatibility', () => {
  it('bundles the main entry for a browser target', async () => {
    const result = await build({
      entryPoints: [entry('./index.ts')],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      logLevel: 'silent',
    })

    expect(result.errors).toEqual([])
  })

  it('pulls in no Node builtins', async () => {
    const result = await build({
      entryPoints: [entry('./index.ts')],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      logLevel: 'silent',
    })

    const code = result.outputFiles[0].text
    // The runtime-composed specifiers must stay composed: if a refactor turns
    // one back into a literal, the bundle above starts failing to resolve.
    for (const builtin of ['"node:fs', '"fs/promises"', '"node:path"', '"path"']) {
      expect(code, `bundle should not contain ${builtin}`).not.toContain(
        `import(${builtin}`,
      )
    }
  })

  it('still resolves the Node cache path at runtime under Node', async () => {
    // The flip side: making the specifier opaque to bundlers must not break the
    // import actually working where it is meant to.
    const { loadModelBytes } = await import('./models')
    await expect(
      loadModelBytes('does-not-exist.onnx', {
        cacheDir: fileURLToPath(new URL('.', import.meta.url)),
        modelsUrl: 'https://127.0.0.1:1/',
      }),
    ).rejects.toThrow()
  })
})
