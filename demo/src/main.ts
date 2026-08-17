import type { VideoDocument } from '@variax-ai/video-schema'
import { createDocumentDrawer } from '@variax-ai/video-renderer'

const sampleDocument: VideoDocument = {
  version: 1,
  width: 540,
  height: 960,
  fps: 30,
  durationMs: 5000,
  tokens: {
    brand: '#6c4df6',
    bg: '#0a0a0a',
    fg: '#e5e5e5',
  },
  scenes: [
    {
      id: 'intro',
      startMs: 0,
      endMs: 5000,
      background: '$token:bg',
      layers: [
        {
          type: 'shape',
          shape: 'roundedRect',
          size: [200, 200],
          radius: 24,
          fill: '$token:brand',
          transform: {
            position: { keyframes: [
              { t: 0, value: [170, 380], easing: 'easeOutCubic' },
              { t: 2000, value: [170, 380] },
            ]},
            rotation: { keyframes: [
              { t: 0, value: 0, easing: 'easeInOut' },
              { t: 2500, value: 360 },
            ]},
            opacity: { keyframes: [
              { t: 0, value: 0, easing: 'easeOutCubic' },
              { t: 500, value: 1 },
            ]},
          },
        },
        {
          type: 'text',
          content: 'Variax',
          font: { size: 48, weight: 700 },
          color: '$token:fg',
          align: 'center',
          position: [270, 700],
          transform: {
            opacity: { keyframes: [
              { t: 500, value: 0, easing: 'easeOutCubic' },
              { t: 1200, value: 1 },
            ]},
          },
        },
        {
          type: 'text',
          content: 'Declarative Video Format',
          font: { size: 20 },
          color: '#a3a3a3',
          align: 'center',
          position: [270, 750],
          transform: {
            opacity: { keyframes: [
              { t: 800, value: 0, easing: 'easeOutCubic' },
              { t: 1500, value: 1 },
            ]},
          },
        },
      ],
    },
  ],
}

const textarea = document.getElementById('json-input') as HTMLTextAreaElement
const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement
const errorEl = document.getElementById('json-error')!
const playBtn = document.getElementById('play-btn')!
const resetBtn = document.getElementById('reset-btn')!
const timeDisplay = document.getElementById('time-display')!

textarea.value = JSON.stringify(sampleDocument, null, 2)

const ctx = canvas.getContext('2d')!

let currentDrawer: ReturnType<typeof createDocumentDrawer> | null = null
let currentDoc: VideoDocument | null = null
let playing = false
let startTime = 0
let currentTime = 0
let animId = 0

function buildDrawer(doc: VideoDocument) {
  currentDoc = doc
  canvas.width = doc.width
  canvas.height = doc.height
  currentDrawer = createDocumentDrawer(doc, {
    vars: {},
    images: {},
  })
  drawAtTime(1500)
}

function drawAtTime(tMs: number) {
  if (!currentDrawer) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  currentDrawer(ctx, tMs)
  timeDisplay.textContent = `${(tMs / 1000).toFixed(3)}s`
}

function loop(timestamp: number) {
  if (!playing || !currentDoc) return
  const elapsed = timestamp - startTime
  currentTime = elapsed % currentDoc.durationMs
  drawAtTime(currentTime)
  animId = requestAnimationFrame(loop)
}

function play() {
  if (!currentDrawer) return
  playing = true
  startTime = performance.now() - currentTime
  playBtn.textContent = 'Pause'
  animId = requestAnimationFrame(loop)
}

function pause() {
  playing = false
  playBtn.textContent = 'Play'
  cancelAnimationFrame(animId)
}

playBtn.addEventListener('click', () => {
  if (playing) pause()
  else play()
})

resetBtn.addEventListener('click', () => {
  pause()
  currentTime = 0
  drawAtTime(0)
})

let parseTimeout: ReturnType<typeof setTimeout>
textarea.addEventListener('input', () => {
  clearTimeout(parseTimeout)
  parseTimeout = setTimeout(() => {
    try {
      const doc = JSON.parse(textarea.value) as VideoDocument
      errorEl.textContent = ''
      pause()
      currentTime = 0
      buildDrawer(doc)
    } catch (e) {
      errorEl.textContent = (e as Error).message
    }
  }, 300)
})

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    const panelId = `${(tab as HTMLElement).dataset.tab}-panel`
    document.getElementById(panelId)?.classList.add('active')
  })
})

// Initial render
try {
  buildDrawer(sampleDocument)
} catch (e) {
  errorEl.textContent = (e as Error).message
}
