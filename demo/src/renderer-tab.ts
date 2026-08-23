import type { VideoDocument } from '@variax-ai/video-schema'
import { createDocumentDrawer } from '@variax-ai/video-renderer'

type VarValue = string | number | boolean

export interface RendererTab {
  /** Replace the document, reset the vars panel, and redraw. */
  load(doc: VideoDocument): void
  /** The document currently drawn, for the other tabs to work from. */
  current(): { doc: VideoDocument; canvas: HTMLCanvasElement; timeMs: number } | null
  pause(): void
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export function initRendererTab(): RendererTab {
  const textarea = $<HTMLTextAreaElement>('json-input')
  const canvas = $<HTMLCanvasElement>('preview-canvas')
  const errorEl = $('json-error')
  const playBtn = $<HTMLButtonElement>('play-btn')
  const resetBtn = $<HTMLButtonElement>('reset-btn')
  const timeDisplay = $('time-display')
  const scrub = $<HTMLInputElement>('scrub')
  const sceneChips = $('scene-chips')
  const varsPanel = $('vars-panel')

  const ctx = canvas.getContext('2d')!

  let doc: VideoDocument | null = null
  let drawer: ReturnType<typeof createDocumentDrawer> | null = null
  let vars: Record<string, VarValue> = {}
  let playing = false
  let startTime = 0
  let currentTime = 0
  let animId = 0

  /** Defaults declared by the document. A var with no default stays unset. */
  function defaultVars(d: VideoDocument): Record<string, VarValue> {
    const out: Record<string, VarValue> = {}
    for (const [name, def] of Object.entries(d.vars ?? {})) {
      if (def?.default !== undefined) out[name] = def.default as VarValue
    }
    return out
  }

  // Rebuilt rather than mutated: `createDocumentDrawer` resolves defs and
  // indexes layers once, so the vars it captured are fixed for its lifetime.
  function rebuild(): void {
    if (!doc) return
    drawer = createDocumentDrawer(doc, { vars, images: {} })
    drawAt(currentTime)
  }

  function drawAt(tMs: number): void {
    if (!drawer || !doc) return
    currentTime = tMs
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawer(ctx, tMs)
    timeDisplay.textContent = `${(tMs / 1000).toFixed(3)}s`
    scrub.value = String(tMs)
    for (const chip of sceneChips.querySelectorAll<HTMLElement>('.chip')) {
      const start = Number(chip.dataset.start)
      const end = Number(chip.dataset.end)
      chip.classList.toggle('on', tMs >= start && tMs < end)
    }
  }

  function buildSceneChips(d: VideoDocument): void {
    sceneChips.replaceChildren(
      ...d.scenes.map((scene) => {
        const chip = document.createElement('button')
        chip.className = 'chip'
        chip.textContent = `${scene.id} · ${(scene.startMs / 1000).toFixed(1)}s`
        chip.dataset.start = String(scene.startMs)
        chip.dataset.end = String(scene.endMs)
        chip.addEventListener('click', () => {
          pause()
          drawAt(scene.startMs)
        })
        return chip
      }),
    )
  }

  // One control per declared var, typed from the declaration. This is what
  // makes `visibleIf` and `$var:` visible as behaviour rather than as prose.
  function buildVarsPanel(d: VideoDocument): void {
    const entries = Object.entries(d.vars ?? {})
    if (entries.length === 0) {
      varsPanel.innerHTML = '<p class="hint">This document declares no <code>vars</code>.</p>'
      return
    }

    varsPanel.replaceChildren(
      ...entries.map(([name, def]) => {
        const row = document.createElement('div')
        row.className = 'field'

        const label = document.createElement('label')
        label.textContent = name
        label.htmlFor = `var-${name}`
        row.append(label)

        const type = def?.type ?? 'string'
        const input = document.createElement('input')
        input.id = `var-${name}`
        input.type = type === 'boolean' ? 'checkbox' : type === 'number' ? 'number' : 'text'
        if (type === 'boolean') input.checked = Boolean(vars[name])
        else input.value = vars[name] === undefined ? '' : String(vars[name])

        input.addEventListener('input', () => {
          vars = {
            ...vars,
            [name]:
              type === 'boolean'
                ? input.checked
                : type === 'number'
                  ? Number(input.value)
                  : input.value,
          }
          rebuild()
        })

        row.append(input)
        return row
      }),
    )
  }

  function load(next: VideoDocument): void {
    doc = next
    vars = defaultVars(next)
    canvas.width = next.width
    canvas.height = next.height
    scrub.max = String(next.durationMs)
    currentTime = Math.min(currentTime, next.durationMs)
    buildSceneChips(next)
    buildVarsPanel(next)
    rebuild()
  }

  function loop(timestamp: number): void {
    if (!playing || !doc) return
    drawAt((timestamp - startTime) % doc.durationMs)
    animId = requestAnimationFrame(loop)
  }

  function play(): void {
    if (!drawer) return
    playing = true
    startTime = performance.now() - currentTime
    playBtn.textContent = 'Pause'
    animId = requestAnimationFrame(loop)
  }

  function pause(): void {
    playing = false
    playBtn.textContent = 'Play'
    cancelAnimationFrame(animId)
  }

  playBtn.addEventListener('click', () => (playing ? pause() : play()))

  resetBtn.addEventListener('click', () => {
    pause()
    drawAt(0)
  })

  scrub.addEventListener('input', () => {
    pause()
    drawAt(Number(scrub.value))
  })

  let parseTimeout: ReturnType<typeof setTimeout>
  textarea.addEventListener('input', () => {
    clearTimeout(parseTimeout)
    parseTimeout = setTimeout(() => {
      try {
        const parsed = JSON.parse(textarea.value) as VideoDocument
        errorEl.textContent = ''
        pause()
        currentTime = 0
        load(parsed)
      } catch (e) {
        errorEl.textContent = (e as Error).message
      }
    }, 300)
  })

  return {
    load(next: VideoDocument) {
      pause()
      currentTime = 0
      textarea.value = JSON.stringify(next, null, 2)
      errorEl.textContent = ''
      try {
        load(next)
      } catch (e) {
        errorEl.textContent = (e as Error).message
      }
    },
    current() {
      return doc ? { doc, canvas, timeMs: currentTime } : null
    },
    pause,
  }
}
