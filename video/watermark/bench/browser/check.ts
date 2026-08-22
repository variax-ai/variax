/**
 * Serves the browser check: `npm run check:browser`.
 *
 * The automated suite proves the entry *bundles* for a browser and that the ort
 * adapter works against onnxruntime-web under Node. Neither runs the code in an
 * actual browser engine. This does — but it needs a human to read the result,
 * which is why it is a script rather than a test.
 *
 * Everything is staged into a temp directory: the bundle, onnxruntime-web's
 * WASM assets, and the models (served locally so the check does not pull 64MB
 * from Adobe on every run).
 */

import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT ?? 5174)
const MODELS =
  process.env.VARIAX_WATERMARK_MODELS ??
  join(here, '../../node_modules/.cache/variax-watermark')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
}

const INDEX = `<!doctype html>
<html><head><meta charset="utf-8"><title>checking…</title></head><body>
<h1>@variax-ai/video-watermark in the browser</h1>
<pre id="out" style="font:13px/1.5 ui-monospace,monospace"></pre>
<script type="module" src="/bundle.js"></script>
</body></html>
`

async function stage(): Promise<string> {
  const dir = join(tmpdir(), 'variax-wm-browser-check')
  await mkdir(join(dir, 'models'), { recursive: true })

  console.log('bundling the page for a browser target...')
  await build({
    entryPoints: [join(here, 'page.ts')],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    outfile: join(dir, 'bundle.js'),
    logLevel: 'warning',
  })

  // onnxruntime-web loads its WASM at runtime, so the assets must sit next to
  // the bundle (matching `ort.env.wasm.wasmPaths = '/'` in page.ts).
  const ortDist = join(dirname(require.resolve('onnxruntime-web')), '.')
  for (const file of await readdir(ortDist)) {
    if (file.endsWith('.wasm') || file.endsWith('.mjs')) {
      await copyFile(join(ortDist, file), join(dir, file))
    }
  }

  if (!existsSync(MODELS)) {
    throw new Error(
      `no models at ${MODELS}. Run the test suite once with VARIAX_WATERMARK_E2E=1 ` +
        'to populate the cache, or point VARIAX_WATERMARK_MODELS at a directory ' +
        'holding encoder_Q.onnx and decoder_Q.onnx.',
    )
  }
  for (const file of await readdir(MODELS)) {
    if (file.endsWith('.onnx')) {
      await copyFile(join(MODELS, file), join(dir, 'models', file))
    }
  }

  await writeFile(join(dir, 'index.html'), INDEX)
  return dir
}

async function main(): Promise<void> {
  const dir = await stage()

  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const file = path === '/' ? '/index.html' : path

    try {
      const body = await readFile(join(dir, file))
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })

  server.listen(PORT, () => {
    console.log(`\n  open http://localhost:${PORT}\n`)
    console.log('  The page reports PASS or FAIL, in the body and the tab title.')
    console.log('  Ctrl-C to stop.\n')
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
