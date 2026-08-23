import type { VideoDocument } from '@variax-ai/video-schema'
import {
  extractDocument,
  parseResponse,
  validateDocument,
} from '@variax-ai/video-extractor'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

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
  // human is the model: sampling parks on this resolver, and pressing "parse"
  // hands the reply back to `extractDocument`, which validates it as usual.
  let awaitingReply: ((doc: VideoDocument) => void) | null = null
  let objectUrl: string | null = null
  let thumbUrls: string[] = []

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(file)
    video.src = objectUrl
    sampleBtn.disabled = false
    errorEl.textContent = ''
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
    sampleBtn.disabled = true
    sampleBtn.textContent = 'Sampling…'

    extractDocument({
      source: video,
      sampleCount: Number(sampleCount.value),
      infer: async (request) => {
        showFrames(request.frames)
        promptOut.value = request.prompt
        promptMeta.textContent = `${request.width}×${request.height} · ${request.durationMs}ms · ${request.fps}fps · ${request.frames.length} frames`
        copyBtn.disabled = false
        sampleBtn.textContent = 'Waiting for a reply…'
        return new Promise<VideoDocument>((resolve) => {
          awaitingReply = resolve
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
        awaitingReply = null
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

    if (awaitingReply) {
      awaitingReply(parsed as VideoDocument)
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
