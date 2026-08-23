import type { VideoDocument } from '@variax-ai/video-schema'
import {
  extractDocument,
  parseResponse,
  validateDocument,
} from '@variax-ai/video-extractor'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/**
 * A number field's value, clamped, or `fallback` when the field is unusable.
 *
 * The blank check is not redundant: `Number('')` is 0, so an empty field is
 * otherwise indistinguishable from a typed zero and would clamp to `min`
 * rather than fall back to what the field was showing.
 */
function fieldNumber(raw: string, min: number, max: number, fallback: number): number {
  if (raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export interface ExtractorTabOptions {
  /** Called with the validated document, once the pipeline completes. */
  onDocument(doc: VideoDocument): void
}

export function initExtractorTab({ onDocument }: ExtractorTabOptions): void {
  const fileInput = $<HTMLInputElement>('video-input')
  const video = $<HTMLVideoElement>('source-video')
  const sampleCount = $<HTMLInputElement>('sample-count')
  const sampleBtn = $<HTMLButtonElement>('sample-btn')
  const strip = $('frame-strip')
  const promptOut = $<HTMLTextAreaElement>('prompt-output')
  const promptMeta = $('prompt-meta')
  const copyBtn = $<HTMLButtonElement>('copy-prompt')
  const reply = $<HTMLTextAreaElement>('model-reply')
  const parseBtn = $<HTMLButtonElement>('parse-btn')
  const errorEl = $('extractor-error')

  // The real pipeline expects an `infer` that returns a document. Here the
  // human is the model: sampling parks on these callbacks, and pressing "parse"
  // hands the reply back to `extractDocument`, which validates it as usual.
  let awaiting: {
    resolve(doc: VideoDocument): void
    reject(reason: Error): void
  } | null = null
  let objectUrl: string | null = null
  let thumbUrls: string[] = []

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(file)
    video.src = objectUrl
    // A run parked on a reply belongs to the video that was sampled. Ending it
    // here is what lets the button be re-enabled without a second run quietly
    // taking over the first one's resolver — and its rejection is the message
    // the user should be left with, so only clear the error when there is no
    // run to cancel.
    if (awaiting) {
      awaiting.reject(new Error('Cancelled: a different video was selected.'))
    } else {
      errorEl.textContent = ''
    }
    sampleBtn.disabled = false
  })

  function showFrames(frames: { data: Uint8Array; timeMs: number }[]): void {
    for (const url of thumbUrls) URL.revokeObjectURL(url)
    thumbUrls = frames.map((frame) =>
      URL.createObjectURL(new Blob([frame.data as BlobPart], { type: 'image/png' })),
    )
    strip.replaceChildren(
      ...thumbUrls.map((url, i) => {
        const img = document.createElement('img')
        img.src = url
        img.title = `${frames[i].timeMs}ms`
        return img
      }),
    )
  }

  sampleBtn.addEventListener('click', () => {
    errorEl.textContent = ''
    // Output belongs to one run. Clearing it here keeps a run that fails during
    // sampling from leaving the previous video's frames and prompt on screen
    // beside the new error.
    strip.replaceChildren()
    promptOut.value = ''
    promptMeta.textContent = ''
    copyBtn.disabled = true
    sampleBtn.disabled = true
    sampleBtn.textContent = 'Sampling…'

    extractDocument({
      source: video,
      // The `min`/`max` attributes only bind on form submission, so an empty or
      // junk field would otherwise reach the pipeline as 0 or NaN and sample no
      // frames at all — while still building a prompt that claims to have some.
      sampleCount: fieldNumber(sampleCount.value, 1, 20, 6),
      infer: async (request) => {
        showFrames(request.frames)
        promptOut.value = request.prompt
        promptMeta.textContent = `${request.width}×${request.height} · ${request.durationMs}ms · ${request.fps}fps · ${request.frames.length} frames`
        copyBtn.disabled = false
        sampleBtn.textContent = 'Waiting for a reply…'
        return new Promise<VideoDocument>((resolve, reject) => {
          awaiting = { resolve, reject }
        })
      },
    })
      .then((doc) => {
        onDocument(doc)
      })
      .catch((e: unknown) => {
        errorEl.textContent = (e as Error).message
      })
      .finally(() => {
        awaiting = null
        sampleBtn.disabled = false
        sampleBtn.textContent = 'Sample frames & build prompt'
      })
  })

  copyBtn.addEventListener('click', () => {
    void navigator.clipboard.writeText(promptOut.value)
    copyBtn.textContent = 'Copied'
    setTimeout(() => (copyBtn.textContent = 'Copy prompt'), 1200)
  })

  parseBtn.addEventListener('click', () => {
    errorEl.textContent = ''
    let parsed: unknown
    try {
      parsed = parseResponse(reply.value)
    } catch (e) {
      // Keep the pipeline parked: a bad paste should cost a retry, not the run.
      errorEl.textContent = (e as Error).message
      return
    }

    if (awaiting) {
      awaiting.resolve(parsed as VideoDocument)
      return
    }

    // Nothing sampled — a pasted document is still worth loading, so run it
    // through the same validation the pipeline would have applied.
    try {
      onDocument(validateDocument(parsed))
    } catch (e) {
      errorEl.textContent = (e as Error).message
    }
  })
}
