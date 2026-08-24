import type { Watermarker } from '@variax-ai/video-watermark'
// ort loads its WASM at runtime rather than through the import graph, so the
// binary has to be handed to it as a URL. Asking Vite for one keeps the file
// versioned with the package and rewritten for the deployed base path, instead
// of pointing a CDN URL at a build that has to be kept in step by hand.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/**
 * A number field's value when it is a usable positive number, else `fallback`.
 *
 * `Number('')` is 0, so an empty field reads as a deliberate zero unless it is
 * rejected here — and zero strength embeds nothing at all.
 */
function positiveField(raw: string, fallback: number): number {
  const value = Number(raw)
  return raw.trim() !== '' && Number.isFinite(value) && value > 0 ? value : fallback
}

export interface WatermarkTabOptions {
  /** The frame to mark: whatever the renderer tab is currently showing. */
  sourceFrame(): { canvas: HTMLCanvasElement; timeMs: number } | null
}

export function initWatermarkTab({ sourceFrame }: WatermarkTabOptions): void {
  const runBtn = $<HTMLButtonElement>('wm-run')
  const templateId = $<HTMLInputElement>('template-id')
  const renderId = $<HTMLInputElement>('render-id')
  const schemaSelect = $<HTMLSelectElement>('wm-schema')
  const strength = $<HTMLInputElement>('wm-strength')
  const sourceCanvas = $<HTMLCanvasElement>('wm-source')
  const markedCanvas = $<HTMLCanvasElement>('wm-marked')
  const diffCanvas = $<HTMLCanvasElement>('wm-diff')
  const logEl = $('wm-log')
  const errorEl = $('wm-error')

  let lines: string[] = []
  const log = (line: string) => {
    lines = [...lines, line]
    logEl.textContent = lines.join('\n')
  }
  // Clears the panel too: a run that fails before its first `log` would
  // otherwise show an error beside the previous run's results.
  const clearLog = () => {
    lines = []
    logEl.textContent = ''
  }

  // The encoder alone is 17.3MB, so the watermarker is built once and kept. This
  // demo extracts as well as embeds, so it pulls the 47.4MB decoder too — but
  // only when the first extraction asks for it.
  let watermarker: Watermarker | null = null

  async function ensureWatermarker(): Promise<Watermarker> {
    if (watermarker) return watermarker

    // Both are heavy and neither is needed until the button is pressed, so the
    // renderer tab does not pay for them. `/wasm` is the CPU-only build — one
    // WASM binary rather than the WebGPU-enabled one, which is all a page
    // asking for the `wasm` execution provider will load anyway.
    const [ort, { Watermarker: WM, createRuntime }] = await Promise.all([
      import('onnxruntime-web/wasm'),
      import('@variax-ai/video-watermark'),
    ])

    // Multi-threaded WASM needs cross-origin isolation, which GitHub Pages does
    // not provide. Single-threaded is what a plain static page gets.
    ort.env.wasm.numThreads = 1
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }

    const started = performance.now()
    log('fetching the TrustMark encoder (17.3MB, first run only)…')
    watermarker = await WM.create({
      runtime: createRuntime(ort as never, { executionProviders: ['wasm'] }),
    })
    log(`encoder ready in ${Math.round(performance.now() - started)}ms`)
    return watermarker
  }

  /** Amplified |a − b|, so a mark designed to be invisible can be seen. */
  function drawDifference(a: ImageData, b: ImageData, gain: number): void {
    const out = new ImageData(a.width, a.height)
    for (let i = 0; i < a.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        out.data[i + c] = Math.min(255, Math.abs(a.data[i + c] - b.data[i + c]) * gain)
      }
      out.data[i + 3] = 255
    }
    paint(diffCanvas, out)
  }

  function psnr(a: ImageData, b: ImageData): number {
    let sum = 0
    let count = 0
    for (let i = 0; i < a.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const d = a.data[i + c] - b.data[i + c]
        sum += d * d
        count += 1
      }
    }
    const mse = sum / count
    return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse)
  }

  function paint(canvas: HTMLCanvasElement, image: ImageData): void {
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')!.putImageData(image, 0, 0)
  }

  runBtn.addEventListener('click', () => {
    void (async () => {
      errorEl.textContent = ''
      clearLog()
      runBtn.disabled = true
      try {
        const frame = sourceFrame()
        if (!frame) throw new Error('Render something on the Renderer tab first.')

        const src = frame.canvas
          .getContext('2d')!
          .getImageData(0, 0, frame.canvas.width, frame.canvas.height)
        paint(sourceCanvas, src)
        log(`source: ${src.width}×${src.height} at ${(frame.timeMs / 1000).toFixed(3)}s`)

        const wm = await ensureWatermarker()

        const payload = {
          templateId: Number(templateId.value),
          renderId: Number(renderId.value),
        }

        const embedStart = performance.now()
        // `Frame` is structurally an ImageData, so a canvas frame goes straight in.
        const marked = await wm.embedFrame(src, payload, {
          schema: schemaSelect.value as never,
          // `EmbedOptions.strength` falls back with `??`, so a 0 from an empty
          // field would be taken as a real strength: no residual, a frame
          // identical to the source, and an extraction failure that reads as a
          // broken package rather than as bad input.
          strength: positiveField(strength.value, 1),
        })
        log(`embedded in ${Math.round(performance.now() - embedStart)}ms`)

        // Copied rather than adopted: the returned buffer is typed as any
        // ArrayBufferLike, and ImageData insists on a plain ArrayBuffer.
        const markedImage = new ImageData(
          new Uint8ClampedArray(marked.data),
          marked.width,
          marked.height,
        )
        paint(markedCanvas, markedImage)
        drawDifference(src, markedImage, 20)
        log(`PSNR ${psnr(src, markedImage).toFixed(1)} dB`)

        // First extraction of the session pays for the decoder download.
        log('extracting (fetches the 47.4MB decoder on first run)…')
        const extractStart = performance.now()
        const found = await wm.extract([marked])
        log(`extracted in ${Math.round(performance.now() - extractStart)}ms`)
        log(
          found.valid
            ? `recovered ${JSON.stringify(found.payload)} — ${found.bitflips} bit flips corrected, confidence ${found.confidence.toFixed(2)}`
            : `error correction failed (confidence ${found.confidence.toFixed(2)})`,
        )

        // The negative control is the point of the exercise: without it, a
        // decoder that always returned the same number would look like a pass.
        const control = await wm.extract([src])
        log(
          control.valid
            ? `control: unmarked frame decoded ${JSON.stringify(control.payload)} — suspicious`
            : 'control: unmarked frame decodes to nothing, as it should',
        )
      } catch (e) {
        errorEl.textContent = (e as Error).message
      } finally {
        runBtn.disabled = false
      }
    })()
  })
}
